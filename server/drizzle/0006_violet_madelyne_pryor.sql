ALTER TABLE `orders` ADD `zip_url` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `design_name` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `font_family` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `color_name` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `front_text` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `back_text1` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `back_text2` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `back_text3` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `back_text4` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `custom_data_synced` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `custom_data_error` text;