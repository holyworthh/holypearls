CREATE TYPE "public"."approval_decision" AS ENUM('APPROVED', 'REJECTED', 'CHANGES_REQUESTED');--> statement-breakpoint
CREATE TYPE "public"."approval_rule" AS ENUM('NONE', 'ALL', 'ABOVE_AMOUNT', 'REQUESTERS');--> statement-breakpoint
CREATE TYPE "public"."order_request_status" AS ENUM('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'SENT_TO_HOLYPEARLS', 'CANCELLED');--> statement-breakpoint
ALTER TYPE "public"."configuration_status" ADD VALUE 'AWAITING_APPROVAL';--> statement-breakpoint
CREATE TABLE "approval_policies" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"rule" "approval_rule" DEFAULT 'NONE' NOT NULL,
	"threshold_minor" bigint,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"separate_requester_approver" boolean DEFAULT true NOT NULL,
	"updated_by_user_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approval_policies_threshold" CHECK ("approval_policies"."rule" <> 'ABOVE_AMOUNT' or "approval_policies"."threshold_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "approval_policy_requesters" (
	"organization_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	CONSTRAINT "approval_policy_requesters_organization_id_membership_id_pk" PRIMARY KEY("organization_id","membership_id")
);
--> statement-breakpoint
CREATE TABLE "order_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"title" text NOT NULL,
	"status" "order_request_status" DEFAULT 'DRAFT' NOT NULL,
	"requested_by_user_id" uuid,
	"requested_by_membership_id" uuid,
	"estimated_total_minor" bigint,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"configuration_ids" uuid[] NOT NULL,
	"snapshot" jsonb NOT NULL,
	"quote_id" uuid,
	"submitted_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_approvals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_request_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"decision" "approval_decision" NOT NULL,
	"approved_amount_minor" bigint,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"scope" jsonb NOT NULL,
	"note" text,
	"decided_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_approvals_amount" CHECK ("organization_approvals"."decision" <> 'APPROVED' or "organization_approvals"."approved_amount_minor" >= 0)
);
--> statement-breakpoint
ALTER TABLE "template_orders" DROP CONSTRAINT "template_orders_route";--> statement-breakpoint
ALTER TABLE "approval_policies" ADD CONSTRAINT "approval_policies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_policies" ADD CONSTRAINT "approval_policies_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_policy_requesters" ADD CONSTRAINT "approval_policy_requesters_organization_id_approval_policies_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."approval_policies"("organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_policy_requesters" ADD CONSTRAINT "approval_policy_requesters_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_requests" ADD CONSTRAINT "order_requests_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_requests" ADD CONSTRAINT "order_requests_requested_by_membership_id_memberships_id_fk" FOREIGN KEY ("requested_by_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_requests" ADD CONSTRAINT "order_requests_location_fk" FOREIGN KEY ("location_id","organization_id") REFERENCES "public"."locations"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_approvals" ADD CONSTRAINT "organization_approvals_order_request_id_order_requests_id_fk" FOREIGN KEY ("order_request_id") REFERENCES "public"."order_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_approvals" ADD CONSTRAINT "organization_approvals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_approvals" ADD CONSTRAINT "organization_approvals_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_requests_organization_idx" ON "order_requests" USING btree ("organization_id","status","created_at");--> statement-breakpoint
CREATE INDEX "order_requests_quote_idx" ON "order_requests" USING btree ("quote_id");--> statement-breakpoint
CREATE INDEX "organization_approvals_request_idx" ON "organization_approvals" USING btree ("order_request_id","created_at");--> statement-breakpoint
ALTER TABLE "template_orders" ADD CONSTRAINT "template_orders_route" CHECK ("template_orders"."route" in ('CHECKOUT', 'QUOTE', 'APPROVAL'));--> statement-breakpoint
-- Organization approvals are insert-only (PRD-05 B2B-FR-042, TECH-01 §4): a
-- new decision is a new row; no one edits or deletes one through any route.
CREATE FUNCTION "organization_approvals_refuse_change"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is insert-only: % is not allowed', TG_TABLE_NAME, TG_OP USING ERRCODE = 'insufficient_privilege';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "organization_approvals_no_update_or_delete" BEFORE UPDATE OR DELETE ON "organization_approvals"
  FOR EACH ROW EXECUTE FUNCTION "organization_approvals_refuse_change"();
