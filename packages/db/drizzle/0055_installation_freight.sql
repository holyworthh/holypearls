ALTER TYPE "public"."delivery_zone_kind" ADD VALUE 'COUNTRIES';--> statement-breakpoint
CREATE TABLE "installation_areas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"states" text[] DEFAULT '{}'::text[] NOT NULL,
	"product_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"pricing" text NOT NULL,
	"rate_minor" bigint,
	"travel_minor" bigint,
	"position" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "installation_areas_pricing" CHECK ("installation_areas"."pricing" in ('FIXED', 'FIXED_PLUS_TRAVEL', 'QUOTE')),
	CONSTRAINT "installation_areas_rates" CHECK (("installation_areas"."pricing" = 'QUOTE') or ("installation_areas"."rate_minor" is not null and "installation_areas"."rate_minor" >= 0 and ("installation_areas"."pricing" = 'FIXED' or ("installation_areas"."travel_minor" is not null and "installation_areas"."travel_minor" >= 0))))
);
--> statement-breakpoint
CREATE TABLE "installation_rules" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"survey_above_sq_m" integer,
	"notice_working_days" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "delivery_zones_rest_unique";--> statement-breakpoint
ALTER TABLE "delivery_zones" ADD COLUMN "countries" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "installation_areas_name_unique" ON "installation_areas" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_zones_rest_unique" ON "delivery_zones" USING btree ("kind") WHERE "delivery_zones"."kind" in ('REST_OF_NIGERIA', 'INTERNATIONAL');--> statement-breakpoint
-- Pen 119's two rules, on (test values; confirm before launch).
INSERT INTO "installation_rules" ("id", "survey_above_sq_m", "notice_working_days") VALUES (1, 6, 5);
