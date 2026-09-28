CREATE TYPE "public"."email_code_purpose" AS ENUM('VERIFY_ACTION', 'ACCEPT_QUOTE', 'APPROVE_PROOF', 'CHANGE_ADDRESS', 'PARTICIPANT_PAYMENT', 'FIND_ORDER');--> statement-breakpoint
CREATE TYPE "public"."guest_link_purpose" AS ENUM('QUOTE', 'ORDER', 'PROOF', 'CONFIGURATION', 'PROJECT', 'COLLECTION_SUBMISSION', 'HELP_REQUEST');--> statement-breakpoint
CREATE TYPE "public"."help_request_status" AS ENUM('OPEN', 'ANSWERED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('QUEUED', 'SENT', 'DELIVERED', 'FAILED');--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email_normalized" text NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"phone" text,
	"user_id" uuid,
	"email_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_codes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"customer_id" uuid NOT NULL,
	"purpose" "email_code_purpose" NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guest_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"secret_hash" text NOT NULL,
	"purpose" "guest_link_purpose" NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by_staff_id" uuid,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guest_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"guest_link_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"email_verified_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "help_replies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"help_request_id" uuid NOT NULL,
	"staff_profile_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "help_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reference" text NOT NULL,
	"status" "help_request_status" DEFAULT 'OPEN' NOT NULL,
	"customer_id" uuid NOT NULL,
	"user_id" uuid,
	"guest_session_id" uuid,
	"name" text,
	"message" text NOT NULL,
	"context" jsonb NOT NULL,
	"answered_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"template" text NOT NULL,
	"channel" text DEFAULT 'EMAIL' NOT NULL,
	"recipient" text NOT NULL,
	"customer_id" uuid,
	"record_type" text,
	"record_id" text,
	"record_label" text,
	"link_label" text,
	"status" "notification_status" DEFAULT 'QUEUED' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer NOT NULL,
	"provider_message_id" text,
	"last_error" text,
	"sealed_data" text,
	"resendable" boolean DEFAULT true NOT NULL,
	"resend_of_id" uuid,
	"last_attempt_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_codes" ADD CONSTRAINT "email_codes_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_links" ADD CONSTRAINT "guest_links_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_links" ADD CONSTRAINT "guest_links_revoked_by_staff_id_staff_profiles_id_fk" FOREIGN KEY ("revoked_by_staff_id") REFERENCES "public"."staff_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_sessions" ADD CONSTRAINT "guest_sessions_guest_link_id_guest_links_id_fk" FOREIGN KEY ("guest_link_id") REFERENCES "public"."guest_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_sessions" ADD CONSTRAINT "guest_sessions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "help_replies" ADD CONSTRAINT "help_replies_help_request_id_help_requests_id_fk" FOREIGN KEY ("help_request_id") REFERENCES "public"."help_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "help_replies" ADD CONSTRAINT "help_replies_staff_profile_id_staff_profiles_id_fk" FOREIGN KEY ("staff_profile_id") REFERENCES "public"."staff_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "help_requests" ADD CONSTRAINT "help_requests_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "help_requests" ADD CONSTRAINT "help_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "help_requests" ADD CONSTRAINT "help_requests_guest_session_id_guest_sessions_id_fk" FOREIGN KEY ("guest_session_id") REFERENCES "public"."guest_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "customers_email_normalized_unique" ON "customers" USING btree ("email_normalized");--> statement-breakpoint
CREATE INDEX "customers_user_id_idx" ON "customers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "email_codes_customer_idx" ON "email_codes" USING btree ("customer_id","purpose");--> statement-breakpoint
CREATE UNIQUE INDEX "guest_links_secret_hash_unique" ON "guest_links" USING btree ("secret_hash");--> statement-breakpoint
CREATE INDEX "guest_links_target_idx" ON "guest_links" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "guest_links_customer_idx" ON "guest_links" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "guest_sessions_token_hash_unique" ON "guest_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "help_requests_reference_unique" ON "help_requests" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "help_requests_status_idx" ON "help_requests" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "help_requests_customer_idx" ON "help_requests" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "notifications_created_idx" ON "notifications" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notifications_status_idx" ON "notifications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "notifications_record_idx" ON "notifications" USING btree ("record_type","record_id");