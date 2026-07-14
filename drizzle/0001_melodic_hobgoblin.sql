CREATE TABLE `assets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`type` text NOT NULL,
	`industry` text NOT NULL,
	`owner_member_id` integer NOT NULL,
	`review_status` text DEFAULT '待审核' NOT NULL,
	`compliance_status` text DEFAULT '已自查' NOT NULL,
	`reuse_people` integer DEFAULT 0 NOT NULL,
	`reuse_clients` integer DEFAULT 0 NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor_email` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` integer NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `evidences` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_id` integer NOT NULL,
	`level` integer NOT NULL,
	`criterion_key` text NOT NULL,
	`title` text NOT NULL,
	`kind` text DEFAULT '链接' NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`outcome` text DEFAULT '' NOT NULL,
	`status` text DEFAULT '有效' NOT NULL,
	`created_by_email` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `growth_tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_id` integer NOT NULL,
	`title` text NOT NULL,
	`due_date` text NOT NULL,
	`status` text DEFAULT '进行中' NOT NULL,
	`linked_level` integer NOT NULL,
	`linked_anchor` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `level_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_id` integer NOT NULL,
	`from_level` integer NOT NULL,
	`to_level` integer NOT NULL,
	`decision` text NOT NULL,
	`reviewer_email` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_id` integer NOT NULL,
	`from_level` integer NOT NULL,
	`target_level` integer NOT NULL,
	`state` text DEFAULT '已提交' NOT NULL,
	`cycle` text NOT NULL,
	`reviewer_email` text DEFAULT '' NOT NULL,
	`reviewer_name` text DEFAULT '待分配' NOT NULL,
	`feedback` text DEFAULT '' NOT NULL,
	`submitted_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`reviewed_at` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workspace_users` (
	`email` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`member_id` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `members` ADD `user_email` text;--> statement-breakpoint
ALTER TABLE `members` ADD `self_level` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `review_status` text DEFAULT '草稿' NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `last_checkin` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `members_user_email_unique` ON `members` (`user_email`);
--> statement-breakpoint
UPDATE `members` SET
	`self_level` = `current_level`,
	`review_status` = CASE
		WHEN `status` = '待举证' THEN '待补证'
		WHEN `status` = '有风险' THEN '待补证'
		ELSE '草稿'
	END;
