CREATE TYPE "public"."quote_line_source" AS ENUM('PROJECT_RECOMMENDATION', 'PROJECT_ITEM', 'CONFIGURATION', 'MANUAL');--> statement-breakpoint
CREATE TYPE "public"."quote_version_status" AS ENUM('DRAFT', 'SENT', 'SUPERSEDED', 'ACCEPTED', 'DECLINED', 'EXPIRED');--> statement-breakpoint
CREATE TABLE "quote_line_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"quote_version_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"source" "quote_line_source" NOT NULL,
	"source_key" text,
	"product_id" uuid,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"quantity" integer NOT NULL,
	"unit_minor" bigint NOT NULL,
	"total_minor" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quote_line_items_quantity_positive" CHECK ("quote_line_items"."quantity" > 0),
	CONSTRAINT "quote_line_items_unit" CHECK ("quote_line_items"."unit_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "quote_settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"valid_days" integer DEFAULT 14 NOT NULL,
	"expiring_notice_days" integer DEFAULT 3 NOT NULL,
	"default_schedule" jsonb NOT NULL,
	"default_terms" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by_staff_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quote_settings_single_row" CHECK ("quote_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "quote_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"quote_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"status" "quote_version_status" DEFAULT 'DRAFT' NOT NULL,
	"currency" char(3) NOT NULL,
	"design_minor" bigint NOT NULL,
	"delivery_minor" bigint NOT NULL,
	"delivery_note" text DEFAULT '' NOT NULL,
	"installation_minor" bigint NOT NULL,
	"installation_note" text DEFAULT '' NOT NULL,
	"other_minor" bigint NOT NULL,
	"other_label" text DEFAULT '' NOT NULL,
	"vat_rate_bps" smallint NOT NULL,
	"vat_on_delivery" boolean DEFAULT false NOT NULL,
	"goods_minor" bigint NOT NULL,
	"fees_minor" bigint NOT NULL,
	"vat_minor" bigint NOT NULL,
	"total_minor" bigint NOT NULL,
	"valid_days" integer NOT NULL,
	"valid_until" timestamp with time zone,
	"terms" text DEFAULT '' NOT NULL,
	"assumptions" text DEFAULT '' NOT NULL,
	"production_sequence" text DEFAULT '' NOT NULL,
	"schedule" jsonb NOT NULL,
	"snapshot" jsonb,
	"sent_at" timestamp with time zone,
	"sent_by_staff_id" uuid,
	"created_by_staff_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quote_versions_amounts" CHECK ("quote_versions"."design_minor" >= 0 and "quote_versions"."delivery_minor" >= 0 and "quote_versions"."installation_minor" >= 0 and "quote_versions"."other_minor" >= 0)
);
--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "submitted_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "contact" jsonb;--> statement-breakpoint
ALTER TABLE "quote_line_items" ADD CONSTRAINT "quote_line_items_quote_version_id_quote_versions_id_fk" FOREIGN KEY ("quote_version_id") REFERENCES "public"."quote_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_line_items" ADD CONSTRAINT "quote_line_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_settings" ADD CONSTRAINT "quote_settings_updated_by_staff_id_staff_profiles_id_fk" FOREIGN KEY ("updated_by_staff_id") REFERENCES "public"."staff_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_versions" ADD CONSTRAINT "quote_versions_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_versions" ADD CONSTRAINT "quote_versions_sent_by_staff_id_staff_profiles_id_fk" FOREIGN KEY ("sent_by_staff_id") REFERENCES "public"."staff_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_versions" ADD CONSTRAINT "quote_versions_created_by_staff_id_staff_profiles_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."staff_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quote_line_items_version_idx" ON "quote_line_items" USING btree ("quote_version_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "quote_versions_number_unique" ON "quote_versions" USING btree ("quote_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "quote_versions_one_sent" ON "quote_versions" USING btree ("quote_id") WHERE "quote_versions"."status" = 'SENT';--> statement-breakpoint
CREATE UNIQUE INDEX "quote_versions_one_draft" ON "quote_versions" USING btree ("quote_id") WHERE "quote_versions"."status" = 'DRAFT';--> statement-breakpoint
CREATE INDEX "quote_versions_valid_until_idx" ON "quote_versions" USING btree ("valid_until");--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "quotes_project_unique" ON "quotes" USING btree ("project_id");--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS "project_reference_seq" START 1;--> statement-breakpoint
INSERT INTO "quote_settings" ("id", "valid_days", "expiring_notice_days", "default_schedule", "default_terms") VALUES (1, 14, 3, '[{"label":"Deposit","kind":"PERCENT","value":"5000","trigger":"ON_ACCEPTANCE"},{"label":"Balance","kind":"PERCENT","value":"5000","trigger":"BEFORE_DISPATCH"}]'::jsonb, 'Prices include one proof round per item. Production starts after the deposit and proof approval.') ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
CREATE OR REPLACE FUNCTION "quote_version_frozen"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- QUOTE-FR-001: once sent, a version's content never changes; only its status moves on.
  IF OLD.status <> 'DRAFT' THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'quote version % was sent and cannot be deleted', OLD.id USING ERRCODE = 'check_violation';
    END IF;
    IF (to_jsonb(NEW) - 'status' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'updated_at') THEN
      RAISE EXCEPTION 'quote version % was sent and cannot change', OLD.id USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status = 'DRAFT' THEN
      RAISE EXCEPTION 'quote version % was sent and cannot go back to DRAFT', OLD.id USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER "quote_versions_frozen" BEFORE UPDATE OR DELETE ON "quote_versions" FOR EACH ROW EXECUTE FUNCTION "quote_version_frozen"();--> statement-breakpoint
CREATE OR REPLACE FUNCTION "quote_line_frozen"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  parent_status text;
BEGIN
  SELECT status INTO parent_status FROM quote_versions WHERE id = COALESCE(NEW.quote_version_id, OLD.quote_version_id);
  IF parent_status IS NOT NULL AND parent_status <> 'DRAFT' THEN
    RAISE EXCEPTION 'the lines of a sent quote version cannot change' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER "quote_line_items_frozen" BEFORE INSERT OR UPDATE OR DELETE ON "quote_line_items" FOR EACH ROW EXECUTE FUNCTION "quote_line_frozen"();
