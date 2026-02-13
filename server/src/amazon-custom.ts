import axios from "axios";
import AdmZip from "adm-zip";
import { logger } from "./logger.js";

/**
 * Amazon Custom data extracted from the JSON file
 */
export interface AmazonCustomData {
  fontFamily: string | null;
  colorName: string | null;
  designName: string | null;
  frontText: string | null;
  backText1: string | null;
  backText2: string | null;
  backText3: string | null;
  backText4: string | null;
}

/**
 * Downloads a ZIP file from the customized-url, extracts the JSON,
 * and parses the Amazon Custom data.
 * 
 * @param url - The URL to the Amazon Custom ZIP file
 * @returns Parsed custom data or throws an error
 */
export async function processCustomZip(url: string): Promise<AmazonCustomData> {
  try {
    logger.info({ url }, "Downloading Amazon Custom ZIP");

    // Download ZIP file as buffer
    const response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 30000, // 30 second timeout
    });

    const zipBuffer = Buffer.from(response.data);
    const zip = new AdmZip(zipBuffer);
    const zipEntries = zip.getEntries();

    // Find and extract the JSON file
    const jsonEntry = zipEntries.find((entry) => entry.entryName.endsWith(".json"));
    
    if (!jsonEntry) {
      throw new Error("No JSON file found in ZIP");
    }

    const jsonContent = jsonEntry.getData().toString("utf8");
    const data = JSON.parse(jsonContent);

    logger.info({ jsonFile: jsonEntry.entryName }, "Extracted JSON from ZIP");

    // Parse the JSON to extract custom data
    return parseAmazonCustomJson(data);
  } catch (error) {
    logger.error({ error, url }, "Failed to process Amazon Custom ZIP");
    throw new Error(`Failed to process custom ZIP: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Parses the Amazon Custom JSON structure to extract relevant fields.
 * Uses the flatter customizationInfo structure with fallback to nested customizationData.
 */
function parseAmazonCustomJson(data: any): AmazonCustomData {
  try {
    // Try the simpler customizationInfo structure first (v3.0)
    const areas = data?.customizationInfo?.["version3.0"]?.surfaces?.[0]?.areas;
    
    if (areas && Array.isArray(areas)) {
      return parseFromAreas(areas);
    }

    // Fallback to nested customizationData structure
    logger.info("Falling back to nested customizationData structure");
    return parseFromCustomizationData(data?.customizationData);
  } catch (error) {
    logger.error({ error }, "Failed to parse Amazon Custom JSON");
    return createEmptyCustomData();
  }
}

/**
 * Parses from the flatter customizationInfo.version3.0.surfaces[0].areas structure
 */
function parseFromAreas(areas: any[]): AmazonCustomData {
  const result: AmazonCustomData = createEmptyCustomData();

  // Extract font and color from the first TextPrinting area
  const firstTextArea = areas.find((area) => area.customizationType === "TextPrinting");
  if (firstTextArea) {
    result.fontFamily = firstTextArea.fontFamily || null;
    result.colorName = firstTextArea.colorName || null;
  }

  // Extract design name from Options area
  const patternArea = areas.find((area) => area.name === "Pattern" || area.customizationType === "Options");
  if (patternArea) {
    result.designName = patternArea.optionValue || null;
  }

  // Extract text values by name
  for (const area of areas) {
    if (area.customizationType !== "TextPrinting") continue;

    const name = area.name;
    const text = area.text;

    if (name === "Nome") {
      result.frontText = text || null;
    } else if (name === "Riga 1") {
      result.backText1 = text || null;
    } else if (name === "Riga 2") {
      result.backText2 = text || null;
    } else if (name === "Riga 3") {
      result.backText3 = text || null;
    } else if (name === "Riga 4") {
      result.backText4 = text || null;
    }
  }

  return result;
}

/**
 * Parses from the nested customizationData structure (fallback)
 */
function parseFromCustomizationData(customizationData: any): AmazonCustomData {
  const result: AmazonCustomData = createEmptyCustomData();

  if (!customizationData) {
    return result;
  }

  // Recursively search for specific fields
  result.fontFamily = findFontFamily(customizationData);
  result.colorName = findColorName(customizationData);
  result.designName = findDesignName(customizationData);
  result.frontText = findTextByName(customizationData, "Testo 1") || findTextByLabel(customizationData, "Testo 1");
  result.backText1 = findTextByName(customizationData, "Riga 1") || findTextByLabel(customizationData, "Riga 1");
  result.backText2 = findTextByName(customizationData, "Riga 2") || findTextByLabel(customizationData, "Riga 2");
  result.backText3 = findTextByName(customizationData, "Riga 3") || findTextByLabel(customizationData, "Riga 3");
  result.backText4 = findTextByName(customizationData, "Riga 4") || findTextByLabel(customizationData, "Riga 4");

  return result;
}

/**
 * Recursively searches for fontSelection.family
 */
function findFontFamily(obj: any): string | null {
  if (!obj || typeof obj !== "object") return null;

  if (obj.fontSelection?.family) {
    return obj.fontSelection.family;
  }

  if (Array.isArray(obj)) {
    for (const item of obj) {
      const result = findFontFamily(item);
      if (result) return result;
    }
  } else {
    for (const key in obj) {
      const result = findFontFamily(obj[key]);
      if (result) return result;
    }
  }

  return null;
}

/**
 * Recursively searches for colorSelection.name
 */
function findColorName(obj: any): string | null {
  if (!obj || typeof obj !== "object") return null;

  if (obj.colorSelection?.name) {
    return obj.colorSelection.name;
  }

  if (Array.isArray(obj)) {
    for (const item of obj) {
      const result = findColorName(item);
      if (result) return result;
    }
  } else {
    for (const key in obj) {
      const result = findColorName(obj[key]);
      if (result) return result;
    }
  }

  return null;
}

/**
 * Recursively searches for displayValue (design name like "Fiori")
 */
function findDesignName(obj: any): string | null {
  if (!obj || typeof obj !== "object") return null;

  // Look for displayValue in OptionCustomization
  if (obj.type === "OptionCustomization" && obj.displayValue) {
    return obj.displayValue;
  }

  if (Array.isArray(obj)) {
    for (const item of obj) {
      const result = findDesignName(item);
      if (result) return result;
    }
  } else {
    for (const key in obj) {
      const result = findDesignName(obj[key]);
      if (result) return result;
    }
  }

  return null;
}

/**
 * Searches for a TextCustomization or PlacementContainerCustomization with a specific name
 * and extracts the inputValue
 */
function findTextByName(obj: any, targetName: string): string | null {
  if (!obj || typeof obj !== "object") return null;

  // Check if current object has the target name
  if (obj.name === targetName) {
    // Look for inputValue in children
    const inputValue = findInputValue(obj);
    if (inputValue) return inputValue;
  }

  // Recursively search children
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const result = findTextByName(item, targetName);
      if (result) return result;
    }
  } else {
    for (const key in obj) {
      const result = findTextByName(obj[key], targetName);
      if (result) return result;
    }
  }

  return null;
}

/**
 * Searches for a TextCustomization with a specific label and extracts the inputValue
 */
function findTextByLabel(obj: any, targetLabel: string): string | null {
  if (!obj || typeof obj !== "object") return null;

  // Check if current object is a TextCustomization with the target label
  if (obj.type === "TextCustomization" && obj.label === targetLabel && obj.inputValue) {
    return obj.inputValue;
  }

  // Recursively search
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const result = findTextByLabel(item, targetLabel);
      if (result) return result;
    }
  } else {
    for (const key in obj) {
      const result = findTextByLabel(obj[key], targetLabel);
      if (result) return result;
    }
  }

  return null;
}

/**
 * Searches for inputValue in the object tree
 */
function findInputValue(obj: any): string | null {
  if (!obj || typeof obj !== "object") return null;

  if (obj.inputValue) {
    return obj.inputValue;
  }

  if (Array.isArray(obj)) {
    for (const item of obj) {
      const result = findInputValue(item);
      if (result) return result;
    }
  } else {
    for (const key in obj) {
      const result = findInputValue(obj[key]);
      if (result) return result;
    }
  }

  return null;
}

/**
 * Creates an empty custom data object with all fields set to null
 */
function createEmptyCustomData(): AmazonCustomData {
  return {
    fontFamily: null,
    colorName: null,
    designName: null,
    frontText: null,
    backText1: null,
    backText2: null,
    backText3: null,
    backText4: null,
  };
}
