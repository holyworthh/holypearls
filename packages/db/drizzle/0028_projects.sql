CREATE TYPE "public"."project_item_kind" AS ENUM('CATALOGUE', 'CUSTOM');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'QUOTED', 'ORDERED', 'COMPLETED', 'CANCELLED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."project_step" AS ENUM('PROJECT', 'SCALE', 'DATE_LOCATION', 'BRAND', 'RECOMMENDATIONS', 'REVIEW');--> statement-breakpoint
CREATE TYPE "public"."project_type" AS ENUM('EVENT', 'STAFF_UNIFORMS', 'BUSINESS_LAUNCH', 'CORPORATE_GIFTS', 'RETAIL_SPACE', 'MERCHANDISE', 'PACKAGING', 'FASHION_PRODUCTION', 'SCHOOL_UNIFORMS', 'HOSPITALITY', 'WEDDING', 'CAMPAIGN', 'SOMETHING_ELSE');--> statement-breakpoint
CREATE TYPE "public"."recommendation_group" AS ENUM('RECOMMENDED', 'USEFUL', 'OPTIONAL');--> statement-breakpoint
CREATE TYPE "public"."recommendation_state" AS ENUM('SUGGESTED', 'INCLUDED', 'REMOVED');--> statement-breakpoint
CREATE TABLE "project_files" (
	"project_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"item_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_files_project_id_file_id_pk" PRIMARY KEY("project_id","file_id")
);
--> statement-breakpoint
CREATE TABLE "project_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" "project_item_kind" NOT NULL,
	"product_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"quantity" integer,
	"quantity_note" text,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_items_quantity_positive" CHECK ("project_items"."quantity" is null or "project_items"."quantity" > 0),
	CONSTRAINT "project_items_catalogue_product" CHECK ("project_items"."kind" = 'CUSTOM' or "project_items"."product_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "project_recommendations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"rule_key" text NOT NULL,
	"group" "recommendation_group" NOT NULL,
	"name" text NOT NULL,
	"reason" text NOT NULL,
	"product_id" uuid,
	"suggested_quantity" integer,
	"customer_quantity" integer,
	"state" "recommendation_state" NOT NULL,
	"customer_overridden" boolean DEFAULT false NOT NULL,
	"still_suggested" boolean DEFAULT true NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reference" text,
	"status" "project_status" DEFAULT 'DRAFT' NOT NULL,
	"type" "project_type" NOT NULL,
	"title" text,
	"step" "project_step" DEFAULT 'PROJECT' NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"owner_user_id" uuid,
	"owner_device_hash" text,
	"customer_id" uuid,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendation_rule_sets" (
	"project_type" "project_type" PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by_staff_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendation_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_type" "project_type" NOT NULL,
	"group" "recommendation_group" NOT NULL,
	"product_id" uuid,
	"item_name" text NOT NULL,
	"condition" jsonb NOT NULL,
	"quantity" jsonb NOT NULL,
	"reason" text NOT NULL,
	"position" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_files" ADD CONSTRAINT "project_files_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_files" ADD CONSTRAINT "project_files_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_files" ADD CONSTRAINT "project_files_item_id_project_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."project_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_items" ADD CONSTRAINT "project_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_items" ADD CONSTRAINT "project_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_recommendations" ADD CONSTRAINT "project_recommendations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_recommendations" ADD CONSTRAINT "project_recommendations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_rule_sets" ADD CONSTRAINT "recommendation_rule_sets_updated_by_staff_id_staff_profiles_id_fk" FOREIGN KEY ("updated_by_staff_id") REFERENCES "public"."staff_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_rules" ADD CONSTRAINT "recommendation_rules_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_items_project_idx" ON "project_items" USING btree ("project_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "project_recommendations_rule_unique" ON "project_recommendations" USING btree ("project_id","rule_key");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_reference_unique" ON "projects" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "projects_owner_user_idx" ON "projects" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "projects_device_idx" ON "projects" USING btree ("owner_device_hash");--> statement-breakpoint
CREATE INDEX "projects_status_idx" ON "projects" USING btree ("status","last_activity_at");--> statement-breakpoint
CREATE INDEX "recommendation_rules_type_idx" ON "recommendation_rules" USING btree ("project_type","position");