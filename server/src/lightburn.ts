import * as cheerio from "cheerio";
import fs from "node:fs/promises";
import path from "node:path";
import { exec, execFile } from "node:child_process";
import { promisify } from "node:util";
import { db } from "./db.js";
import { templateRules, assetRules } from "./schema.js";
import { desc } from "drizzle-orm";
import { logger, logError } from "./logger.js";
import { config } from "./config.js";

const execPromise = promisify(exec);
const execFileAsync = promisify(execFile);

interface Order {
  orderId: string;
  buyerName: string | null;
  customField: string | null;
  sku: string | null;
}

interface LightBurnResult {
  filePath: string;
  orderId: string;
  detectedColor?: string;
}

interface DetectedAssets {
  imageAsset?: string;
  fontAsset?: string;
  colorAsset?: string;
}

/**
 * Execute LightBurn command with retry logic and exponential backoff
 * @param command - The command to execute
 * @param maxRetries - Maximum number of retry attempts (default 2)
 * @returns Promise resolving to the execution result
 */
async function executeLightBurnWithRetry(
  command: string,
  maxRetries: number = 2
): Promise<{ stdout: string; stderr: string }> {
  const timeout = 10000; // 10 seconds per attempt
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      logger.info(
        { attempt, maxRetries: maxRetries + 1, timeout },
        "Attempting to execute LightBurn command"
      );

      const result = await execPromise(command, { timeout });

      logger.info(
        { attempt, stdout: result.stdout, stderr: result.stderr },
        "LightBurn command executed successfully"
      );

      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check for specific error types
      if (lastError.message.includes("ENOENT")) {
        const notFoundError = new Error(
          "LIGHTBURN_NOT_FOUND: LightBurn.exe not found at expected path. Please verify LightBurn is installed at C:\\Program Files\\LightBurn\\LightBurn.exe"
        );
        logError(notFoundError, { attempt, originalError: lastError.message });
        throw notFoundError;
      }

      if (lastError.message.includes("timeout") || lastError.message.includes("ETIMEDOUT")) {
        logger.warn(
          { attempt, maxRetries: maxRetries + 1, timeout },
          "LightBurn command timed out"
        );

        if (attempt <= maxRetries) {
          const delay = Math.pow(2, attempt - 1) * 1000; // Exponential backoff: 1s, 2s, 4s
          logger.info({ attempt, delay }, `Retrying after ${delay}ms delay`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        const timeoutError = new Error(
          `LIGHTBURN_TIMEOUT: LightBurn took too long to respond after ${maxRetries + 1} attempts`
        );
        logError(timeoutError, { attempts: maxRetries + 1, timeout });
        throw timeoutError;
      }

      // For other errors, retry with exponential backoff
      logger.warn(
        { attempt, maxRetries: maxRetries + 1, error: lastError.message },
        "LightBurn command failed"
      );

      if (attempt <= maxRetries) {
        const delay = Math.pow(2, attempt - 1) * 1000; // Exponential backoff: 1s, 2s, 4s
        logger.info({ attempt, delay }, `Retrying after ${delay}ms delay`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        logError(lastError, { totalAttempts: maxRetries + 1, operation: "execute_lightburn" });
        throw lastError;
      }
    }
  }

  // This should never be reached, but TypeScript requires it
  throw lastError || new Error("Failed to execute LightBurn command after all retries");
}

/**
 * Verify that the generated LightBurn file exists and is valid
 * @param filePath - The path to the generated file
 * @param orderId - The order ID for logging purposes
 * @returns Promise resolving when verification succeeds
 */
async function verifyLightBurnFile(filePath: string, orderId: string): Promise<void> {
  logger.info({ filePath, orderId }, "Starting file verification");

  // Wait for file system to flush
  await new Promise((resolve) => setTimeout(resolve, 500));

  try {
    // Check if file exists
    await fs.access(filePath);
    logger.debug({ filePath }, "File exists, checking size");

    // Check file size
    const stats = await fs.stat(filePath);
    const fileSizeBytes = stats.size;

    logger.info(
      { filePath, fileSizeBytes, orderId },
      "File verification: size check"
    );

    if (fileSizeBytes <= 1024) {
      const error = new Error(
        `LIGHTBURN_FILE_VERIFICATION_FAILED: Generated file at ${filePath} is too small (${fileSizeBytes} bytes). Valid .lbrn2 files should be larger than 1024 bytes.`
      );
      logError(error, { filePath, fileSizeBytes, orderId });
      throw error;
    }

    logger.info(
      { filePath, fileSizeBytes, orderId },
      "File verification passed"
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("LIGHTBURN_FILE_VERIFICATION_FAILED")) {
      throw error;
    }

    // File doesn't exist or other access error
    const verificationError = new Error(
      `LIGHTBURN_FILE_VERIFICATION_FAILED: Failed to verify generated file at ${filePath}. ${
        error instanceof Error ? error.message : "File may not exist"
      }`
    );
    logError(verificationError, { filePath, orderId, originalError: error });
    throw verificationError;
  }
}

/**
 * Clean up temporary files that were copied during processing
 * Used to remove orphaned temp files when generation fails
 * @param files - Array of file paths to delete
 */
async function cleanupTempFiles(files: string[]): Promise<void> {
  if (files.length === 0) {
    logger.debug("No temporary files to clean up");
    return;
  }

  logger.info({ fileCount: files.length }, "Starting cleanup of temporary files");

  for (const filePath of files) {
    try {
      await fs.unlink(filePath);
      logger.info({ filePath }, "Successfully deleted temporary file");
    } catch (error) {
      // Don't throw - just log the failure and continue
      logger.warn(
        { 
          filePath, 
          error: error instanceof Error ? error.message : String(error) 
        },
        "Failed to delete temporary file during cleanup"
      );
    }
  }

  logger.info({ fileCount: files.length }, "Temporary file cleanup completed");
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
 * @returns Path to the copied image
 */
async function copyImageToTemp(imageName: string): Promise<string> {
  // Use config paths for assets and temp (native Windows paths)
  const sourcePath = path.join(config.paths.assets, imageName);
  const destPath = path.join(config.paths.temp, imageName);
  
  try {
    await fs.copyFile(sourcePath, destPath);
    logger.info({ imageName, sourcePath, destPath }, "Image copied to temp directory");
    
    return destPath;
  } catch (error) {
    logError(error, { imageName, sourcePath, operation: "copy_image" });
    throw new Error(`Failed to copy image ${imageName}`);
  }
}

/**
 * Find the best matching template for a given SKU and side
 * @param sku - The product SKU to match
 * @param side - The side to match ('front' or 'retro')
 * @returns The template filename or null if no match
 */
async function findTemplateForSku(sku: string | null, side: 'front' | 'retro' = 'front'): Promise<string | null> {
  console.log('=== FIND TEMPLATE START ===');
  console.log('SKU:', sku);
  console.log('Side:', side);
  
  // LOG: Input parameters
  logger.info({ sku, side }, "=== TEMPLATE MATCHING START ===");
  logger.info({ sku, side }, "Input parameters - SKU and side");
  
  if (!sku) {
    console.log('No SKU provided, returning null');
    logger.warn("No SKU provided, returning null");
    return null;
  }

  // Get all rules sorted by priority (descending)
  const rules = await db
    .select()
    .from(templateRules)
    .orderBy(desc(templateRules.priority))
    .all();

  console.log('All rules:', rules);
  console.log('Rule count:', rules.length);
  
  // LOG: Template rules fetched from database
  logger.info({ ruleCount: rules.length }, "Template rules fetched from database");
  logger.info({ rules: rules.map(r => ({ 
    id: r.id, 
    skuPattern: r.skuPattern, 
    templateFilename: r.templateFilename, 
    priority: r.priority 
  })) }, "All template rules (full list)");

  if (rules.length === 0) {
    logger.warn("No template rules configured in database - MATCH FAILED: NO RULES");
    return null;
  }

  // Sort rules by priority (higher first), then by pattern length (longer first)
  const sortedRules = rules.sort((a, b) => {
    if (a.priority !== b.priority) {
      return b.priority - a.priority; // Higher priority first
    }
    return b.skuPattern.length - a.skuPattern.length; // Longer pattern first
  });

  logger.info({ 
    sortedRules: sortedRules.map(r => ({ 
      skuPattern: r.skuPattern, 
      templateFilename: r.templateFilename, 
      priority: r.priority 
    })) 
  }, "Rules sorted by priority (higher first) and pattern length (longer first)");

  // Normalize SKU for case-insensitive matching
  const normalizedSku = sku.toLowerCase();
  logger.info({ originalSku: sku, normalizedSku }, "SKU normalized for case-insensitive matching");
  
  // Determine template suffix based on side
  const sideSuffix = side === 'retro' ? '-retro.lbrn2' : '-fronte.lbrn2';
  const fallbackSuffix = '.lbrn2'; // For backward compatibility with templates without side suffix
  
  logger.info({ side, sideSuffix, fallbackSuffix }, "Template suffix determined based on side");

  // Find the first rule where the SKU contains the pattern (case-insensitive)
  console.log('=== STARTING PATTERN MATCHING LOOP ===');
  logger.info("=== STARTING PATTERN MATCHING LOOP ===");
  
  for (const rule of sortedRules) {
    const normalizedPattern = rule.skuPattern.toLowerCase();
    
    console.log('Testing rule:', rule.id, 'Pattern:', rule.skuPattern, 'Template:', rule.templateFilename);
    
    // LOG: Test each pattern
    logger.info({ 
      ruleId: rule.id,
      skuPattern: rule.skuPattern, 
      normalizedPattern,
      templateFilename: rule.templateFilename,
      normalizedSku,
      side
    }, "Testing pattern against SKU");
    
    const patternMatches = normalizedSku.includes(normalizedPattern);
    console.log('Pattern matches:', patternMatches);
    
    logger.info({ 
      patternMatches, 
      reason: patternMatches 
        ? `SKU '${normalizedSku}' contains pattern '${normalizedPattern}'`
        : `SKU '${normalizedSku}' does NOT contain pattern '${normalizedPattern}'`
    }, "Pattern match test result");
    
    if (patternMatches) {
      const templateName = rule.templateFilename.toLowerCase();
      
      console.log('Pattern matched! Template name:', templateName);
      console.log('Checking side compatibility for side:', side);
      
      logger.info({ 
        templateName, 
        templateFilename: rule.templateFilename,
        side,
        checkingFor: side === 'retro' ? 'ends with -retro.lbrn2' : 'ends with -fronte.lbrn2 OR generic .lbrn2'
      }, "Pattern matched! Checking template side compatibility");
      
      // Check if template matches the requested side
      if (side === 'retro') {
        // For retro, only match templates with -retro suffix
        const isRetroTemplate = templateName.endsWith('-retro.lbrn2');
        console.log('Is retro template:', isRetroTemplate);
        
        logger.info({ 
          isRetroTemplate,
          templateName,
          reason: isRetroTemplate 
            ? `Template '${templateName}' ends with '-retro.lbrn2'` 
            : `Template '${templateName}' does NOT end with '-retro.lbrn2' (skipping)`
        }, "Retro side compatibility check");
        
        if (isRetroTemplate) {
          console.log('✓ MATCH FOUND for retro side:', rule.templateFilename);
          logger.info(
            { 
              sku, 
              pattern: rule.skuPattern, 
              templateFilename: rule.templateFilename,
              priority: rule.priority,
              side
            },
            "✓ MATCH FOUND for retro side"
          );
          return rule.templateFilename;
        } else {
          logger.warn({ 
            sku,
            pattern: rule.skuPattern,
            templateFilename: rule.templateFilename,
            reason: "Template doesn't end with -retro.lbrn2"
          }, "✗ Pattern matched but template not compatible with retro side (continuing search)");
        }
      } else {
        // For front, match templates with -fronte suffix or no suffix (backward compatibility)
        const isFronteTemplate = templateName.endsWith('-fronte.lbrn2');
        const isGenericTemplate = !templateName.endsWith('-retro.lbrn2') && templateName.endsWith('.lbrn2');
        const isFrontCompatible = isFronteTemplate || isGenericTemplate;
        
        console.log('Is fronte template:', isFronteTemplate);
        console.log('Is generic template:', isGenericTemplate);
        console.log('Is front compatible:', isFrontCompatible);
        
        logger.info({ 
          isFronteTemplate,
          isGenericTemplate,
          isFrontCompatible,
          templateName,
          reason: isFrontCompatible
            ? (isFronteTemplate 
                ? `Template '${templateName}' ends with '-fronte.lbrn2'` 
                : `Template '${templateName}' is generic (ends with .lbrn2 but not -retro.lbrn2)`)
            : `Template '${templateName}' is not compatible with front side`
        }, "Front side compatibility check");
        
        if (isFrontCompatible) {
          console.log('✓ MATCH FOUND for front side:', rule.templateFilename);
          logger.info(
            { 
              sku, 
              pattern: rule.skuPattern, 
              templateFilename: rule.templateFilename,
              priority: rule.priority,
              side
            },
            "✓ MATCH FOUND for front side"
          );
          return rule.templateFilename;
        } else {
          logger.warn({ 
            sku,
            pattern: rule.skuPattern,
            templateFilename: rule.templateFilename,
            reason: "Template is retro-specific but front side requested"
          }, "✗ Pattern matched but template not compatible with front side (continuing search)");
        }
      }
    }
  }

  // LOG: No match found
  console.log('✗ NO MATCHING TEMPLATE FOUND');
  console.log('Rules checked:', sortedRules.length);
  
  logger.warn({ 
    sku, 
    normalizedSku,
    side,
    rulesChecked: sortedRules.length,
    reason: "No template rule matched the SKU pattern for the requested side"
  }, "✗ NO MATCHING TEMPLATE FOUND - exhausted all rules");
  
  logger.info("=== TEMPLATE MATCHING END (NO MATCH) ===");
  
  return null;
}

/**
 * Check if a retro template exists for a given SKU
 * @param sku - The product SKU to check
 * @returns True if a retro template exists, false otherwise
 */
export async function hasRetroTemplate(sku: string | null): Promise<boolean> {
  if (!sku) {
    return false;
  }
  
  const retroTemplate = await findTemplateForSku(sku, 'retro');
  return retroTemplate !== null;
}

/**
 * Generate a LightBurn project file from a template by injecting order data
 * @param order - The order data containing buyer information
 * @param defaultTemplatePath - Path to the default LightBurn template file (legacy, now ignored)
 * @param side - The side to process ('front' or 'retro')
 * @returns Promise with the generated file path
 */
export async function generateLightBurnProject(
  order: Order,
  defaultTemplatePath: string,
  side: 'front' | 'retro' = 'front'
): Promise<LightBurnResult> {
  // Track copied image files for cleanup in case of failure
  // NOTE: We keep these files on SUCCESS because LightBurn needs them while the project is open
  // We only clean up on FAILURE to avoid orphaned files in the temp directory
  const copiedFiles: string[] = [];

  try {
    logger.info(
      { 
        orderId: order.orderId, 
        sku: order.sku, 
        buyerName: order.buyerName,
        side
      },
      "Starting LightBurn project generation"
    );
    
    const matchedTemplate = await findTemplateForSku(order.sku, side);
    
    if (!matchedTemplate) {
      const error = new Error(`NO_TEMPLATE_MATCH: No template found for SKU '${order.sku || "(none)"}' (side: ${side})`);
      logError(error, { orderId: order.orderId, sku: order.sku, side });
      throw error;
    }

    logger.info({ matchedTemplate, side }, "Template matched for SKU");
    
    // Use config path for templates (native Windows path in Documents)
    const templatePath = path.join(config.paths.templates, matchedTemplate);
    
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
        const imagePath = await copyImageToTemp(detectedAssets.imageAsset);
        
        // Track the copied file for cleanup in case of later failure
        copiedFiles.push(imagePath);
        logger.debug({ imagePath }, "Tracking copied image file for potential cleanup");
        
        const imageShape = $('Shape[Name="{{DESIGN_IMAGE}}"]');
        
        if (imageShape.length > 0) {
          // The Magic Fix: Set File, empty Data, reset SourceHash
          imageShape.attr("File", imagePath);
          imageShape.attr("Data", "");
          imageShape.attr("SourceHash", "0");
          logger.info(
            { imagePath, orderId: order.orderId },
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

    // Use config path for temp directory (native Windows path)
    const sideLabel = side === 'retro' ? 'retro' : 'fronte';
    const filename = `Order_${order.orderId}_${sideLabel}.lbrn2`;
    const filePath = path.join(config.paths.temp, filename);

    // Save the modified XML
    const modifiedContent = $.xml();
    await fs.writeFile(filePath, modifiedContent, "utf-8");
    logger.info({ filePath, orderId: order.orderId }, "LightBurn file written");

    // Launch LightBurn with path conversion for WSL compatibility
    try {
      // Step 1: Convert path for Windows if running in WSL
      let windowsPath = filePath;

      if (process.platform === 'linux') {
        // Use wslpath -w to convert /mnt/c/... to C:\...
        const { stdout } = await execFileAsync('wslpath', ['-w', filePath]);
        windowsPath = stdout.trim();
        logger.info({ 
          orderId: order.orderId, 
          originalPath: filePath, 
          windowsPath 
        }, `Path converted for Windows: ${filePath} → ${windowsPath}`);
      }

      // Step 2: Launch LightBurn via Windows 'start' command
      // The empty "" is the required window title parameter for the start command syntax
      logger.info(
        { orderId: order.orderId, windowsPath },
        "Launching LightBurn with converted path"
      );

      await execFileAsync('cmd.exe', ['/c', 'start', '""', windowsPath]);

      logger.info(
        { orderId: order.orderId, windowsPath },
        "LightBurn launched successfully"
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logError(error, {
        orderId: order.orderId,
        filePath,
        operation: "launch_lightburn"
      });
      throw new Error(`Failed to launch LightBurn: ${errorMessage}`);
    }

    // Verify the generated file exists and is valid
    logger.info({ orderId: order.orderId, filePath }, "Verifying generated file");
    await verifyLightBurnFile(filePath, order.orderId);

    logger.info(
      { 
        orderId: order.orderId, 
        filePath,
        detectedColor: detectedAssets.colorAsset
      },
      "LightBurn launched and file verified successfully"
    );

    // SUCCESS: Do NOT clean up copied files - LightBurn needs them while the project is open
    // The user will work with the .lbrn2 file which references these images
    logger.debug(
      { orderId: order.orderId, copiedFileCount: copiedFiles.length },
      "Generation succeeded - keeping temp files for LightBurn to use"
    );

    return {
      filePath,
      orderId: order.orderId,
      detectedColor: detectedAssets.colorAsset,
    };
  } catch (error) {
    logError(error, { orderId: order.orderId, operation: "generate_lightburn_project" });
    
    // FAILURE: Clean up any temporary files that were copied before the error occurred
    // This prevents orphaned image files from accumulating in the temp directory
    if (copiedFiles.length > 0) {
      logger.info(
        { orderId: order.orderId, copiedFileCount: copiedFiles.length },
        "Generation failed - cleaning up temporary files"
      );
      
      try {
        await cleanupTempFiles(copiedFiles);
      } catch (cleanupError) {
        // Log cleanup errors but don't let them mask the original error
        logger.warn(
          { 
            orderId: order.orderId, 
            cleanupError: cleanupError instanceof Error ? cleanupError.message : String(cleanupError) 
          },
          "Error during temporary file cleanup after generation failure"
        );
      }
    }
    
    // Re-throw specific error types without wrapping to preserve error codes
    if (error instanceof Error) {
      if (
        error.message.includes("LIGHTBURN_NOT_FOUND") ||
        error.message.includes("LIGHTBURN_TIMEOUT") ||
        error.message.includes("LIGHTBURN_FILE_VERIFICATION_FAILED") ||
        error.message.includes("NO_TEMPLATE_MATCH") ||
        error.message.includes("TEMPLATE_FILE_NOT_FOUND")
      ) {
        throw error;
      }
    }
    
    // Wrap generic errors with context
    throw new Error(
      `Failed to generate LightBurn project: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}
