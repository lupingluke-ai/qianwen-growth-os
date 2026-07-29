ALTER TABLE "assets" ADD COLUMN "reviewer_email" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "reviewer_name" text DEFAULT '' NOT NULL;