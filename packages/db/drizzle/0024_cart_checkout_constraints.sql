-- Bring earlier rows within the new rules first (review P2-04): a row with
-- both owners keeps the account; an ownerless cart is dropped; an ownerless
-- open checkout is closed; a checkout naming a missing VAT setting forgets it.
UPDATE "carts" SET "owner_device_hash" = NULL WHERE "owner_user_id" IS NOT NULL AND "owner_device_hash" IS NOT NULL;--> statement-breakpoint
DELETE FROM "carts" WHERE "owner_user_id" IS NULL AND "owner_device_hash" IS NULL;--> statement-breakpoint
UPDATE "checkouts" SET "owner_device_hash" = NULL WHERE "owner_user_id" IS NOT NULL AND "owner_device_hash" IS NOT NULL;--> statement-breakpoint
UPDATE "checkouts" SET "status" = 'ABANDONED' WHERE "status" = 'OPEN' AND "owner_user_id" IS NULL AND "owner_device_hash" IS NULL;--> statement-breakpoint
UPDATE "checkouts" SET "tax_setting_id" = NULL WHERE "tax_setting_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "tax_settings" WHERE "tax_settings"."id" = "checkouts"."tax_setting_id");--> statement-breakpoint
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_tax_setting_id_tax_settings_id_fk" FOREIGN KEY ("tax_setting_id") REFERENCES "public"."tax_settings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_one_owner" CHECK (num_nonnulls("carts"."owner_user_id", "carts"."owner_device_hash") = 1);--> statement-breakpoint
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_owner" CHECK (num_nonnulls("checkouts"."owner_user_id", "checkouts"."owner_device_hash") = 1 or ("checkouts"."status" <> 'OPEN' and "checkouts"."owner_user_id" is null and "checkouts"."owner_device_hash" is null));--> statement-breakpoint
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_step" CHECK ("checkouts"."step" in ('contact', 'address', 'delivery', 'billing', 'review'));--> statement-breakpoint
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_currency" CHECK ("checkouts"."currency" in ('NGN', 'USD'));