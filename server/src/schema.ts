import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: text("order_id").notNull().unique(),
  purchaseDate: text("purchase_date"),
  status: text("status", { enum: ["pending", "processing", "printed", "error"] }).notNull().default("pending"),
  customField: text("custom_field"),
  sku: text("sku"),
  buyerName: text("buyer_name"),
  raw: text("raw").notNull(),
  errorMessage: text("error_message"),
  processedAt: text("processed_at"),
  attemptCount: integer("attempt_count").notNull().default(0),
  
  // Front side (fronte) tracking
  fronteStatus: text("fronte_status", { enum: ["pending", "processing", "printed", "error"] }).notNull().default("pending"),
  fronteErrorMessage: text("fronte_error_message"),
  fronteAttemptCount: integer("fronte_attempt_count").notNull().default(0),
  fronteProcessedAt: text("fronte_processed_at"),
  
  // Back side (retro) tracking
  retroStatus: text("retro_status", { enum: ["not_required", "pending", "processing", "printed", "error"] }).notNull().default("not_required"),
  retroErrorMessage: text("retro_error_message"),
  retroAttemptCount: integer("retro_attempt_count").notNull().default(0),
  retroProcessedAt: text("retro_processed_at"),
  
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`)
});

export const templateRules = sqliteTable("template_rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  skuPattern: text("sku_pattern").notNull(),
  templateFilename: text("template_filename").notNull(),
  priority: integer("priority").notNull().default(0)
});

export const assetRules = sqliteTable("asset_rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  triggerKeyword: text("trigger_keyword").notNull(),
  assetType: text("asset_type").notNull(), // 'image', 'font', 'color'
  value: text("value").notNull()
});

export type Order = typeof orders.$inferSelect;
export type TemplateRule = typeof templateRules.$inferSelect;
export type AssetRule = typeof assetRules.$inferSelect;