CREATE TYPE "public"."below_moq_behaviour" AS ENUM('BLOCK', 'MANUAL_REVIEW', 'SURCHARGE');--> statement-breakpoint
CREATE TYPE "public"."compatibility_effect" AS ENUM('NOT_ALLOWED', 'NEEDS_REVIEW');--> statement-breakpoint
CREATE TYPE "public"."price_basis" AS ENUM('PER_UNIT', 'PER_PACK', 'FIXED');--> statement-breakpoint
CREATE TYPE "public"."price_rule_state" AS ENUM('PRICE_READY', 'ESTIMATE_READY');--> statement-breakpoint
CREATE TYPE "public"."proof_rule" AS ENUM('NOT_REQUIRED', 'OPTIONAL', 'REQUIRED');--> statement-breakpoint
CREATE TYPE "public"."rush_availability" AS ENUM('NONE', 'AVAILABLE', 'MANUAL_REVIEW');--> statement-breakpoint
CREATE TYPE "public"."sample_rule" AS ENUM('NOT_OFFERED', 'OPTIONAL', 'RECOMMENDED', 'REQUIRED');--> statement-breakpoint
CREATE TYPE "public"."vat_mode" AS ENUM('EXCLUSIVE', 'INCLUSIVE');--> statement-breakpoint
CREATE TABLE "compatibility_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"if_option" text NOT NULL,
	"if_value" text NOT NULL,
	"then_option" text NOT NULL,
	"then_values" text[] NOT NULL,
	"effect" "compatibility_effect" NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_results" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"input" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"state" text NOT NULL,
	"currency" char(3),
	"total_minor" bigint,
	"price_rule_id" uuid,
	"product_rules_version" integer,
	"tax_setting_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"currency" char(3) DEFAULT 'NGN' NOT NULL,
	"basis" "price_basis" NOT NULL,
	"pack_size" integer DEFAULT 1 NOT NULL,
	"base_minor" bigint NOT NULL,
	"tiers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"add_ons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"state" "price_rule_state" NOT NULL,
	"includes_vat" boolean DEFAULT false NOT NULL,
	"note" text,
	"created_by_staff_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_rules_pack_size" CHECK ("price_rules"."pack_size" >= 1),
	CONSTRAINT "price_rules_base_nonnegative" CHECK ("price_rules"."base_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "product_rules" (
	"product_id" uuid PRIMARY KEY NOT NULL,
	"moq" integer DEFAULT 1 NOT NULL,
	"below_moq" "below_moq_behaviour" DEFAULT 'BLOCK' NOT NULL,
	"below_moq_surcharge_bps" integer DEFAULT 0 NOT NULL,
	"max_auto_quantity" integer,
	"lead_min_days" integer DEFAULT 1 NOT NULL,
	"lead_max_days" integer DEFAULT 5 NOT NULL,
	"rush" "rush_availability" DEFAULT 'NONE' NOT NULL,
	"rush_surcharge_bps" integer DEFAULT 0 NOT NULL,
	"priority_rush" "rush_availability" DEFAULT 'NONE' NOT NULL,
	"priority_rush_surcharge_bps" integer DEFAULT 0 NOT NULL,
	"artwork_later" boolean DEFAULT true NOT NULL,
	"sample" "sample_rule" DEFAULT 'NOT_OFFERED' NOT NULL,
	"sample_multiplier_bps" integer DEFAULT 10000 NOT NULL,
	"sample_minimum_minor" bigint DEFAULT 0 NOT NULL,
	"proof" "proof_rule" DEFAULT 'REQUIRED' NOT NULL,
	"proof_skippable_on_reorder" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_rules_moq_positive" CHECK ("product_rules"."moq" >= 1),
	CONSTRAINT "product_rules_lead_order" CHECK ("product_rules"."lead_min_days" >= 0 and "product_rules"."lead_max_days" >= "product_rules"."lead_min_days"),
	CONSTRAINT "product_rules_bps_range" CHECK ("product_rules"."below_moq_surcharge_bps" between 0 and 100000 and "product_rules"."rush_surcharge_bps" between 0 and 100000 and "product_rules"."priority_rush_surcharge_bps" between 0 and 100000),
	CONSTRAINT "product_rules_max_auto" CHECK ("product_rules"."max_auto_quantity" is null or "product_rules"."max_auto_quantity" >= "product_rules"."moq")
);
--> statement-breakpoint
CREATE TABLE "tax_settings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"vat_rate_bps" integer NOT NULL,
	"vat_on_delivery" boolean DEFAULT true NOT NULL,
	"note" text,
	"created_by_staff_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tax_settings_rate_range" CHECK ("tax_settings"."vat_rate_bps" between 0 and 10000)
);
--> statement-breakpoint
ALTER TABLE "compatibility_rules" ADD CONSTRAINT "compatibility_rules_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_results" ADD CONSTRAINT "price_results_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_results" ADD CONSTRAINT "price_results_price_rule_id_price_rules_id_fk" FOREIGN KEY ("price_rule_id") REFERENCES "public"."price_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_results" ADD CONSTRAINT "price_results_tax_setting_id_tax_settings_id_fk" FOREIGN KEY ("tax_setting_id") REFERENCES "public"."tax_settings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_rules" ADD CONSTRAINT "price_rules_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_rules" ADD CONSTRAINT "price_rules_created_by_staff_id_staff_profiles_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."staff_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_rules" ADD CONSTRAINT "product_rules_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_settings" ADD CONSTRAINT "tax_settings_created_by_staff_id_staff_profiles_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."staff_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "compatibility_rules_product_idx" ON "compatibility_rules" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "price_results_created_idx" ON "price_results" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "price_rules_product_effective_unique" ON "price_rules" USING btree ("product_id","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "tax_settings_effective_unique" ON "tax_settings" USING btree ("effective_from");