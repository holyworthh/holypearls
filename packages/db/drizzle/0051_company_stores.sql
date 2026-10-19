CREATE TYPE "public"."store_mode" AS ENUM('PROCUREMENT', 'SELF_ORDER');--> statement-breakpoint
CREATE TYPE "public"."store_routing" AS ENUM('INDIVIDUAL', 'COLLECTION');--> statement-breakpoint
CREATE TYPE "public"."store_status" AS ENUM('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');--> statement-breakpoint
CREATE TABLE "company_store_items" (
	"store_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"collection_id" uuid,
	CONSTRAINT "company_store_items_store_id_template_id_pk" PRIMARY KEY("store_id","template_id")
);
--> statement-breakpoint
CREATE TABLE "company_stores" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" "store_status" DEFAULT 'DRAFT' NOT NULL,
	"mode" "store_mode" NOT NULL,
	"routing" "store_routing" DEFAULT 'INDIVIDUAL' NOT NULL,
	"created_by_user_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_store_items" ADD CONSTRAINT "company_store_items_store_id_company_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."company_stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_store_items" ADD CONSTRAINT "company_store_items_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_store_items" ADD CONSTRAINT "company_store_items_collection_id_group_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."group_collections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_stores" ADD CONSTRAINT "company_stores_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_stores" ADD CONSTRAINT "company_stores_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "company_stores_organization_idx" ON "company_stores" USING btree ("organization_id","status");