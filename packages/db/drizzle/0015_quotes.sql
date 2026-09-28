CREATE TYPE "public"."quote_status" AS ENUM('PENDING_REVIEW', 'READY', 'REVISION_REQUESTED', 'ACCEPTED', 'DECLINED', 'EXPIRED');--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reference" text NOT NULL,
	"status" "quote_status" DEFAULT 'PENDING_REVIEW' NOT NULL,
	"customer_id" uuid NOT NULL,
	"configuration_id" uuid,
	"request_snapshot" jsonb NOT NULL,
	"contact" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_configuration_id_configurations_id_fk" FOREIGN KEY ("configuration_id") REFERENCES "public"."configurations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "quotes_reference_unique" ON "quotes" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "quotes_status_idx" ON "quotes" USING btree ("status","created_at");