import * as cheerio from "cheerio";
import fs from "node:fs/promises";
import path from "node:path";
import { exec } from "node:child_process";
import { db } from "./db.js";
import { templateRules, assetRules } from "./schema.js";
import { desc } from "drizzle-orm";
import os from "node:os";
import { logger, logError } from "./logger.js";

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
  logger.debug({ customField }, "Starting asset detection");

  const detected: DetectedAssets = {};

  if (!customField) {
    logger.debug("No custom field provided, skipping asset detection");
    return detected;
  }

  // Get all asset rules
  const rules = await db.select().from(assetRules).all();
  logger.debug({ ruleCount: rules.length }, "Loaded asset rules");

  // Normalize custom field for matching
  const normalizedField = customField.toLowerCase();

  for (const rule of rules) {
    const normalizedKeyword = rule.triggerKeyword.toLowerCase();
    if (normalizedField.includes(normalizedKeyword)) {
      logger.info(
        { 
          keyword: rule.triggerKeyword, 
          assetType: rule.assetType, 
          value: rule.value 
        },
        "Asset rule matched"
      );
      
      if (rule.assetType === 'image') {
        detected.imageAsset = rule.value;
      } else if (rule.assetType === 'font') {
        detected.fontAsset = rule.value;
      } else if (rule.assetType === 'color') {
        detected.colorAsset = rule.value;
      }
    }
  }

  logger.info({ detected }, "Asset detection completed");
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
    logger.info({ imageName, sourcePath, destPath }, "Image copied to temp directory");
    
    // Return Windows path format
    return isWindows ? destPath : `C:\\Temp\\LightBurnAuto\\${imageName}`;
  } catch (error) {
    logError(error, { imageName, sourcePath, operation: "copy_image" });
    throw new Error(`Failed to copy image ${imageName}`);
  }
}

/**
 * Find the best matching template for a given SKU
 * @param sku - The product SKU to match
 * @returns The template filename or null if no match
 */
async function findTemplateForSku(sku: string | null): Promise<string | null> {
  logger.info({ sku }, "Starting SKU template matching");
  
  if (!sku) {
    logger.warn("No SKU provided, returning null");
    return null;
  }

  // Get all rules sorted by priority (descending)
  const rules = await db
    .select()
    .from(templateRules)
    .orderBy(desc(templateRules.priority))
    .all();

  logger.debug({ ruleCount: rules.length }, "Template rules loaded");

  if (rules.length === 0) {
    logger.warn("No template rules configured in database");
    return null;
  }

  // Sort rules by priority (higher first), then by pattern length (longer first)
  const sortedRules = rules.sort((a, b) => {
    if (a.priority !== b.priority) {
      return b.priority - a.priority; // Higher priority first
    }
    return b.skuPattern.length - a.skuPattern.length; // Longer pattern first
  });

  // Normalize SKU for case-insensitive matching
  const normalizedSku = sku.toLowerCase();

  // Find the first rule where the SKU contains the pattern (case-insensitive)
  for (const rule of sortedRules) {
    const normalizedPattern = rule.skuPattern.toLowerCase();
    
    if (normalizedSku.includes(normalizedPattern)) {
      logger.info(
        { 
          sku, 
          pattern: rule.skuPattern, 
          templateFilename: rule.templateFilename,
          priority: rule.priority
        },
        "Template match found"
      );
      return rule.templateFilename;
    }
  }

  logger.warn({ sku }, "No matching template rule found");
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
    logger.info(
      { 
        orderId: order.orderId, 
        sku: order.sku, 
        buyerName: order.buyerName 
      },
      "Starting LightBurn project generation"
    );
    
    const matchedTemplate = await findTemplateForSku(order.sku);
    
    if (!matchedTemplate) {
      const error = new Error(`NO_TEMPLATE_MATCH: No template rule found for SKU: ${order.sku || "(null)"}`);
      logError(error, { orderId: order.orderId, sku: order.sku });
      throw error;
    }

    logger.info({ matchedTemplate }, "Template matched for SKU");
    
    // Construct the full path to the matched template
    const templatesDir = path.dirname(defaultTemplatePath);
    const templatePath = path.join(templatesDir, matchedTemplate);
    
    // Check if the template file exists
    try {
      await fs.access(templatePath);
      logger.info({ templatePath }, "Template file found");
    } catch (error) {
      const notFoundError = new Error(
        `TEMPLATE_FILE_NOT_FOUND: Template file "${matchedTemplate}" not found at path: ${templatePath}`
      );
      logError(notFoundError, { 
        orderId: order.orderId, 
        matchedTemplate, 
        templatePath 
      });
      throw notFoundError;
    }

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
    logger.info({ engravingName, orderId: order.orderId }, "Extracted engraving name");
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
          logger.info(
            { windowsImagePath, orderId: order.orderId },
            "Image injected with Magic Fix (Data='', SourceHash='0')"
          );
        } else {
          logger.warn({ orderId: order.orderId }, "No {{DESIGN_IMAGE}} shape found in template");
        }
      } catch (error) {
        logError(error, { orderId: order.orderId, imageAsset: detectedAssets.imageAsset });
      }
    } else {
      logger.debug({ orderId: order.orderId }, "No image asset detected");
    }

    // Handle font asset
    if (detectedAssets.fontAsset) {
      customerShape.attr("Font", detectedAssets.fontAsset);
      logger.info(
        { font: detectedAssets.fontAsset, orderId: order.orderId },
        "Font applied to text shape"
      );
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
    logger.info({ wslPath, orderId: order.orderId }, "LightBurn file written");

    // Convert WSL path to Windows path
    // /mnt/c/Temp/LightBurnAuto -> C:\Temp\LightBurnAuto
    const windowsPath = `C:\\Temp\\LightBurnAuto\\${filename}`;

    // Launch LightBurn on Windows
    // Using { detached: true } and unref() to prevent blocking the Node server
    const lightBurnPath = 'C:\\Program Files\\LightBurn\\LightBurn.exe';
    const command = `cmd.exe /C start "" "${lightBurnPath}" "${windowsPath}"`;

    const childProcess = exec(command, (error) => {
      if (error) {
        logError(error, { 
          orderId: order.orderId, 
          windowsPath, 
          operation: "launch_lightburn" 
        });
      }
    });

    // Detach the child process so it doesn't block the Node server
    if (childProcess) {
      childProcess.unref();
    }

    logger.info(
      { 
        orderId: order.orderId, 
        windowsPath,
        detectedColor: detectedAssets.colorAsset
      },
      "LightBurn launched successfully"
    );

    return {
      wslPath,
      windowsPath,
      orderId: order.orderId,
      detectedColor: detectedAssets.colorAsset,
    };
  } catch (error) {
    logError(error, { orderId: order.orderId, operation: "generate_lightburn_project" });
    throw new Error(
      `Failed to generate LightBurn project: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}
