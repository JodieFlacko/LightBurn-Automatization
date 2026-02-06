import * as cheerio from "cheerio";
import fs from "node:fs/promises";
import path from "node:path";
import { exec } from "node:child_process";
import { db } from "./db.js";
import { templateRules, assetRules } from "./schema.js";
import { desc } from "drizzle-orm";
import os from "node:os";

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
  detectedColor?: string;
}

interface DetectedAssets {
  imageAsset?: string;
  fontAsset?: string;
  colorAsset?: string;
}

/**
 * Extract the engraving name from custom field text
 * Looks for "Engrave:" or "Name:" keywords and extracts the following text
 * @param customField - The custom field text to parse
 * @returns The extracted name, or empty string if not found
 */
function extractEngravingName(customField: string | null): string {
  if (!customField) {
    return "";
  }

  // Look for "Engrave:" or "Name:" (case-insensitive)
  const regex = /(?:Engrave|Name)\s*:\s*([^,]+)/i;
  const match = customField.match(regex);
  
  if (match && match[1]) {
    // Extract and trim the captured group
    return match[1].trim();
  }
  
  // If no match found, return empty string
  return "";
}

/**
 * Detect assets based on custom field text
 * @param customField - The custom field text to scan
 * @returns Detected assets
 */
async function detectAssets(customField: string | null): Promise<DetectedAssets> {
  console.log("\n=== Asset Detection ===");
  console.log("Custom field:", customField);

  const detected: DetectedAssets = {};

  if (!customField) {
    console.log("No custom field provided");
    return detected;
  }

  // Get all asset rules
  const rules = await db.select().from(assetRules).all();
  console.log("Total asset rules:", rules.length);

  // Normalize custom field for matching
  const normalizedField = customField.toLowerCase();

  for (const rule of rules) {
    const normalizedKeyword = rule.triggerKeyword.toLowerCase();
    if (normalizedField.includes(normalizedKeyword)) {
      console.log(`✓ Matched keyword "${rule.triggerKeyword}" for type "${rule.assetType}"`);
      
      if (rule.assetType === 'image') {
        detected.imageAsset = rule.value;
      } else if (rule.assetType === 'font') {
        detected.fontAsset = rule.value;
      } else if (rule.assetType === 'color') {
        detected.colorAsset = rule.value;
      }
    }
  }

  console.log("Detected assets:", detected);
  console.log("=== End Asset Detection ===\n");
  return detected;
}

/**
 * Copy image to temp directory
 * @param imageName - Name of the image file
 * @returns Windows path to the copied image
 */
async function copyImageToTemp(imageName: string): Promise<string> {
  const sourcePath = path.join(process.cwd(), "assets", imageName);
  
  // Determine temp directory based on OS
  const isWindows = os.platform() === "win32";
  const tempDir = isWindows ? "C:\\Temp\\LightBurnAuto" : "/mnt/c/Temp/LightBurnAuto";
  
  await fs.mkdir(tempDir, { recursive: true });
  
  const destPath = path.join(tempDir, imageName);
  
  try {
    await fs.copyFile(sourcePath, destPath);
    console.log(`✓ Copied image from ${sourcePath} to ${destPath}`);
    
    // Return Windows path format
    return isWindows ? destPath : `C:\\Temp\\LightBurnAuto\\${imageName}`;
  } catch (error) {
    console.error(`✗ Failed to copy image: ${error}`);
    throw new Error(`Failed to copy image ${imageName}`);
  }
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

    // Extract the engraving name from the custom field
    const engravingName = extractEngravingName(order.customField);
    console.log(`Extracted engraving name: "${engravingName}"`);
    customerShape.attr("Str", engravingName);

    // Detect assets from custom field
    const detectedAssets = await detectAssets(order.customField);

    // Handle image asset (copy and swap)
    if (detectedAssets.imageAsset) {
      try {
        const windowsImagePath = await copyImageToTemp(detectedAssets.imageAsset);
        const imageShape = $('Shape[Name="{{DESIGN_IMAGE}}"]');
        
        if (imageShape.length > 0) {
          // The Magic Fix: Set File, empty Data, reset SourceHash
          imageShape.attr("File", windowsImagePath);
          imageShape.attr("Data", "");
          imageShape.attr("SourceHash", "0");
          console.log(`✓ Updated image path to: ${windowsImagePath}`);
          console.log(`✓ Applied image injection fix: Data="", SourceHash="0"`);
        } else {
          console.log("⚠ Warning: No shape with Name={{DESIGN_IMAGE}} found");
        }
      } catch (error) {
        console.error(`✗ Failed to process image asset: ${error}`);
      }
    } else {
      console.log("ℹ No image asset matched for this order");
    }

    // Handle font asset
    if (detectedAssets.fontAsset) {
      customerShape.attr("Font", detectedAssets.fontAsset);
      console.log(`✓ Updated font to: ${detectedAssets.fontAsset}`);
    }

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
      detectedColor: detectedAssets.colorAsset,
    };
  } catch (error) {
    throw new Error(
      `Failed to generate LightBurn project: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}
