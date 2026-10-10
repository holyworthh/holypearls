ALTER TABLE "group_collections" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "group_collections" ADD COLUMN "last_reminded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN "excluded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN "removed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN "removed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_removed_by_user_id_users_id_fk" FOREIGN KEY ("removed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;