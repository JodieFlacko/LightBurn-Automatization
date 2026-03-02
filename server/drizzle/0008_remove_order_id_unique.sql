-- Rebuild the orders table without the UNIQUE constraint on order_id.
-- SQLite does not support DROP CONSTRAINT, so we recreate the table.
-- This unblocks multi-item orders that share the same order_id.
CREATE TABLE `orders_new` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `order_id` text NOT NULL,
  `order_item_id` text,
  `purchase_date` text,
  `status` text DEFAULT 'pending' NOT NULL CHECK(`status` IN ('pending', 'processing', 'printed', 'error')),
  `custom_field` text,
  `sku` text,
  `buyer_name` text,
  `raw` text NOT NULL,
  `error_message` text,
  `processed_at` text,
  `attempt_count` integer DEFAULT 0 NOT NULL,
  `fronte_status` text DEFAULT 'pending' NOT NULL,
  `fronte_error_message` text,
  `fronte_attempt_count` integer DEFAULT 0 NOT NULL,
  `fronte_processed_at` text,
  `retro_status` text DEFAULT 'not_required' NOT NULL,
  `retro_error_message` text,
  `retro_attempt_count` integer DEFAULT 0 NOT NULL,
  `retro_processed_at` text,
  `zip_url` text,
  `design_name` text,
  `font_family` text,
  `color_name` text,
  `front_text` text,
  `back_text1` text,
  `back_text2` text,
  `back_text3` text,
  `back_text4` text,
  `custom_data_synced` integer DEFAULT 0 NOT NULL,
  `custom_data_error` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);--> statement-breakpoint
INSERT INTO `orders_new` SELECT
  `id`, `order_id`, `order_item_id`, `purchase_date`, `status`, `custom_field`,
  `sku`, `buyer_name`, `raw`, `error_message`, `processed_at`, `attempt_count`,
  `fronte_status`, `fronte_error_message`, `fronte_attempt_count`, `fronte_processed_at`,
  `retro_status`, `retro_error_message`, `retro_attempt_count`, `retro_processed_at`,
  `zip_url`, `design_name`, `font_family`, `color_name`, `front_text`,
  `back_text1`, `back_text2`, `back_text3`, `back_text4`,
  `custom_data_synced`, `custom_data_error`, `created_at`, `updated_at`
FROM `orders`;--> statement-breakpoint
DROP TABLE `orders`;--> statement-breakpoint
ALTER TABLE `orders_new` RENAME TO `orders`;--> statement-breakpoint
CREATE UNIQUE INDEX `orders_order_item_id_unique` ON `orders` (`order_item_id`);
