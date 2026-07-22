CREATE TABLE `framework_levels` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`framework_version_id` integer NOT NULL,
	`level` integer NOT NULL,
	`title` text NOT NULL,
	`role` text NOT NULL,
	`stage` text NOT NULL,
	`definition` text NOT NULL,
	`standard` text NOT NULL,
	`abilities_json` text DEFAULT '[]' NOT NULL,
	`criteria_json` text DEFAULT '[]' NOT NULL,
	`practices_json` text DEFAULT '[]' NOT NULL,
	`path` text DEFAULT '' NOT NULL,
	`badges_json` text DEFAULT '[]' NOT NULL,
	`resources_json` text DEFAULT '[]' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `framework_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`version_name` text NOT NULL,
	`status` text DEFAULT '草稿' NOT NULL,
	`change_note` text DEFAULT '' NOT NULL,
	`created_by_email` text DEFAULT 'system' NOT NULL,
	`published_at` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `assets` ADD `source_evidence_id` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `evidences` ADD `nominate_asset` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `level_history` ADD `framework_version_id` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `group_name` text DEFAULT '综合组' NOT NULL;--> statement-breakpoint
ALTER TABLE `reviews` ADD `framework_version_id` integer DEFAULT 0 NOT NULL;