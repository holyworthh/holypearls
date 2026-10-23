CREATE TABLE "fabrics" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"colours" text[] DEFAULT '{}'::text[] NOT NULL,
	"size_range" text DEFAULT '' NOT NULL,
	"supplier_code" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fabrics_status" CHECK ("fabrics"."status" in ('ACTIVE', 'ARCHIVED'))
);
--> statement-breakpoint
CREATE TABLE "placement_blocks" (
	"method" text NOT NULL,
	"position" text NOT NULL,
	"message" text NOT NULL,
	CONSTRAINT "placement_blocks_method_position_pk" PRIMARY KEY("method","position"),
	CONSTRAINT "placement_blocks_method" CHECK ("placement_blocks"."method" in ('EMBROIDERY', 'PRINT'))
);
--> statement-breakpoint
ALTER TABLE "configurations" ADD COLUMN "previous_total_minor" bigint;--> statement-breakpoint
CREATE UNIQUE INDEX "fabrics_key_unique" ON "fabrics" USING btree ("key");--> statement-breakpoint
-- The rule the configurator used to hard-code (T03-05): embroidery is too heavy for the full front or back.
INSERT INTO "placement_blocks" ("method", "position", "message") VALUES
  ('EMBROIDERY', 'FULL_FRONT', 'Embroidery can''t cover the full front: it''s too heavy for the fabric. Print it instead, or choose a smaller area.'),
  ('EMBROIDERY', 'FULL_BACK', 'Embroidery can''t cover the full back: it''s too heavy for the fabric. Print it instead, or choose a smaller area.');
