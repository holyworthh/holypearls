CREATE TYPE "public"."order_item_status" AS ENUM('AWAITING_PREREQUISITE', 'QUEUED', 'IN_PRODUCTION', 'QUALITY_CHECK', 'READY_AWAITING_RELEASE', 'READY_TO_DISPATCH', 'DISPATCHED', 'DELIVERED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"configuration_id" uuid,
	"product_name" text NOT NULL,
	"summary" text NOT NULL,
	"quantity" integer NOT NULL,
	"goods_minor" bigint NOT NULL,
	"vat_minor" bigint NOT NULL,
	"total_minor" bigint NOT NULL,
	"lead_days" jsonb,
	"snapshot" jsonb NOT NULL,
	"status" "order_item_status" DEFAULT 'AWAITING_PREREQUISITE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_items_quantity_positive" CHECK ("order_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"checkout_id" uuid,
	"customer_id" uuid NOT NULL,
	"owner_user_id" uuid,
	"owner_device_hash" text,
	"currency" char(3) NOT NULL,
	"goods_minor" bigint NOT NULL,
	"delivery_minor" bigint,
	"vat_minor" bigint NOT NULL,
	"total_minor" bigint NOT NULL,
	"vat_rate_bps" integer NOT NULL,
	"contact" jsonb NOT NULL,
	"address" jsonb,
	"delivery" jsonb,
	"billing" jsonb,
	"placed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_source" CHECK (num_nonnulls("orders"."checkout_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"attempt_id" uuid NOT NULL,
	"intent_id" uuid NOT NULL,
	"order_id" uuid,
	"customer_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"paystack_reference" text NOT NULL,
	"channel" text,
	"payer" jsonb NOT NULL,
	"lines" jsonb NOT NULL,
	"paid_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_settings" ADD COLUMN "account_supports" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_settings" ADD COLUMN "checklist" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_configuration_id_configurations_id_fk" FOREIGN KEY ("configuration_id") REFERENCES "public"."configurations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_checkout_id_checkouts_id_fk" FOREIGN KEY ("checkout_id") REFERENCES "public"."checkouts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_attempt_id_payment_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."payment_attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_intent_id_payment_intents_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "order_items_order_position_unique" ON "order_items" USING btree ("order_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_number_unique" ON "orders" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_checkout_unique" ON "orders" USING btree ("checkout_id");--> statement-breakpoint
CREATE INDEX "orders_customer_idx" ON "orders" USING btree ("customer_id","placed_at");--> statement-breakpoint
CREATE INDEX "orders_owner_user_idx" ON "orders" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "receipts_number_unique" ON "receipts" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "receipts_attempt_unique" ON "receipts" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "receipts_order_idx" ON "receipts" USING btree ("order_id");--> statement-breakpoint
-- Order and receipt numbers (HP-2026-0151, HP-R-2026-0311): one sequence each, formatted in the service.
CREATE SEQUENCE IF NOT EXISTS "order_number_seq" START 1;--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS "receipt_number_seq" START 1;
