CREATE TYPE "public"."collection_delivery_mode" AS ENUM('CENTRAL', 'BRANCHES');--> statement-breakpoint
CREATE TYPE "public"."collection_status" AS ENUM('DRAFT', 'OPEN', 'PAUSED', 'CLOSED', 'NEEDS_REVIEW', 'READY_TO_ORDER', 'ORDER_DRAFT_CREATED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."unsure_size_rule" AS ENUM('ALLOW_UNSURE', 'REQUIRE_SIZE');--> statement-breakpoint
CREATE TABLE "group_collections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"title" text NOT NULL,
	"status" "collection_status" DEFAULT 'DRAFT' NOT NULL,
	"template_id" uuid,
	"source_configuration_id" uuid NOT NULL,
	"fields" text[] DEFAULT '{}'::text[] NOT NULL,
	"deadline" timestamp with time zone,
	"delivery_mode" "collection_delivery_mode" DEFAULT 'CENTRAL' NOT NULL,
	"central_location_id" uuid,
	"branch_location_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"unsure_size_rule" "unsure_size_rule" DEFAULT 'ALLOW_UNSURE' NOT NULL,
	"share_secret_hash" text,
	"share_secret_sealed" text,
	"snapshot" jsonb NOT NULL,
	"created_by_user_id" uuid,
	"opened_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_collections_central" CHECK ("group_collections"."delivery_mode" <> 'CENTRAL' or "group_collections"."central_location_id" is not null or "group_collections"."status" = 'DRAFT')
);
--> statement-breakpoint
ALTER TABLE "group_collections" ADD CONSTRAINT "group_collections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_collections" ADD CONSTRAINT "group_collections_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_collections" ADD CONSTRAINT "group_collections_source_configuration_id_configurations_id_fk" FOREIGN KEY ("source_configuration_id") REFERENCES "public"."configurations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_collections" ADD CONSTRAINT "group_collections_central_location_id_locations_id_fk" FOREIGN KEY ("central_location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_collections" ADD CONSTRAINT "group_collections_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_collections" ADD CONSTRAINT "group_collections_location_fk" FOREIGN KEY ("location_id","organization_id") REFERENCES "public"."locations"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "group_collections_organization_idx" ON "group_collections" USING btree ("organization_id","status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "group_collections_share_unique" ON "group_collections" USING btree ("share_secret_hash");