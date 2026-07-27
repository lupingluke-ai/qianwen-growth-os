ALTER TABLE "members" ALTER COLUMN "current_level" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "members" ALTER COLUMN "self_level" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "review_feedback" text;