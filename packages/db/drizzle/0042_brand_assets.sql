CREATE TYPE "public"."asset_version_status" AS ENUM('PROCESSING', 'NEEDS_REVIEW', 'PRODUCTION_READY', 'SUPERSEDED', 'RETIRED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."brand_asset_kind" AS ENUM('LOGO', 'PRINT', 'EMBROIDERY', 'GUIDELINES', 'PACKAGING');--> statement-breakpoint
ALTER TYPE "public"."file_purpose" ADD VALUE 'BRAND_ASSET';--> statement-breakpoint
CREATE TABLE "brand_asset_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"asset_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"file_id" uuid NOT NULL,
	"status" "asset_version_status" DEFAULT 'PROCESSING' NOT NULL,
	"review_note" text,
	"reviewed_by_staff_id" uuid,
	"reviewed_at" timestamp with time zone,
	"uploaded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brand_asset_versions_number_unique" UNIQUE("asset_id","number")
);
--> statement-breakpoint
CREATE TABLE "brand_assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "brand_asset_kind" NOT NULL,
	"created_by_user_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brand_asset_versions" ADD CONSTRAINT "brand_asset_versions_asset_id_brand_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."brand_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_asset_versions" ADD CONSTRAINT "brand_asset_versions_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_asset_versions" ADD CONSTRAINT "brand_asset_versions_reviewed_by_staff_id_staff_profiles_id_fk" FOREIGN KEY ("reviewed_by_staff_id") REFERENCES "public"."staff_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_asset_versions" ADD CONSTRAINT "brand_asset_versions_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_assets" ADD CONSTRAINT "brand_assets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_assets" ADD CONSTRAINT "brand_assets_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "brand_asset_versions_file_unique" ON "brand_asset_versions" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "brand_asset_versions_status_idx" ON "brand_asset_versions" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "brand_assets_organization_idx" ON "brand_assets" USING btree ("organization_id","kind");