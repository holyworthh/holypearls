CREATE TYPE "public"."site_event_kind" AS ENUM('PRODUCT', 'CATEGORY', 'PROJECT', 'START_PROJECT', 'CONFIGURE', 'CONTACT');--> statement-breakpoint
CREATE TABLE "site_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" "site_event_kind" NOT NULL,
	"from_guide" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "site_events_created_idx" ON "site_events" USING btree ("created_at" DESC NULLS LAST);