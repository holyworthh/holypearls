CREATE TYPE "public"."invitation_status" AS ENUM('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');--> statement-breakpoint
CREATE TYPE "public"."membership_status" AS ENUM('ACTIVE', 'DEACTIVATED');--> statement-breakpoint
CREATE TYPE "public"."organization_permission" AS ENUM('VIEW_RECORDS', 'CREATE_REQUESTS', 'APPROVE_REQUESTS', 'ACCEPT_QUOTES', 'MANAGE_BRAND', 'MANAGE_COLLECTIONS', 'MANAGE_STORES', 'MANAGE_TEAM', 'VIEW_BILLING', 'EXPORT_DATA');--> statement-breakpoint
CREATE TYPE "public"."organization_request_status" AS ENUM('PENDING', 'APPROVED', 'DECLINED');--> statement-breakpoint
CREATE TYPE "public"."organization_role" AS ENUM('OWNER', 'ADMIN', 'BUYER', 'LOCATION_MANAGER', 'APPROVER', 'VIEWER');--> statement-breakpoint
CREATE TYPE "public"."team_size" AS ENUM('1-10', '11-50', '51-200', '200+');--> statement-breakpoint
ALTER TYPE "public"."staff_permission" ADD VALUE 'ORGANIZATION_APPROVE' BEFORE 'EXPORT_PERSONAL_DATA';--> statement-breakpoint
CREATE TABLE "invitation_locations" (
	"invitation_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	CONSTRAINT "invitation_locations_invitation_id_location_id_pk" PRIMARY KEY("invitation_id","location_id")
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"secret_hash" text NOT NULL,
	"email_normalized" text NOT NULL,
	"status" "invitation_status" DEFAULT 'PENDING' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"organization_id" uuid NOT NULL,
	"role" "organization_role" NOT NULL,
	"all_locations" boolean DEFAULT false NOT NULL,
	"invited_by_user_id" uuid,
	"accepted_by_user_id" uuid,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_id_organization_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "invitations_not_owner" CHECK ("invitations"."role" <> 'OWNER')
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "locations_id_organization_unique" UNIQUE("id","organization_id")
);
--> statement-breakpoint
CREATE TABLE "membership_locations" (
	"membership_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	CONSTRAINT "membership_locations_membership_id_location_id_pk" PRIMARY KEY("membership_id","location_id")
);
--> statement-breakpoint
CREATE TABLE "membership_permissions" (
	"membership_id" uuid NOT NULL,
	"permission" "organization_permission" NOT NULL,
	CONSTRAINT "membership_permissions_membership_id_permission_pk" PRIMARY KEY("membership_id","permission")
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "organization_role" NOT NULL,
	"status" "membership_status" DEFAULT 'ACTIVE' NOT NULL,
	"all_locations" boolean DEFAULT false NOT NULL,
	"deactivated_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_organization_user_unique" UNIQUE("organization_id","user_id"),
	CONSTRAINT "memberships_id_organization_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "memberships_owner_all_locations" CHECK ("memberships"."role" <> 'OWNER' OR "memberships"."all_locations")
);
--> statement-breakpoint
CREATE TABLE "organization_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"requester_user_id" uuid NOT NULL,
	"status" "organization_request_status" DEFAULT 'PENDING' NOT NULL,
	"company_name" text NOT NULL,
	"requested_locations" jsonb NOT NULL,
	"team_size" "team_size" NOT NULL,
	"note" text,
	"decided_at" timestamp with time zone,
	"decided_by_staff_id" uuid,
	"decline_reason" text,
	"organization_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_requests_decline_reason" CHECK ("organization_requests"."status" <> 'DECLINED' OR "organization_requests"."decline_reason" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invitation_locations" ADD CONSTRAINT "invitation_locations_invitation_fk" FOREIGN KEY ("invitation_id","organization_id") REFERENCES "public"."invitations"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_locations" ADD CONSTRAINT "invitation_locations_location_fk" FOREIGN KEY ("location_id","organization_id") REFERENCES "public"."locations"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_accepted_by_user_id_users_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_locations" ADD CONSTRAINT "membership_locations_membership_fk" FOREIGN KEY ("membership_id","organization_id") REFERENCES "public"."memberships"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_locations" ADD CONSTRAINT "membership_locations_location_fk" FOREIGN KEY ("location_id","organization_id") REFERENCES "public"."locations"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_permissions" ADD CONSTRAINT "membership_permissions_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_requests" ADD CONSTRAINT "organization_requests_requester_user_id_users_id_fk" FOREIGN KEY ("requester_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_requests" ADD CONSTRAINT "organization_requests_decided_by_staff_id_staff_profiles_id_fk" FOREIGN KEY ("decided_by_staff_id") REFERENCES "public"."staff_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_requests" ADD CONSTRAINT "organization_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_secret_hash_unique" ON "invitations" USING btree ("secret_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_pending_email_unique" ON "invitations" USING btree ("organization_id","email_normalized") WHERE "invitations"."status" = 'PENDING';--> statement-breakpoint
CREATE INDEX "invitations_status_expires_idx" ON "invitations" USING btree ("status","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "locations_organization_name_unique" ON "locations" USING btree ("organization_id",lower("name"));--> statement-breakpoint
CREATE INDEX "membership_locations_location_idx" ON "membership_locations" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "memberships_user_status_idx" ON "memberships" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_requests_one_pending" ON "organization_requests" USING btree ("requester_user_id") WHERE "organization_requests"."status" = 'PENDING';--> statement-breakpoint
CREATE INDEX "organization_requests_status_created_idx" ON "organization_requests" USING btree ("status","created_at");