CREATE TYPE "public"."hold_status" AS ENUM('OPEN', 'RESOLVED');--> statement-breakpoint
CREATE TYPE "public"."qc_outcome" AS ENUM('PASSED', 'REWORK');--> statement-breakpoint
CREATE TABLE "holds" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_item_id" uuid NOT NULL,
	"status" "hold_status" DEFAULT 'OPEN' NOT NULL,
	"reason" text NOT NULL,
	"internal_note" text DEFAULT '' NOT NULL,
	"customer_explanation" text NOT NULL,
	"who_acts" text NOT NULL,
	"timing_impact_days" integer,
	"placed_by_staff_id" uuid,
	"resolved_by_staff_id" uuid,
	"resolution" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "holds_who_acts" CHECK ("holds"."who_acts" in ('CUSTOMER', 'HOLYPEARLS')),
	CONSTRAINT "holds_timing" CHECK ("holds"."timing_impact_days" is null or "holds"."timing_impact_days" >= 0)
);
--> statement-breakpoint
CREATE TABLE "order_item_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_item_id" uuid NOT NULL,
	"from_status" "order_item_status",
	"to_status" "order_item_status",
	"kind" text NOT NULL,
	"note" text,
	"staff_profile_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_item_events_kind" CHECK ("order_item_events"."kind" in ('STATUS', 'HOLD_PLACED', 'HOLD_RESOLVED', 'QC'))
);
--> statement-breakpoint
CREATE TABLE "qc_results" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_item_id" uuid NOT NULL,
	"outcome" "qc_outcome" NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"staff_profile_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "holds" ADD CONSTRAINT "holds_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holds" ADD CONSTRAINT "holds_placed_by_staff_id_staff_profiles_id_fk" FOREIGN KEY ("placed_by_staff_id") REFERENCES "public"."staff_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holds" ADD CONSTRAINT "holds_resolved_by_staff_id_staff_profiles_id_fk" FOREIGN KEY ("resolved_by_staff_id") REFERENCES "public"."staff_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_events" ADD CONSTRAINT "order_item_events_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_events" ADD CONSTRAINT "order_item_events_staff_profile_id_staff_profiles_id_fk" FOREIGN KEY ("staff_profile_id") REFERENCES "public"."staff_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qc_results" ADD CONSTRAINT "qc_results_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qc_results" ADD CONSTRAINT "qc_results_staff_profile_id_staff_profiles_id_fk" FOREIGN KEY ("staff_profile_id") REFERENCES "public"."staff_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "holds_open_unique" ON "holds" USING btree ("order_item_id") WHERE "holds"."status" = 'OPEN';--> statement-breakpoint
CREATE INDEX "holds_status_idx" ON "holds" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "order_item_events_item_idx" ON "order_item_events" USING btree ("order_item_id","created_at");--> statement-breakpoint
CREATE INDEX "qc_results_item_idx" ON "qc_results" USING btree ("order_item_id","created_at");