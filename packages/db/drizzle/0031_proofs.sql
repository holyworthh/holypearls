CREATE TYPE "public"."proof_comment_kind" AS ENUM('QUESTION', 'CHANGE_REQUEST', 'REPLY', 'COMMENT');--> statement-breakpoint
CREATE TYPE "public"."proof_decision" AS ENUM('APPROVED', 'CHANGES_REQUESTED');--> statement-breakpoint
CREATE TYPE "public"."proof_status" AS ENUM('NOT_REQUIRED', 'PREPARING', 'AWAITING_APPROVAL', 'APPROVED', 'CHANGES_REQUESTED', 'REVISION_IN_PROGRESS');--> statement-breakpoint
CREATE TYPE "public"."proof_version_status" AS ENUM('DRAFT', 'PUBLISHED', 'APPROVED', 'CHANGES_REQUESTED', 'SUPERSEDED');--> statement-breakpoint
CREATE TABLE "proof_comments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"proof_version_id" uuid NOT NULL,
	"kind" "proof_comment_kind" NOT NULL,
	"body" text NOT NULL,
	"customer_id" uuid,
	"staff_profile_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proof_decisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"proof_version_id" uuid NOT NULL,
	"decision" "proof_decision" NOT NULL,
	"customer_id" uuid,
	"actor_type" text NOT NULL,
	"decided_by" text NOT NULL,
	"acknowledgement" text,
	"email_verified_at" timestamp with time zone,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proof_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"proof_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"status" "proof_version_status" DEFAULT 'DRAFT' NOT NULL,
	"views" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"details" jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"published_by_staff_id" uuid,
	"created_by_staff_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proofs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_item_id" uuid NOT NULL,
	"status" "proof_status" NOT NULL,
	"requirement" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "proof_comments" ADD CONSTRAINT "proof_comments_proof_version_id_proof_versions_id_fk" FOREIGN KEY ("proof_version_id") REFERENCES "public"."proof_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_comments" ADD CONSTRAINT "proof_comments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_comments" ADD CONSTRAINT "proof_comments_staff_profile_id_staff_profiles_id_fk" FOREIGN KEY ("staff_profile_id") REFERENCES "public"."staff_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_decisions" ADD CONSTRAINT "proof_decisions_proof_version_id_proof_versions_id_fk" FOREIGN KEY ("proof_version_id") REFERENCES "public"."proof_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_decisions" ADD CONSTRAINT "proof_decisions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_versions" ADD CONSTRAINT "proof_versions_proof_id_proofs_id_fk" FOREIGN KEY ("proof_id") REFERENCES "public"."proofs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_versions" ADD CONSTRAINT "proof_versions_published_by_staff_id_staff_profiles_id_fk" FOREIGN KEY ("published_by_staff_id") REFERENCES "public"."staff_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_versions" ADD CONSTRAINT "proof_versions_created_by_staff_id_staff_profiles_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."staff_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proofs" ADD CONSTRAINT "proofs_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "proof_comments_version_idx" ON "proof_comments" USING btree ("proof_version_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "proof_decisions_version_unique" ON "proof_decisions" USING btree ("proof_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "proof_versions_number_unique" ON "proof_versions" USING btree ("proof_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "proof_versions_one_draft" ON "proof_versions" USING btree ("proof_id") WHERE "proof_versions"."status" = 'DRAFT';--> statement-breakpoint
CREATE UNIQUE INDEX "proofs_order_item_unique" ON "proofs" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "proofs_status_idx" ON "proofs" USING btree ("status","updated_at");--> statement-breakpoint
CREATE OR REPLACE FUNCTION "proof_version_frozen"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- FUL-FR-001: a published proof version never changes; only its status moves on.
  IF OLD.status <> 'DRAFT' THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'proof version % was published and cannot be deleted', OLD.id USING ERRCODE = 'check_violation';
    END IF;
    IF (to_jsonb(NEW) - 'status' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'updated_at') OR NEW.status = 'DRAFT' THEN
      RAISE EXCEPTION 'proof version % was published and cannot change', OLD.id USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER "proof_versions_frozen" BEFORE UPDATE OR DELETE ON "proof_versions" FOR EACH ROW EXECUTE FUNCTION "proof_version_frozen"();--> statement-breakpoint
INSERT INTO "proofs" ("id", "order_item_id", "status", "requirement")
SELECT gen_random_uuid(), oi.id, 'PREPARING', 'REQUIRED' FROM "order_items" oi
WHERE NOT EXISTS (SELECT 1 FROM "proofs" p WHERE p.order_item_id = oi.id);
