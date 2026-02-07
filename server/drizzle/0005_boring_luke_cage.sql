ALTER TABLE `orders` ADD `fronte_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `fronte_error_message` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `fronte_attempt_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `fronte_processed_at` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `retro_status` text DEFAULT 'not_required' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `retro_error_message` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `retro_attempt_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `retro_processed_at` text;