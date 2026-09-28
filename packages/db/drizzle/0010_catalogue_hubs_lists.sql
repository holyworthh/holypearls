CREATE TABLE "merchandising_lists" (
	"key" text PRIMARY KEY NOT NULL,
	"product_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "hub" jsonb;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "hub_draft" jsonb;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "hub_published_at" timestamp with time zone;