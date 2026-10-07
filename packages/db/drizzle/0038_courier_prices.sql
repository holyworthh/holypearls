CREATE TABLE "courier_settings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"rule" text DEFAULT 'CHEAPEST' NOT NULL,
	"category_id" integer,
	"pickup" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_option_values" ADD COLUMN "shipping_weight_grams" integer;--> statement-breakpoint
ALTER TABLE "product_option_values" ADD COLUMN "package_cm" jsonb;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "shipping_weight_grams" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "package_cm" jsonb;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "units_per_package" integer;