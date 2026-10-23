CREATE TYPE "public"."refund_status" AS ENUM('PENDING', 'PROCESSED', 'FAILED');--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"attempt_id" uuid NOT NULL,
	"intent_id" uuid NOT NULL,
	"review_id" uuid,
	"amount_minor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"reason" text NOT NULL,
	"status" "refund_status" DEFAULT 'PENDING' NOT NULL,
	"provider_refund_id" text,
	"provider_status" text,
	"failure" text,
	"checks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"issued_by_user_id" uuid,
	"issued_by_name" text NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refunds_amount_positive" CHECK ("refunds"."amount_minor" > 0)
);
--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_attempt_id_payment_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."payment_attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_intent_id_payment_intents_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_review_id_payment_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."payment_reviews"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_issued_by_user_id_users_id_fk" FOREIGN KEY ("issued_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_number_unique" ON "refunds" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_provider_unique" ON "refunds" USING btree ("provider_refund_id");--> statement-breakpoint
CREATE INDEX "refunds_attempt_idx" ON "refunds" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "refunds_created_idx" ON "refunds" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS "refund_number_seq" START 1;
