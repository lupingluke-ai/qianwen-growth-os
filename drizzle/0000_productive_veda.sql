CREATE TABLE `members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`industry` text NOT NULL,
	`current_level` integer DEFAULT 1 NOT NULL,
	`target_level` integer DEFAULT 3 NOT NULL,
	`target_date` text DEFAULT '2026-09-30' NOT NULL,
	`status` text DEFAULT '进行中' NOT NULL,
	`gap` text DEFAULT '' NOT NULL,
	`plan` text DEFAULT '' NOT NULL,
	`evidence` text DEFAULT '' NOT NULL,
	`next_task` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
