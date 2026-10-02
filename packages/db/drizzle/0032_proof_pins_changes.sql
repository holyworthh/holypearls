CREATE TYPE "public"."change_outcome" AS ENUM('NEW_PROOF_VERSION', 'QUOTE_REVISION', 'NONE');--> statement-breakpoint
CREATE TYPE "public"."change_request_status" AS ENUM('OPEN', 'UNDER_REVIEW', 'ACCEPTED', 'DECLINED');--> statement-breakpoint
CREATE TYPE "public"."change_stage" AS ENUM('BEFORE_PRODUCTION', 'AFTER_PRODUCTION_START');--> statement-breakpoint
CREATE TABLE "change_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"proof_id" uuid,
	"stage" "change_stage" NOT NULL,
	"status" "change_request_status" DEFAULT 'OPEN' NOT NULL,
	"description" text NOT NULL,
	"customer_id" uuid,
	"cost_impact_minor" bigint,
	"timing_impact_days" integer,
	"outcome" "change_outcome",
	"staff_note" text,
	"decided_by_staff_id" uuid,
	"decided_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "proof_comments" ADD COLUMN "pin_x" numeric(6, 5);--> statement-breakpoint
ALTER TABLE "proof_comments" ADD COLUMN "pin_y" numeric(6, 5);--> statement-breakpoint
ALTER TABLE "proof_comments" ADD COLUMN "pin_view" integer;--> statement-breakpoint
ALTER TABLE "proof_comments" ADD COLUMN "pin_number" integer;--> statement-breakpoint
ALTER TABLE "proof_comments" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_proof_id_proofs_id_fk" FOREIGN KEY ("proof_id") REFERENCES "public"."proofs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_decided_by_staff_id_staff_profiles_id_fk" FOREIGN KEY ("decided_by_staff_id") REFERENCES "public"."staff_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "change_requests_status_idx" ON "change_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "change_requests_order_idx" ON "change_requests" USING btree ("order_id");--> statement-breakpoint
ALTER TABLE "proof_comments" ADD CONSTRAINT "proof_comments_parent_id_proof_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."proof_comments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "proof_comments_pin_number_unique" ON "proof_comments" USING btree ("proof_version_id","pin_number");--> statement-breakpoint
ALTER TABLE "proof_comments" ADD CONSTRAINT "proof_comments_pin_range" CHECK ("proof_comments"."pin_x" is null or ("proof_comments"."pin_x" between 0 and 1 and "proof_comments"."pin_y" between 0 and 1));