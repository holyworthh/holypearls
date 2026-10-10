CREATE TYPE "public"."order_draft_status" AS ENUM('CURRENT', 'STALE', 'SUBMITTED');--> statement-breakpoint
CREATE TABLE "order_drafts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"collection_id" uuid NOT NULL,
	"status" "order_draft_status" DEFAULT 'CURRENT' NOT NULL,
	"snapshot" jsonb NOT NULL,
	"configuration_id" uuid,
	"order_request_id" uuid,
	"quote_id" uuid,
	"created_by_user_id" uuid,
	"submitted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_drafts" ADD CONSTRAINT "order_drafts_collection_id_group_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."group_collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_drafts" ADD CONSTRAINT "order_drafts_configuration_id_configurations_id_fk" FOREIGN KEY ("configuration_id") REFERENCES "public"."configurations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_drafts" ADD CONSTRAINT "order_drafts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_drafts_collection_idx" ON "order_drafts" USING btree ("collection_id","status");--> statement-breakpoint
CREATE INDEX "order_drafts_configuration_idx" ON "order_drafts" USING btree ("configuration_id");