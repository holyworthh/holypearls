CREATE TYPE "public"."file_purpose" AS ENUM('ARTWORK', 'PROJECT_ATTACHMENT', 'PROOF', 'PROBLEM_PHOTO', 'CSV_IMPORT', 'PRODUCT_MEDIA');--> statement-breakpoint
CREATE TYPE "public"."file_status" AS ENUM('PENDING_UPLOAD', 'PROCESSING', 'READY', 'NEEDS_REVIEW', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."rendition_kind" AS ENUM('PREVIEW', 'THUMBNAIL', 'PAGE');--> statement-breakpoint
CREATE TABLE "file_renditions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"file_id" uuid NOT NULL,
	"kind" "rendition_kind" NOT NULL,
	"page" integer DEFAULT 1 NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"width" integer,
	"height" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY NOT NULL,
	"purpose" "file_purpose" NOT NULL,
	"status" "file_status" DEFAULT 'PENDING_UPLOAD' NOT NULL,
	"owner_type" text,
	"owner_id" uuid,
	"uploaded_by_user_id" uuid,
	"uploaded_by_customer_id" uuid,
	"uploaded_by_guest_session_id" uuid,
	"original_name" text NOT NULL,
	"safe_name" text NOT NULL,
	"declared_type" text NOT NULL,
	"declared_size" bigint NOT NULL,
	"detected_type" text,
	"size_bytes" bigint,
	"storage_key" text NOT NULL,
	"bucket" text DEFAULT 'private' NOT NULL,
	"reason" text,
	"metadata" jsonb,
	"attached_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "file_renditions" ADD CONSTRAINT "file_renditions_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_customer_id_customers_id_fk" FOREIGN KEY ("uploaded_by_customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "file_renditions_unique" ON "file_renditions" USING btree ("file_id","kind","page");--> statement-breakpoint
CREATE UNIQUE INDEX "files_storage_key_unique" ON "files" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "files_owner_idx" ON "files" USING btree ("owner_type","owner_id");--> statement-breakpoint
CREATE INDEX "files_unattached_idx" ON "files" USING btree ("created_at") WHERE "files"."owner_id" is null;