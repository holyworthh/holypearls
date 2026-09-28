CREATE TYPE "public"."demo_slice_status" AS ENUM('PENDING', 'DONE', 'FAILED');--> statement-breakpoint
CREATE TABLE "demo_slice_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"message" text NOT NULL,
	"status" "demo_slice_status" DEFAULT 'PENDING' NOT NULL,
	"result" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
