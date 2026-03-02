ALTER TABLE `orders` ADD `quantity` integer NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `orders` ADD `fronte_print_count` integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `orders` ADD `retro_print_count` integer NOT NULL DEFAULT 0;--> statement-breakpoint
UPDATE `orders` SET `fronte_print_count` = 1 WHERE `fronte_status` = 'printed' AND `fronte_print_count` = 0;--> statement-breakpoint
UPDATE `orders` SET `retro_print_count` = 1 WHERE `retro_status` = 'printed' AND `retro_print_count` = 0;
