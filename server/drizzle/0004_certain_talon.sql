-- Manual migration for status column changes and new columns
-- SQLite requires table recreation to change column constraints

-- Step 1: Create new table with updated schema
CREATE TABLE `orders_new` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `order_id` text NOT NULL UNIQUE,
  `purchase_date` text,
  `status` text DEFAULT 'pending' NOT NULL CHECK(`status` IN ('pending', 'processing', 'printed', 'error')),
  `custom_field` text,
  `sku` text,
  `buyer_name` text,
  `raw` text NOT NULL,
  `error_message` text,
  `processed_at` text,
  `attempt_count` integer DEFAULT 0 NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);--> statement-breakpoint

-- Step 2: Copy data from old table, setting status='pending' for NULL/empty values
INSERT INTO `orders_new` (
  `id`, 
  `order_id`, 
  `purchase_date`, 
  `status`, 
  `custom_field`, 
  `sku`, 
  `buyer_name`, 
  `raw`, 
  `error_message`, 
  `processed_at`, 
  `attempt_count`, 
  `created_at`, 
  `updated_at`
)
SELECT 
  `id`,
  `order_id`,
  `purchase_date`,
  COALESCE(NULLIF(`status`, ''), 'pending') as `status`,
  `custom_field`,
  `sku`,
  `buyer_name`,
  `raw`,
  NULL as `error_message`,
  NULL as `processed_at`,
  0 as `attempt_count`,
  `created_at`,
  `updated_at`
FROM `orders`;--> statement-breakpoint

-- Step 3: Drop old table
DROP TABLE `orders`;--> statement-breakpoint

-- Step 4: Rename new table to original name
ALTER TABLE `orders_new` RENAME TO `orders`;