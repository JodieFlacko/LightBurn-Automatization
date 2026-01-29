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
  customField: ["custom", "customfield", "customfieldvalue"]
} as const;

const normalizedRecordSchema = z.object({
  orderId: z.string().optional(),
  purchaseDate: z.string().optional(),
  status: z.string().optional(),
  customField: z.string().optional(),
  raw: z.string()
});

export type NormalizedRecord = z.infer<typeof normalizedRecordSchema>;

export function normalizeRecord(record: Record<string, unknown>): NormalizedRecord {
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

  const orderId = getByAliases(HEADER_ALIASES.orderId);
  const purchaseDate = getByAliases(HEADER_ALIASES.purchaseDate);
  const status = getByAliases(HEADER_ALIASES.status);
  const customField = getByAliases(HEADER_ALIASES.customField);

  return normalizedRecordSchema.parse({
    orderId,
    purchaseDate,
    status,
    customField,
    raw: JSON.stringify(record)
  });
}
