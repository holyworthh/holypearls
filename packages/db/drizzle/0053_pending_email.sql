ALTER TABLE "users" ADD COLUMN "pending_email" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "pending_email_at" timestamp with time zone;