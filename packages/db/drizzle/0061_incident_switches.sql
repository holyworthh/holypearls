CREATE TABLE "incident_switches" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"read_only_since" timestamp with time zone,
	"uploads_paused_since" timestamp with time zone,
	"updated_by_user_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "incident_switches_single_row" CHECK ("incident_switches"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "incident_switches" ADD CONSTRAINT "incident_switches_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;