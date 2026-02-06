import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: text("order_id").notNull().unique(),
  purchaseDate: text("purchase_date"),
  status: text("status"),
  customField: text("custom_field"),
  sku: text("sku"),
  buyerName: text("buyer_name"),
  raw: text("raw").notNull(),
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