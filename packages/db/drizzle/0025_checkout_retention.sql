ALTER TABLE "checkouts" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "checkouts" ADD COLUMN "personal_data_purged_at" timestamp with time zone;