ALTER TABLE `orders` ADD `order_item_id` text;--> statement-breakpoint
DROP INDEX IF EXISTS `orders_order_id_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `orders_order_item_id_unique` ON `orders` (`order_item_id`);
