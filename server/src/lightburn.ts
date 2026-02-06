import * as cheerio from "cheerio";
import fs from "node:fs/promises";
import path from "node:path";
import { exec } from "node:child_process";
import { db } from "./db.js";
import { templateRules } from "./schema.js";
import { desc } from "drizzle-orm";

interface Order {
  orderId: string;
  buyerName: string | null;
  customField: string | null;
  sku: string | null;
}

interface LightBurnResult {
  wslPath: string;
  windowsPath: string;
  orderId: string;
}

/**
 * Find the best matching template for a given SKU
 * @param sku - The product SKU to match
 * @returns The template filename or null if no match
 */
async function findTemplateForSku(sku: string | null): Promise<string | null> {
  console.log("\n=== SKU Template Matching ===");
  console.log("Incoming SKU:", sku);
  
  if (!sku) {
    console.log("No SKU provided, returning null");
    return null;
  }

  // Get all rules sorted by priority (descending)
  const rules = await db
    .select()
    .from(templateRules)
    .orderBy(desc(templateRules.priority))
    .all();

  console.log("Total rules fetched from DB:", rules.length);
  console.log("Rules:", JSON.stringify(rules, null, 2));

  if (rules.length === 0) {
    console.log("No rules configured in database");
    return null;
  }

  // Sort rules by priority (higher first), then by pattern length (longer first)
  const sortedRules = rules.sort((a, b) => {
    if (a.priority !== b.priority) {
      return b.priority - a.priority; // Higher priority first
    }
    return b.skuPattern.length - a.skuPattern.length; // Longer pattern first
  });

  console.log("Rules after sorting by priority/length:", 
    sortedRules.map(r => ({ pattern: r.skuPattern, priority: r.priority }))
  );

  // Normalize SKU for case-insensitive matching
  const normalizedSku = sku.toLowerCase();
  console.log("Normalized SKU for matching:", normalizedSku);

  // Find the first rule where the SKU contains the pattern (case-insensitive)
  for (const rule of sortedRules) {
    const normalizedPattern = rule.skuPattern.toLowerCase();
    console.log(`Checking pattern "${rule.skuPattern}" (normalized: "${normalizedPattern}") against SKU`);
    
    if (normalizedSku.includes(normalizedPattern)) {
      console.log(`✓ MATCH FOUND! Pattern "${rule.skuPattern}" matches SKU "${sku}"`);
      console.log(`  → Using template: ${rule.templateFilename}`);
      return rule.templateFilename;
    } else {
      console.log(`  ✗ No match (SKU doesn't contain pattern)`);
    }
  }

  console.log("No matching rule found, will use default template");
  return null;
}

/**
 * Generate a LightBurn project file from a template by injecting order data
 * @param order - The order data containing buyer information
 * @param defaultTemplatePath - Path to the default LightBurn template file
 * @returns Promise with the generated file paths
 */
export async function generateLightBurnProject(
  order: Order,
  defaultTemplatePath: string
): Promise<LightBurnResult> {
  try {
    console.log("\n=== Template Selection for Order ===");
    console.log("Order ID:", order.orderId);
    console.log("Order SKU:", order.sku);
    console.log("Default template path:", defaultTemplatePath);
    
    const matchedTemplate = await findTemplateForSku(order.sku);
    
    if (!matchedTemplate) {
      console.error("✗ NO TEMPLATE MATCH: No rule configured for this SKU");
      console.log("=== End Template Selection ===\n");
      throw new Error(`NO_TEMPLATE_MATCH: No template rule found for SKU: ${order.sku || "(null)"}`);
    }

    console.log(`\nMatched template filename: "${matchedTemplate}"`);
    
    // Construct the full path to the matched template
    const templatesDir = path.dirname(defaultTemplatePath);
    const templatePath = path.join(templatesDir, matchedTemplate);
    
    console.log("Templates directory:", templatesDir);
    console.log("Full path to matched template:", templatePath);
    
    // Check if the template file exists
    try {
      await fs.access(templatePath);
      console.log("✓ Template file exists, using it");
    } catch (error) {
      console.error(
        `✗ Template file "${matchedTemplate}" not found at path: ${templatePath}`
      );
      console.error("Error details:", error instanceof Error ? error.message : error);
      throw new Error(
        `TEMPLATE_FILE_NOT_FOUND: Template file "${matchedTemplate}" not found at path: ${templatePath}`
      );
    }

    console.log("Final template path being used:", templatePath);
    console.log("=== End Template Selection ===\n");

    // Read the template file
    const templateContent = await fs.readFile(templatePath, "utf-8");

    // Parse XML with cheerio in XML mode
    const $ = cheerio.load(templateContent, { xmlMode: true });

    // Find the Shape element with Name="{{CUSTOMER_NAME}}" and update the Str attribute
    const customerShape = $('Shape[Name="{{CUSTOMER_NAME}}"]');
    
    if (customerShape.length === 0) {
      throw new Error('Template does not contain a Shape with Name="{{CUSTOMER_NAME}}"');
    }

    // Update the Str attribute with the buyer's name (or use a default if null)
    const buyerName = order.buyerName || "Customer";
    customerShape.attr("Str", buyerName);

    // Prepare the output directory (WSL path)
    const outputDir = "/mnt/c/Temp/LightBurnAuto";
    await fs.mkdir(outputDir, { recursive: true });

    // Generate the output filename
    const filename = `Order_${order.orderId}.lbrn2`;
    const wslPath = path.join(outputDir, filename);

    // Save the modified XML
    const modifiedContent = $.xml();
    await fs.writeFile(wslPath, modifiedContent, "utf-8");

    // Convert WSL path to Windows path
    // /mnt/c/Temp/LightBurnAuto -> C:\Temp\LightBurnAuto
    const windowsPath = `C:\\Temp\\LightBurnAuto\\${filename}`;

    // Launch LightBurn on Windows
    // Using { detached: true } and unref() to prevent blocking the Node server
    const lightBurnPath = 'C:\\Program Files\\LightBurn\\LightBurn.exe';
    const command = `cmd.exe /C start "" "${lightBurnPath}" "${windowsPath}"`;

    const childProcess = exec(command, (error) => {
      if (error) {
        console.error(`Error launching LightBurn: ${error.message}`);
      }
    });

    // Detach the child process so it doesn't block the Node server
    if (childProcess) {
      childProcess.unref();
    }

    return {
      wslPath,
      windowsPath,
      orderId: order.orderId,
    };
  } catch (error) {
    throw new Error(
      `Failed to generate LightBurn project: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}
