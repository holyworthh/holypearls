CREATE TABLE "courier_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_key" text NOT NULL,
	"event" text NOT NULL,
	"courier_order_id" text,
	"raw_body" text NOT NULL,
	"outcome" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "courier_order_id" text;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "courier_service" text;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "courier_tracking_url" text;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "courier_cost_minor" bigint;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "courier_booked_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "courier_events_key_unique" ON "courier_events" USING btree ("event_key");--> statement-breakpoint
CREATE INDEX "courier_events_order_idx" ON "courier_events" USING btree ("courier_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shipments_courier_order_unique" ON "shipments" USING btree ("courier_order_id");