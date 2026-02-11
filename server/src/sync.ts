import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { XMLParser } from "fast-xml-parser";
import { notInArray, eq, sql } from "drizzle-orm";
import { db } from "./db.js";
import { orders } from "./schema.js";
import { getByPath, normalizeRecord } from "./parser.js";
import { logger, logError } from "./logger.js";
import { hasRetroTemplate } from "./lightburn.js";
import { config } from "./config.js";

type SyncResult = {
  added: number;
  duplicates: number;
  deleted: number;
  skipped: number;
  totalParsed: number;
};

const isJsonByContentType = (contentType: string | null) =>
  Boolean(contentType && contentType.includes("application/json"));

const isXmlByContentType = (contentType: string | null) =>
  Boolean(contentType && contentType.includes("xml"));

const normalizeValue = (value: unknown) => {
  if (value === null || value === undefined) {
    return undefined;
  }
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : undefined;
};

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
  if (path.isAbsolute(feedUrl)) {
    return feedUrl;
  }

  const cwdPath = path.resolve(process.cwd(), feedUrl);
  if (fs.existsSync(cwdPath)) {
    return cwdPath;
  }

  const repoRootPath = path.resolve(process.cwd(), "server", feedUrl);
  if (fs.existsSync(repoRootPath)) {
    return repoRootPath;
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
  const cleanedPath = sourcePath.split("?")[0].split("#")[0];
  const extension = path.extname(cleanedPath).toLowerCase();
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
  const feedUrl = config.getFeedUrl();
  
  logger.info({ feedUrl }, "Starting order synchronization");

  const { text, contentType, sourcePath } = await readFeedContent(feedUrl);
  logger.info({ sourcePath, contentType }, "Feed content loaded successfully");
  const cleanedPath = sourcePath.split("?")[0].split("#")[0];
  const extension = path.extname(cleanedPath).toLowerCase();
  const isXmlSource =
    isXmlByContentType(contentType) || extension === ".xml" || cleanedPath.endsWith(".xml");
  let normalizedRecords = [] as ReturnType<typeof normalizeRecord>[];

  if (isXmlSource) {
    const parser = new XMLParser({
      ignoreAttributes: true,
      removeNSPrefix: true,
      trimValues: true
    });
    const xmlObject = parser.parse(text);
    const recordPath = process.env.XML_RECORD_PATH;
    const xmlRecords = getByPath(xmlObject, recordPath) as
      | Record<string, unknown>
      | Record<string, unknown>[]
      | undefined;
    const recordArray = Array.isArray(xmlRecords)
      ? xmlRecords
      : xmlRecords
      ? [xmlRecords]
      : [];

    const orderIdPath = process.env.XML_FIELD_ORDER_ID;
    const skuPath = process.env.XML_FIELD_SKU;
    const customFieldPath = process.env.XML_FIELD_CUSTOM_FIELD;
    const buyerNamePath = process.env.XML_FIELD_BUYER_NAME;

    normalizedRecords = recordArray.map((record) => {
      const orderId = normalizeValue(getByPath(record, orderIdPath));
      const sku = normalizeValue(getByPath(record, skuPath));
      const customField = normalizeValue(getByPath(record, customFieldPath));
      const buyerName = normalizeValue(getByPath(record, buyerNamePath));

      return normalizeRecord(record, {
        orderId,
        sku,
        customField,
        buyerName,
        raw: JSON.stringify(record)
      });
    });
  } else {
    const records = parseFeed(text, contentType, sourcePath) as Record<
      string,
      unknown
    >[];
    normalizedRecords = records.map((record) => normalizeRecord(record));
  }

  let added = 0;
  let duplicates = 0;
  let deleted = 0;
  let skipped = 0;
  const totalParsed = normalizedRecords.length;
  const incomingOrderIds = new Set<string>();

  for (const normalized of normalizedRecords) {
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
        status: "pending",
        customField: normalized.customField ?? null,
        sku: normalized.sku ?? null,
        buyerName: normalized.buyerName ?? null,
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
    
    if (deleted > 0) {
      logger.info({ deleted }, "Removed orders no longer in feed");
    }
  }

  if (totalParsed > 0 && added + skipped + duplicates === 0) {
    const error = new Error(
      "Sync completed with zero added/skipped records. Mapping likely failed."
    );
    logError(error, { 
      totalParsed, 
      added, 
      skipped, 
      duplicates,
      operation: "sync_orders" 
    });
    throw error;
  }

  // Update retroStatus for orders based on retro template availability
  if (incomingOrderIds.size > 0) {
    logger.info({ orderCount: incomingOrderIds.size }, "Checking retro template availability for synced orders");
    
    // Get all orders that have retroStatus='not_required'
    const allOrders = await db
      .select()
      .from(orders)
      .where(eq(orders.retroStatus, 'not_required'))
      .all();
    
    // Filter to only check orders from this sync
    const ordersToCheck = allOrders.filter(order => 
      incomingOrderIds.has(order.orderId)
    );
    
    // Group orders by SKU to avoid checking the same SKU multiple times
    const ordersBySku = new Map<string, typeof ordersToCheck>();
    for (const order of ordersToCheck) {
      if (order.sku) {
        if (!ordersBySku.has(order.sku)) {
          ordersBySku.set(order.sku, []);
        }
        ordersBySku.get(order.sku)!.push(order);
      }
    }
    
    let retroUpdated = 0;
    const skusWithRetro: string[] = [];
    
    // Check each unique SKU once
    for (const [sku, ordersForSku] of ordersBySku.entries()) {
      const hasRetro = await hasRetroTemplate(sku);
      
      if (hasRetro) {
        skusWithRetro.push(sku);
        
        // Update all orders with this SKU
        for (const order of ordersForSku) {
          await db
            .update(orders)
            .set({
              retroStatus: 'pending',
              updatedAt: sql`CURRENT_TIMESTAMP`
            })
            .where(eq(orders.orderId, order.orderId))
            .run();
          
          retroUpdated++;
          logger.info(
            { sku, orderId: order.orderId },
            `Retro template found for SKU: ${sku}, setting retroStatus='pending'`
          );
        }
      }
    }
    
    if (retroUpdated > 0) {
      logger.info(
        { 
          retroUpdated, 
          skusWithRetro: skusWithRetro.join(', '),
          skuCount: skusWithRetro.length
        }, 
        `Updated retroStatus for ${retroUpdated} order(s) across ${skusWithRetro.length} SKU(s) with retro templates`
      );
    } else if (ordersToCheck.length > 0) {
      logger.info("No retro templates found for any synced orders");
    }
  }

  logger.info(
    { 
      added, 
      duplicates, 
      deleted, 
      skipped, 
      totalParsed 
    },
    "Order synchronization completed"
  );

  return { added, duplicates, deleted, skipped, totalParsed };
}
