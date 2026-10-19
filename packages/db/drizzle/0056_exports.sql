CREATE TYPE "public"."export_status" AS ENUM('GENERATING', 'READY', 'EXPIRED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."export_type" AS ENUM('ORDERS', 'PAYMENTS', 'CUSTOMERS', 'PRODUCTION', 'CATALOGUE', 'COLLECTION_TOTALS');--> statement-breakpoint
CREATE TABLE "exports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"type" "export_type" NOT NULL,
	"from_date" date,
	"to_date" date,
	"status" "export_status" DEFAULT 'GENERATING' NOT NULL,
	"file_key" text,
	"row_count" integer,
	"failure" text,
	"requested_by_user_id" uuid,
	"requested_by_name" text NOT NULL,
	"ready_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exports_created_idx" ON "exports" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "exports_expires_idx" ON "exports" USING btree ("status","expires_at");