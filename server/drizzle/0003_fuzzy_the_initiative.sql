CREATE TABLE `asset_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trigger_keyword` text NOT NULL,
	`asset_type` text NOT NULL,
	`value` text NOT NULL
);
