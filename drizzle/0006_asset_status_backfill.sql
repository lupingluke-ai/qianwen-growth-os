UPDATE "assets" SET "review_status" = '待审核' WHERE "review_status" = '审核中';--> statement-breakpoint
UPDATE "assets" SET "compliance_status" = '已复核' WHERE "compliance_status" = '已审核';--> statement-breakpoint
UPDATE "assets" SET "compliance_status" = '已自查' WHERE "compliance_status" = '待复核';
