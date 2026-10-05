ALTER TABLE "quotes" ADD COLUMN "configuration_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
UPDATE "quotes" SET "configuration_ids" = ARRAY["configuration_id"] WHERE "configuration_id" IS NOT NULL;
