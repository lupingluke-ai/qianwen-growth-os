-- Keep the intended成果类型 with each nominated promotion evidence so a
-- successful promotion review can publish the correct reusable asset directly.
ALTER TABLE "evidences"
ADD COLUMN IF NOT EXISTS "asset_type" text DEFAULT 'Skill' NOT NULL;
