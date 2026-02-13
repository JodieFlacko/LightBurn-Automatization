import { z } from "zod";

const normalizeHeader = (key: string) =>
  key.toLowerCase().trim().replace(/[_\-\s]/g, "");

/*
  HEADER ALIAS MAP (edit me when CSV headers change)
  --------------------------------------------------
  The keys in this object are the DB field names we support.
  The array values are acceptable header aliases after normalization.

  Normalization rules:
  - lowercase
  - trim whitespace
  - remove underscores, hyphens, and spaces

  Example:
  "Amazon Order ID" -> "amazonorderid"
  "Purchase_Date"   -> "purchasedate"

  Add new aliases to the arrays below when new CSV headers appear.
*/
export const HEADER_ALIASES = {
  orderId: ["orderid", "amazonorderid", "id"],
  purchaseDate: ["purchasedate", "orderdate", "date"],
  status: ["status", "orderstatus"],
  customField: ["custom", "customfield", "customfieldvalue"],
  sku: ["sku", "itemsku", "productsku"],
  buyerName: ["buyername", "buyer", "customername"],
  zipUrl: [
    "customizedurl",      // matches: customized-url, customized_url, customized url, customizedurl
    "zipurl",             // matches: zip-url, zipurl
    "customizationurl"    // matches: customization-url
  ]
} as const;

const normalizedRecordSchema = z.object({
  orderId: z.string().optional(),
  purchaseDate: z.string().optional(),
  status: z.string().optional(),
  customField: z.string().optional(),
  sku: z.string().optional(),
  buyerName: z.string().optional(),
  zipUrl: z.string().optional(),
  raw: z.string()
});

export type NormalizedRecord = z.infer<typeof normalizedRecordSchema>;

export function getByPath(obj: unknown, path: string | undefined) {
  if (!path) {
    return undefined;
  }

  const segments = path.split(".").filter(Boolean);
  let current: unknown = obj;

  for (const segment of segments) {
    if (current === null || current === undefined) {
      return undefined;
    }

    const index = Number(segment);

    if (Array.isArray(current) && !Number.isNaN(index)) {
      current = current[index];
      continue;
    }

    if (typeof current !== "object") {
      return undefined;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

export function normalizeRecord(
  record: Record<string, unknown>,
  overrides: Partial<NormalizedRecord> = {}
): NormalizedRecord {
  const normalizedMap = new Map<string, string>();

  for (const [key, value] of Object.entries(record)) {
    const normalizedKey = normalizeHeader(key);
    const normalizedValue =
      value === null || value === undefined ? "" : String(value).trim();
    normalizedMap.set(normalizedKey, normalizedValue);
  }

  const getByAliases = (aliases: readonly string[]) => {
    for (const alias of aliases) {
      const value = normalizedMap.get(alias);
      if (value) {
        return value;
      }
    }
    return undefined;
  };

  const orderId = overrides.orderId ?? getByAliases(HEADER_ALIASES.orderId);
  const purchaseDate =
    overrides.purchaseDate ?? getByAliases(HEADER_ALIASES.purchaseDate);
  const status = overrides.status ?? getByAliases(HEADER_ALIASES.status);
  const customField =
    overrides.customField ?? getByAliases(HEADER_ALIASES.customField);
  const sku = overrides.sku ?? getByAliases(HEADER_ALIASES.sku);
  const buyerName =
    overrides.buyerName ?? getByAliases(HEADER_ALIASES.buyerName);
  const zipUrl = overrides.zipUrl ?? getByAliases(HEADER_ALIASES.zipUrl);
  const raw = overrides.raw ?? JSON.stringify(record);

  return normalizedRecordSchema.parse({
    orderId,
    purchaseDate,
    status,
    customField,
    sku,
    buyerName,
    zipUrl,
    raw
  });
}
