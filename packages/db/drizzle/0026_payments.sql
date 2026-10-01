CREATE TYPE "public"."installment_status" AS ENUM('NOT_DUE', 'DUE', 'PROCESSING', 'PAID', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."payment_attempt_status" AS ENUM('CREATED', 'PENDING', 'SUCCEEDED', 'FAILED', 'ABANDONED', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."payment_intent_status" AS ENUM('OPEN', 'PROCESSING', 'SUCCEEDED', 'REVIEW_REQUIRED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."payment_review_reason" AS ENUM('UNCLEAR_RESULT', 'AMOUNT_MISMATCH', 'DUPLICATE_PAYMENT', 'PAID_PARTICIPANT_REMOVED');--> statement-breakpoint
CREATE TYPE "public"."payment_review_status" AS ENUM('OPEN', 'RESOLVED');--> statement-breakpoint
ALTER TYPE "public"."configuration_status" ADD VALUE 'ORDERED' BEFORE 'ABANDONED';--> statement-breakpoint
CREATE TABLE "installments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"schedule_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"label" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"trigger" text NOT NULL,
	"status" "installment_status" DEFAULT 'NOT_DUE' NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "installments_amount_positive" CHECK ("installments"."amount_minor" > 0),
	CONSTRAINT "installments_trigger" CHECK ("installments"."trigger" in ('ON_ACCEPTANCE', 'BEFORE_PRODUCTION', 'BEFORE_DISPATCH', 'ON_DATE'))
);
--> statement-breakpoint
CREATE TABLE "payment_attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"intent_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"provider" text DEFAULT 'paystack' NOT NULL,
	"status" "payment_attempt_status" DEFAULT 'CREATED' NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"paid_amount_minor" bigint,
	"paid_currency" text,
	"channel" text,
	"gateway_response" text,
	"access_code" text,
	"authorization_url" text,
	"checks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"failure_message" text,
	"paid_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_attempts_currency" CHECK ("payment_attempts"."currency" in ('NGN', 'USD'))
);
--> statement-breakpoint
CREATE TABLE "payment_intents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"installment_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"status" "payment_intent_status" DEFAULT 'OPEN' NOT NULL,
	"succeeded_attempt_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_intents_amount_positive" CHECK ("payment_intents"."amount_minor" > 0),
	CONSTRAINT "payment_intents_succeeded" CHECK ("payment_intents"."status" <> 'SUCCEEDED' or "payment_intents"."succeeded_attempt_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "payment_reviews" (
	"id" uuid PRIMARY KEY NOT NULL,
	"intent_id" uuid NOT NULL,
	"attempt_id" uuid,
	"reason" "payment_review_reason" NOT NULL,
	"status" "payment_review_status" DEFAULT 'OPEN' NOT NULL,
	"details" jsonb NOT NULL,
	"resolution" text,
	"note" text,
	"resolved_by_user_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_schedules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"checkout_id" uuid,
	"currency" char(3) NOT NULL,
	"total_minor" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_schedules_source" CHECK (num_nonnulls("payment_schedules"."checkout_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "payment_settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"online_payments" boolean DEFAULT false NOT NULL,
	"channels" text[] DEFAULT '{card,bank_transfer,ussd}'::text[] NOT NULL,
	"international_cards" boolean DEFAULT false NOT NULL,
	"usd_enabled" boolean DEFAULT false NOT NULL,
	"default_schedule" jsonb DEFAULT '[{"label":"Pay in full","shareBps":10000,"trigger":"ON_ACCEPTANCE"}]'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by_user_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_settings_single_row" CHECK ("payment_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "paystack_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_key" text NOT NULL,
	"event" text NOT NULL,
	"reference" text,
	"raw_body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "installments" ADD CONSTRAINT "installments_schedule_id_payment_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."payment_schedules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_intent_id_payment_intents_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_installment_id_installments_id_fk" FOREIGN KEY ("installment_id") REFERENCES "public"."installments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_succeeded_attempt_id_payment_attempts_id_fk" FOREIGN KEY ("succeeded_attempt_id") REFERENCES "public"."payment_attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_reviews" ADD CONSTRAINT "payment_reviews_intent_id_payment_intents_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_reviews" ADD CONSTRAINT "payment_reviews_attempt_id_payment_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."payment_attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_reviews" ADD CONSTRAINT "payment_reviews_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_schedules" ADD CONSTRAINT "payment_schedules_checkout_id_checkouts_id_fk" FOREIGN KEY ("checkout_id") REFERENCES "public"."checkouts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_settings" ADD CONSTRAINT "payment_settings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "installments_schedule_position_unique" ON "installments" USING btree ("schedule_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_attempts_reference_unique" ON "payment_attempts" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "payment_attempts_intent_idx" ON "payment_attempts" USING btree ("intent_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_intents_installment_unique" ON "payment_intents" USING btree ("installment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_intents_succeeded_attempt_unique" ON "payment_intents" USING btree ("succeeded_attempt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_reviews_open_unique" ON "payment_reviews" USING btree ("intent_id","attempt_id","reason") WHERE "payment_reviews"."status" = 'OPEN';--> statement-breakpoint
CREATE INDEX "payment_reviews_status_idx" ON "payment_reviews" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_schedules_checkout_unique" ON "payment_schedules" USING btree ("checkout_id");--> statement-breakpoint
CREATE UNIQUE INDEX "paystack_events_key_unique" ON "paystack_events" USING btree ("event_key");--> statement-breakpoint
CREATE INDEX "paystack_events_reference_idx" ON "paystack_events" USING btree ("reference");--> statement-breakpoint
-- The one settings row (TECH-05 §13). Online payments start off; staff switch them on (T04-05).
INSERT INTO "payment_settings" ("id") VALUES (1) ON CONFLICT DO NOTHING;
