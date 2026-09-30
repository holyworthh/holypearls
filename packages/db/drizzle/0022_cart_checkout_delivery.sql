CREATE TYPE "public"."delivery_pricing" AS ENUM('FIXED', 'QUOTE');--> statement-breakpoint
CREATE TYPE "public"."delivery_zone_kind" AS ENUM('AREA', 'REST_OF_NIGERIA', 'INTERNATIONAL');--> statement-breakpoint
CREATE TYPE "public"."cart_item_group" AS ENUM('READY', 'QUOTE');--> statement-breakpoint
CREATE TYPE "public"."checkout_status" AS ENUM('OPEN', 'COMPLETED', 'ABANDONED');--> statement-breakpoint
CREATE TABLE "delivery_zones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" "delivery_zone_kind" DEFAULT 'AREA' NOT NULL,
	"covers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pricing" "delivery_pricing" NOT NULL,
	"rate_minor" bigint,
	"transit_min_days" integer,
	"transit_max_days" integer,
	"position" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_zones_rate" CHECK (("delivery_zones"."pricing" = 'FIXED' and "delivery_zones"."rate_minor" >= 0) or ("delivery_zones"."pricing" = 'QUOTE' and "delivery_zones"."rate_minor" is null))
);
--> statement-breakpoint
CREATE TABLE "cart_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"cart_id" uuid NOT NULL,
	"configuration_id" uuid NOT NULL,
	"group" "cart_item_group" NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "carts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" uuid,
	"owner_device_hash" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checkouts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"cart_id" uuid,
	"status" "checkout_status" DEFAULT 'OPEN' NOT NULL,
	"owner_user_id" uuid,
	"owner_device_hash" text,
	"customer_id" uuid,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"items" jsonb NOT NULL,
	"configuration_ids" uuid[] NOT NULL,
	"contact" jsonb,
	"address" jsonb,
	"delivery_zone_id" uuid,
	"delivery" jsonb,
	"billing" jsonb,
	"goods_minor" bigint NOT NULL,
	"delivery_minor" bigint,
	"vat_minor" bigint NOT NULL,
	"total_minor" bigint NOT NULL,
	"vat_rate_bps" integer NOT NULL,
	"vat_on_delivery" boolean NOT NULL,
	"tax_setting_id" uuid,
	"step" text DEFAULT 'contact' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "configurations" ADD COLUMN "saved_for_later_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_configuration_id_configurations_id_fk" FOREIGN KEY ("configuration_id") REFERENCES "public"."configurations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_delivery_zone_id_delivery_zones_id_fk" FOREIGN KEY ("delivery_zone_id") REFERENCES "public"."delivery_zones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_zones_name_unique" ON "delivery_zones" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_zones_rest_unique" ON "delivery_zones" USING btree ("kind") WHERE "delivery_zones"."kind" <> 'AREA';--> statement-breakpoint
CREATE UNIQUE INDEX "cart_items_configuration_unique" ON "cart_items" USING btree ("configuration_id");--> statement-breakpoint
CREATE INDEX "cart_items_cart_idx" ON "cart_items" USING btree ("cart_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "carts_owner_user_unique" ON "carts" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "carts_owner_device_unique" ON "carts" USING btree ("owner_device_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "checkouts_open_cart_unique" ON "checkouts" USING btree ("cart_id") WHERE "checkouts"."status" = 'OPEN';--> statement-breakpoint
CREATE INDEX "checkouts_customer_idx" ON "checkouts" USING btree ("customer_id");