CREATE TABLE "assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"type" text NOT NULL,
	"industry" text NOT NULL,
	"owner_member_id" integer NOT NULL,
	"source_evidence_id" integer DEFAULT 0 NOT NULL,
	"review_status" text DEFAULT '待审核' NOT NULL,
	"compliance_status" text DEFAULT '已自查' NOT NULL,
	"reuse_people" integer DEFAULT 0 NOT NULL,
	"reuse_clients" integer DEFAULT 0 NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_email" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidences" (
	"id" serial PRIMARY KEY NOT NULL,
	"member_id" integer NOT NULL,
	"level" integer NOT NULL,
	"criterion_key" text NOT NULL,
	"title" text NOT NULL,
	"kind" text DEFAULT '链接' NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"outcome" text DEFAULT '' NOT NULL,
	"status" text DEFAULT '有效' NOT NULL,
	"nominate_asset" integer DEFAULT 0 NOT NULL,
	"created_by_email" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "framework_levels" (
	"id" serial PRIMARY KEY NOT NULL,
	"framework_version_id" integer NOT NULL,
	"level" integer NOT NULL,
	"title" text NOT NULL,
	"role" text NOT NULL,
	"stage" text NOT NULL,
	"definition" text NOT NULL,
	"standard" text NOT NULL,
	"abilities_json" text DEFAULT '[]' NOT NULL,
	"criteria_json" text DEFAULT '[]' NOT NULL,
	"practices_json" text DEFAULT '[]' NOT NULL,
	"path" text DEFAULT '' NOT NULL,
	"badges_json" text DEFAULT '[]' NOT NULL,
	"resources_json" text DEFAULT '[]' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "framework_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"version_name" text NOT NULL,
	"status" text DEFAULT '草稿' NOT NULL,
	"change_note" text DEFAULT '' NOT NULL,
	"created_by_email" text DEFAULT 'system' NOT NULL,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "growth_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"member_id" integer NOT NULL,
	"title" text NOT NULL,
	"due_date" text NOT NULL,
	"status" text DEFAULT '进行中' NOT NULL,
	"linked_level" integer NOT NULL,
	"linked_anchor" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "level_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"member_id" integer NOT NULL,
	"from_level" integer NOT NULL,
	"to_level" integer NOT NULL,
	"decision" text NOT NULL,
	"reviewer_email" text NOT NULL,
	"framework_version_id" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_email" text,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"industry" text NOT NULL,
	"group_name" text DEFAULT '综合组' NOT NULL,
	"current_level" integer DEFAULT 1 NOT NULL,
	"self_level" integer DEFAULT 1 NOT NULL,
	"target_level" integer DEFAULT 3 NOT NULL,
	"target_date" text DEFAULT '2026-09-30' NOT NULL,
	"status" text DEFAULT '进行中' NOT NULL,
	"review_status" text DEFAULT '草稿' NOT NULL,
	"gap" text DEFAULT '' NOT NULL,
	"plan" text DEFAULT '' NOT NULL,
	"evidence" text DEFAULT '' NOT NULL,
	"next_task" text DEFAULT '' NOT NULL,
	"last_checkin" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"member_id" integer NOT NULL,
	"from_level" integer NOT NULL,
	"target_level" integer NOT NULL,
	"state" text DEFAULT '已提交' NOT NULL,
	"cycle" text NOT NULL,
	"reviewer_email" text DEFAULT '' NOT NULL,
	"reviewer_name" text DEFAULT '待分配' NOT NULL,
	"framework_version_id" integer DEFAULT 0 NOT NULL,
	"feedback" text DEFAULT '' NOT NULL,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "workspace_users" (
	"email" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"member_id" integer NOT NULL,
	"password_hash" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_owner_member_id_members_id_fk" FOREIGN KEY ("owner_member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidences" ADD CONSTRAINT "evidences_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "framework_levels" ADD CONSTRAINT "framework_levels_framework_version_id_framework_versions_id_fk" FOREIGN KEY ("framework_version_id") REFERENCES "public"."framework_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_tasks" ADD CONSTRAINT "growth_tasks_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_history" ADD CONSTRAINT "level_history_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_users" ADD CONSTRAINT "workspace_users_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_industry_idx" ON "assets" USING btree ("industry");--> statement-breakpoint
CREATE INDEX "audit_action_created_idx" ON "audit_logs" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "evidence_member_idx" ON "evidences" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "framework_level_version_idx" ON "framework_levels" USING btree ("framework_version_id","level");--> statement-breakpoint
CREATE UNIQUE INDEX "members_user_email_unique" ON "members" USING btree ("user_email");--> statement-breakpoint
CREATE INDEX "members_industry_idx" ON "members" USING btree ("industry");--> statement-breakpoint
CREATE INDEX "members_group_idx" ON "members" USING btree ("group_name");--> statement-breakpoint
CREATE INDEX "review_member_idx" ON "reviews" USING btree ("member_id");