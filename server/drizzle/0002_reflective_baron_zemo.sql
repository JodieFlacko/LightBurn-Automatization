CREATE TABLE `template_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sku_pattern` text NOT NULL,
	`template_filename` text NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL
);
