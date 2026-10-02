CREATE TYPE "public"."quote_request_kind" AS ENUM('CHANGE', 'QUESTION', 'DECLINE', 'UPDATE');--> statement-breakpoint
CREATE TYPE "public"."quote_request_status" AS ENUM('OPEN', 'ANSWERED');--> statement-breakpoint
CREATE TABLE "quote_acceptances" (
	"id" uuid PRIMARY KEY NOT NULL,
	"quote_version_id" uuid NOT NULL,
	"customer_id" uuid,
	"actor_type" text NOT NULL,
	"email_verified_at" timestamp with time zone,
	"acknowledgement" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote_change_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"quote_id" uuid NOT NULL,
	"quote_version_id" uuid,
	"kind" "quote_request_kind" NOT NULL,
	"line_id" uuid,
	"change_type" text,
	"note" text DEFAULT '' NOT NULL,
	"file_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"customer_id" uuid,
	"status" "quote_request_status" DEFAULT 'OPEN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_schedules" DROP CONSTRAINT "payment_schedules_source";--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_source";--> statement-breakpoint
ALTER TABLE "installments" ADD COLUMN "due_on" text;--> statement-breakpoint
ALTER TABLE "payment_schedules" ADD COLUMN "quote_version_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "quote_version_id" uuid;--> statement-breakpoint
ALTER TABLE "quote_acceptances" ADD CONSTRAINT "quote_acceptances_quote_version_id_quote_versions_id_fk" FOREIGN KEY ("quote_version_id") REFERENCES "public"."quote_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_acceptances" ADD CONSTRAINT "quote_acceptances_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_change_requests" ADD CONSTRAINT "quote_change_requests_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_change_requests" ADD CONSTRAINT "quote_change_requests_quote_version_id_quote_versions_id_fk" FOREIGN KEY ("quote_version_id") REFERENCES "public"."quote_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_change_requests" ADD CONSTRAINT "quote_change_requests_line_id_quote_line_items_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."quote_line_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_change_requests" ADD CONSTRAINT "quote_change_requests_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "quote_acceptances_version_unique" ON "quote_acceptances" USING btree ("quote_version_id");--> statement-breakpoint
CREATE INDEX "quote_change_requests_quote_idx" ON "quote_change_requests" USING btree ("quote_id","created_at");--> statement-breakpoint
ALTER TABLE "payment_schedules" ADD CONSTRAINT "payment_schedules_quote_version_id_quote_versions_id_fk" FOREIGN KEY ("quote_version_id") REFERENCES "public"."quote_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_quote_version_id_quote_versions_id_fk" FOREIGN KEY ("quote_version_id") REFERENCES "public"."quote_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_schedules_quote_version_unique" ON "payment_schedules" USING btree ("quote_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_quote_version_unique" ON "orders" USING btree ("quote_version_id");--> statement-breakpoint
ALTER TABLE "payment_schedules" ADD CONSTRAINT "payment_schedules_source" CHECK (num_nonnulls("payment_schedules"."checkout_id", "payment_schedules"."quote_version_id") = 1);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_source" CHECK (num_nonnulls("orders"."checkout_id", "orders"."quote_version_id") = 1);