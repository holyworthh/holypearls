CREATE TYPE "public"."artwork_choice" AS ENUM('UPLOAD', 'DESIGN_HELP', 'LATER');--> statement-breakpoint
CREATE TYPE "public"."configuration_status" AS ENUM('DRAFT', 'IN_CART', 'QUOTE_REQUESTED', 'ABANDONED');--> statement-breakpoint
CREATE TYPE "public"."rush_choice" AS ENUM('STANDARD', 'RUSH', 'PRIORITY');--> statement-breakpoint
CREATE TABLE "configuration_selections" (
	"configuration_id" uuid NOT NULL,
	"option_key" text NOT NULL,
	"value_key" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"from_default" boolean DEFAULT false NOT NULL,
	CONSTRAINT "configuration_selections_configuration_id_option_key_pk" PRIMARY KEY("configuration_id","option_key")
);
--> statement-breakpoint
CREATE TABLE "configurations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"status" "configuration_status" DEFAULT 'DRAFT' NOT NULL,
	"owner_user_id" uuid,
	"owner_device_hash" text,
	"customer_id" uuid,
	"quantity" integer,
	"rush" "rush_choice" DEFAULT 'STANDARD' NOT NULL,
	"artwork" "artwork_choice",
	"artwork_file_id" uuid,
	"step" text DEFAULT 'options' NOT NULL,
	"last_price_result_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "configuration_selections" ADD CONSTRAINT "configuration_selections_configuration_id_configurations_id_fk" FOREIGN KEY ("configuration_id") REFERENCES "public"."configurations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configurations" ADD CONSTRAINT "configurations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configurations" ADD CONSTRAINT "configurations_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configurations" ADD CONSTRAINT "configurations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configurations" ADD CONSTRAINT "configurations_artwork_file_id_files_id_fk" FOREIGN KEY ("artwork_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configurations" ADD CONSTRAINT "configurations_last_price_result_id_price_results_id_fk" FOREIGN KEY ("last_price_result_id") REFERENCES "public"."price_results"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "configurations_owner_user_idx" ON "configurations" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "configurations_device_idx" ON "configurations" USING btree ("owner_device_hash");