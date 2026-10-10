CREATE TYPE "public"."allowance_kind" AS ENUM('NONE', 'PER_ORDER', 'PER_PERIOD');--> statement-breakpoint
CREATE TYPE "public"."allowance_period" AS ENUM('MONTH', 'QUARTER', 'YEAR');--> statement-breakpoint
CREATE TABLE "allowance_ledger" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"amount_minor" bigint NOT NULL,
	"configuration_id" uuid NOT NULL,
	"order_request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "allowance_policies" (
	"store_id" uuid PRIMARY KEY NOT NULL,
	"kind" "allowance_kind" DEFAULT 'NONE' NOT NULL,
	"name" text DEFAULT 'Uniform allowance' NOT NULL,
	"amount_minor" bigint,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"period" "allowance_period",
	"renews_on" text,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "allowance_policies_amount" CHECK ("allowance_policies"."kind" = 'NONE' or ("allowance_policies"."amount_minor" is not null and "allowance_policies"."amount_minor" > 0)),
	CONSTRAINT "allowance_policies_period" CHECK ("allowance_policies"."kind" <> 'PER_PERIOD' or ("allowance_policies"."period" is not null and "allowance_policies"."renews_on" is not null))
);
--> statement-breakpoint
ALTER TABLE "allowance_ledger" ADD CONSTRAINT "allowance_ledger_store_id_company_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."company_stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allowance_ledger" ADD CONSTRAINT "allowance_ledger_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allowance_ledger" ADD CONSTRAINT "allowance_ledger_configuration_id_configurations_id_fk" FOREIGN KEY ("configuration_id") REFERENCES "public"."configurations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allowance_policies" ADD CONSTRAINT "allowance_policies_store_id_company_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."company_stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allowance_policies" ADD CONSTRAINT "allowance_policies_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "allowance_ledger_member_idx" ON "allowance_ledger" USING btree ("store_id","membership_id","period_start");--> statement-breakpoint
CREATE UNIQUE INDEX "allowance_ledger_configuration_unique" ON "allowance_ledger" USING btree ("configuration_id");