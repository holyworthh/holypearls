CREATE TYPE "public"."field_control" AS ENUM('LOCKED', 'EDITABLE');--> statement-breakpoint
CREATE TYPE "public"."template_status" AS ENUM('DRAFT', 'AWAITING_APPROVAL', 'APPROVED', 'NEEDS_REVIEW', 'ARCHIVED');--> statement-breakpoint
CREATE TABLE "template_asset_links" (
	"template_id" uuid NOT NULL,
	"asset_version_id" uuid NOT NULL,
	CONSTRAINT "template_asset_links_template_id_asset_version_id_pk" PRIMARY KEY("template_id","asset_version_id")
);
--> statement-breakpoint
CREATE TABLE "template_fields" (
	"template_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"value" text NOT NULL,
	"control" "field_control" NOT NULL,
	"reason" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "template_fields_template_id_key_pk" PRIMARY KEY("template_id","key")
);
--> statement-breakpoint
CREATE TABLE "template_locations" (
	"template_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	CONSTRAINT "template_locations_template_id_location_id_pk" PRIMARY KEY("template_id","location_id")
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" "template_status" DEFAULT 'DRAFT' NOT NULL,
	"product_id" uuid NOT NULL,
	"source_configuration_id" uuid NOT NULL,
	"specification" jsonb NOT NULL,
	"all_locations" boolean DEFAULT true NOT NULL,
	"review_note" text,
	"created_by_user_id" uuid,
	"approved_by_staff_id" uuid,
	"approved_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "templates_id_organization_unique" UNIQUE("id","organization_id")
);
--> statement-breakpoint
ALTER TABLE "template_asset_links" ADD CONSTRAINT "template_asset_links_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_asset_links" ADD CONSTRAINT "template_asset_links_asset_version_id_brand_asset_versions_id_fk" FOREIGN KEY ("asset_version_id") REFERENCES "public"."brand_asset_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_fields" ADD CONSTRAINT "template_fields_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_locations" ADD CONSTRAINT "template_locations_template_fk" FOREIGN KEY ("template_id","organization_id") REFERENCES "public"."templates"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_locations" ADD CONSTRAINT "template_locations_location_fk" FOREIGN KEY ("location_id","organization_id") REFERENCES "public"."locations"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_source_configuration_id_configurations_id_fk" FOREIGN KEY ("source_configuration_id") REFERENCES "public"."configurations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_approved_by_staff_id_staff_profiles_id_fk" FOREIGN KEY ("approved_by_staff_id") REFERENCES "public"."staff_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "template_asset_links_version_idx" ON "template_asset_links" USING btree ("asset_version_id");--> statement-breakpoint
CREATE INDEX "templates_organization_idx" ON "templates" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "templates_status_idx" ON "templates" USING btree ("status","updated_at");