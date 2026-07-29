CREATE TABLE "asset_reuse_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"asset_id" integer NOT NULL,
	"member_id" integer NOT NULL,
	"event_type" text DEFAULT '复制链接' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "asset_reuse_events" ADD CONSTRAINT "asset_reuse_events_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_reuse_events" ADD CONSTRAINT "asset_reuse_events_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_reuse_asset_idx" ON "asset_reuse_events" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "asset_reuse_asset_member_idx" ON "asset_reuse_events" USING btree ("asset_id","member_id");