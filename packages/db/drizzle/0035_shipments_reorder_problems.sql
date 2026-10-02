CREATE TYPE "public"."problem_status" AS ENUM('NEW', 'TRIAGED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."problem_type" AS ENUM('DAMAGED', 'MISSING_OR_SHORT', 'WRONG_ITEM_OR_SIZE', 'INCORRECT_PRINTING', 'QUALITY');--> statement-breakpoint
CREATE TYPE "public"."shipment_status" AS ENUM('PREPARING', 'LABEL_CREATED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'ATTEMPTED_DELIVERY', 'EXCEPTION', 'RETURNED');--> statement-breakpoint
CREATE TABLE "problem_replies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"problem_report_id" uuid NOT NULL,
	"body" text NOT NULL,
	"staff_profile_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "problem_report_photos" (
	"problem_report_id" uuid NOT NULL,
	"file_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "problem_reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"order_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"customer_id" uuid,
	"type" "problem_type" NOT NULL,
	"quantity" integer NOT NULL,
	"description" text NOT NULL,
	"status" "problem_status" DEFAULT 'NEW' NOT NULL,
	"triage_note" text,
	"triaged_by_staff_id" uuid,
	"triaged_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "problem_reports_quantity_positive" CHECK ("problem_reports"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "shipment_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"shipment_id" uuid NOT NULL,
	"from_status" "shipment_status",
	"to_status" "shipment_status" NOT NULL,
	"note" text,
	"staff_profile_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipment_items" (
	"shipment_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	CONSTRAINT "shipment_items_quantity_positive" CHECK ("shipment_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"number" text NOT NULL,
	"status" "shipment_status" DEFAULT 'PREPARING' NOT NULL,
	"carrier" text DEFAULT '' NOT NULL,
	"tracking_number" text DEFAULT '' NOT NULL,
	"destination" text NOT NULL,
	"dispatched_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_by_staff_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "configurations" ADD COLUMN "reorder_of_item_id" uuid;--> statement-breakpoint
ALTER TABLE "configurations" ADD COLUMN "reorder_exact" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "problem_replies" ADD CONSTRAINT "problem_replies_problem_report_id_problem_reports_id_fk" FOREIGN KEY ("problem_report_id") REFERENCES "public"."problem_reports"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_replies" ADD CONSTRAINT "problem_replies_staff_profile_id_staff_profiles_id_fk" FOREIGN KEY ("staff_profile_id") REFERENCES "public"."staff_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_report_photos" ADD CONSTRAINT "problem_report_photos_problem_report_id_problem_reports_id_fk" FOREIGN KEY ("problem_report_id") REFERENCES "public"."problem_reports"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_report_photos" ADD CONSTRAINT "problem_report_photos_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_reports" ADD CONSTRAINT "problem_reports_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_reports" ADD CONSTRAINT "problem_reports_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_reports" ADD CONSTRAINT "problem_reports_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_reports" ADD CONSTRAINT "problem_reports_triaged_by_staff_id_staff_profiles_id_fk" FOREIGN KEY ("triaged_by_staff_id") REFERENCES "public"."staff_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_events" ADD CONSTRAINT "shipment_events_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_events" ADD CONSTRAINT "shipment_events_staff_profile_id_staff_profiles_id_fk" FOREIGN KEY ("staff_profile_id") REFERENCES "public"."staff_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_created_by_staff_id_staff_profiles_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."staff_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "problem_replies_report_idx" ON "problem_replies" USING btree ("problem_report_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "problem_report_photos_unique" ON "problem_report_photos" USING btree ("problem_report_id","file_id");--> statement-breakpoint
CREATE UNIQUE INDEX "problem_reports_number_unique" ON "problem_reports" USING btree ("number");--> statement-breakpoint
CREATE INDEX "problem_reports_status_idx" ON "problem_reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "problem_reports_order_idx" ON "problem_reports" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "shipment_events_shipment_idx" ON "shipment_events" USING btree ("shipment_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "shipment_items_unique" ON "shipment_items" USING btree ("shipment_id","order_item_id");--> statement-breakpoint
CREATE INDEX "shipment_items_item_idx" ON "shipment_items" USING btree ("order_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shipments_number_unique" ON "shipments" USING btree ("number");--> statement-breakpoint
CREATE INDEX "shipments_order_idx" ON "shipments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "shipments_status_idx" ON "shipments" USING btree ("status","updated_at");--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS "problem_report_seq" START 1;
