CREATE TABLE "courier_bookings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"shipment_id" uuid NOT NULL,
	"status" text NOT NULL,
	"request_token" text NOT NULL,
	"service_code" text NOT NULL,
	"courier_id" text NOT NULL,
	"courier_name" text NOT NULL,
	"cost_minor" bigint NOT NULL,
	"priced_minor" bigint,
	"note" text NOT NULL,
	"result" jsonb,
	"failure_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "courier_bookings_status" CHECK ("courier_bookings"."status" in ('SENDING', 'UNKNOWN', 'ACCEPTED', 'FINALIZED', 'NOT_BOOKED')),
	CONSTRAINT "courier_bookings_result" CHECK ("courier_bookings"."status" not in ('ACCEPTED', 'FINALIZED') or "courier_bookings"."result" is not null)
);
--> statement-breakpoint
ALTER TABLE "courier_bookings" ADD CONSTRAINT "courier_bookings_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "courier_bookings_active_unique" ON "courier_bookings" USING btree ("shipment_id") WHERE "courier_bookings"."status" in ('SENDING', 'UNKNOWN', 'ACCEPTED');--> statement-breakpoint
CREATE INDEX "courier_bookings_shipment_idx" ON "courier_bookings" USING btree ("shipment_id","created_at");