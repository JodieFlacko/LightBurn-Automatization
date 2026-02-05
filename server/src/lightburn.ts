import * as cheerio from "cheerio";
import fs from "node:fs/promises";
import path from "node:path";
import { exec } from "node:child_process";

interface Order {
  orderId: string;
  buyerName: string | null;
  customField: string | null;
}

interface LightBurnResult {
  wslPath: string;
  windowsPath: string;
  orderId: string;
}

/**
 * Generate a LightBurn project file from a template by injecting order data
 * @param order - The order data containing buyer information
 * @param templatePath - Path to the LightBurn template file
 * @returns Promise with the generated file paths
 */
export async function generateLightBurnProject(
  order: Order,
  templatePath: string
): Promise<LightBurnResult> {
  try {
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
