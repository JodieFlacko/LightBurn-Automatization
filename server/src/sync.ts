import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { notInArray } from "drizzle-orm";
import { db } from "./db.js";
import { orders } from "./schema.js";
import { normalizeRecord } from "./parser.js";

type SyncResult = {
  added: number;
  duplicates: number;
  deleted: number;
  skipped: number;
  totalParsed: number;
};

const isJsonByContentType = (contentType: string | null) =>
  Boolean(contentType && contentType.includes("application/json"));

const readStreamToString = async (stream: fs.ReadStream) =>
  new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
  });

const resolveFeedPath = (feedUrl: string) => {
  if (feedUrl.startsWith("file://")) {
    return fileURLToPath(feedUrl);
  }
  return feedUrl;
};

async function readFeedContent(feedUrl: string) {
  if (feedUrl.startsWith("http://") || feedUrl.startsWith("https://")) {
    const response = await fetch(feedUrl);
    if (!response.ok) {
      throw new Error(`Feed fetch failed: ${response.status} ${response.statusText}`);
    }
    const contentType = response.headers.get("content-type");
    const text = await response.text();
    return { text, contentType, sourcePath: feedUrl };
  }

  const filePath = resolveFeedPath(feedUrl);
  const stream = fs.createReadStream(filePath);
  const text = await readStreamToString(stream);
  const extension = path.extname(filePath).toLowerCase();
  const contentType = extension === ".json" ? "application/json" : null;

  return { text, contentType, sourcePath: filePath };
}

function parseFeed(text: string, contentType: string | null, sourcePath: string) {
  const extension = path.extname(sourcePath).toLowerCase();
  const shouldParseJson = isJsonByContentType(contentType) || extension === ".json";

  if (shouldParseJson) {
    const json = JSON.parse(text);
    if (Array.isArray(json)) {
      return json;
    }
    if (Array.isArray(json?.records)) {
      return json.records;
    }
    if (Array.isArray(json?.data)) {
      return json.data;
    }
    return [json];
  }

  return parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });
}

export async function syncOrders(): Promise<SyncResult> {
  const feedUrl = process.env.FEED_URL;
  if (!feedUrl) {
    throw new Error("FEED_URL is not set in .env");
  }

  const { text, contentType, sourcePath } = await readFeedContent(feedUrl);
  const records = parseFeed(text, contentType, sourcePath) as Record<string, unknown>[];

  let added = 0;
  let duplicates = 0;
  let deleted = 0;
  let skipped = 0;
  const totalParsed = records.length;
  const incomingOrderIds = new Set<string>();

  for (const record of records) {
    const normalized = normalizeRecord(record);
    if (!normalized.orderId) {
      skipped += 1;
      continue;
    }

    incomingOrderIds.add(normalized.orderId);

    const result = db
      .insert(orders)
      .values({
        orderId: normalized.orderId,
        purchaseDate: normalized.purchaseDate ?? null,
        status: normalized.status ?? null,
        customField: normalized.customField ?? null,
        raw: normalized.raw
      })
      .onConflictDoNothing()
      .run();

    if (result.changes > 0) {
      added += 1;
    } else {
      duplicates += 1;
    }
  }

  if (incomingOrderIds.size > 0) {
    const ids = Array.from(incomingOrderIds);
    const deleteResult = db
      .delete(orders)
      .where(notInArray(orders.orderId, ids))
      .run();

    deleted = deleteResult.changes;
  }

  if (totalParsed > 0 && added + skipped + duplicates === 0) {
    throw new Error(
      "Sync completed with zero added/skipped records. Mapping likely failed."
    );
  }

  return { added, duplicates, deleted, skipped, totalParsed };
}
