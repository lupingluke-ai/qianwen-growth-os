CREATE TABLE "feedbacks" (
	"id" serial PRIMARY KEY NOT NULL,
	"member_id" integer NOT NULL,
	"created_by_email" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"page_name" text NOT NULL,
	"screenshot" text,
	"status" text DEFAULT 'open' NOT NULL,
	"admin_response" text,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feedback_member_idx" ON "feedbacks" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "feedback_status_idx" ON "feedbacks" USING btree ("status");