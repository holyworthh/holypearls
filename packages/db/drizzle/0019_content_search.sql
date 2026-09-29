CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;--> statement-breakpoint
CREATE TYPE "public"."content_status" AS ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."content_type" AS ENUM('PROJECT', 'GUIDE', 'CASE_STUDY', 'ABOUT');--> statement-breakpoint
CREATE TYPE "public"."search_doc_type" AS ENUM('PRODUCT', 'CATEGORY', 'PROJECT', 'GUIDE', 'CASE_STUDY');--> statement-breakpoint
CREATE TYPE "public"."search_event_kind" AS ENUM('SEARCH', 'NO_RESULTS', 'CLICK');--> statement-breakpoint
CREATE TYPE "public"."search_phrase_target" AS ENUM('PRODUCT', 'CATEGORY', 'PAGE');--> statement-breakpoint
ALTER TYPE "public"."file_purpose" ADD VALUE 'CONTENT_MEDIA';--> statement-breakpoint
CREATE TABLE "content_page_media" (
	"page_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_page_media_page_id_file_id_pk" PRIMARY KEY("page_id","file_id")
);
--> statement-breakpoint
CREATE TABLE "content_pages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"type" "content_type" NOT NULL,
	"slug" text NOT NULL,
	"status" "content_status" DEFAULT 'DRAFT' NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"hero_file_id" uuid,
	"hero_alt" text DEFAULT '' NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"demo" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"seo_title" text DEFAULT '' NOT NULL,
	"seo_description" text DEFAULT '' NOT NULL,
	"canonical_path" text DEFAULT '' NOT NULL,
	"indexable" boolean DEFAULT true NOT NULL,
	"linked_product_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"linked_page_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"published" jsonb,
	"published_at" timestamp with time zone,
	"sanitized" jsonb,
	"updated_by_staff_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_pages_published_has_copy" CHECK ("content_pages"."status" <> 'PUBLISHED' OR "content_pages"."published" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "search_documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"doc_type" "search_doc_type" NOT NULL,
	"ref_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"body_text" text DEFAULT '' NOT NULL,
	"phrases_text" text DEFAULT '' NOT NULL,
	"category_slug" text,
	"boost" integer DEFAULT 0 NOT NULL,
	"tsv" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(phrases_text, '')), 'A') || setweight(to_tsvector('english', coalesce(summary, '')), 'B') || setweight(to_tsvector('english', coalesce(body_text, '')), 'C')) STORED,
	"terms" text GENERATED ALWAYS AS (lower(coalesce(title, '') || ' ' || coalesce(phrases_text, ''))) STORED,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" "search_event_kind" NOT NULL,
	"query" text NOT NULL,
	"scope" text,
	"results" integer,
	"target_type" text,
	"target_slug" text,
	"position" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_phrases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"phrase" text NOT NULL,
	"target_type" "search_phrase_target" NOT NULL,
	"target_id" uuid NOT NULL,
	"created_by_staff_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "help_requests" ADD COLUMN "topic" text;--> statement-breakpoint
ALTER TABLE "help_requests" ADD COLUMN "company" text;--> statement-breakpoint
ALTER TABLE "help_requests" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "content_page_media" ADD CONSTRAINT "content_page_media_page_id_content_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."content_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_page_media" ADD CONSTRAINT "content_page_media_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_pages" ADD CONSTRAINT "content_pages_hero_file_id_files_id_fk" FOREIGN KEY ("hero_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_pages" ADD CONSTRAINT "content_pages_updated_by_staff_id_staff_profiles_id_fk" FOREIGN KEY ("updated_by_staff_id") REFERENCES "public"."staff_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_phrases" ADD CONSTRAINT "search_phrases_created_by_staff_id_staff_profiles_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."staff_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_page_media_file_idx" ON "content_page_media" USING btree ("file_id");--> statement-breakpoint
CREATE UNIQUE INDEX "content_pages_type_slug_unique" ON "content_pages" USING btree ("type","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "content_pages_one_about" ON "content_pages" USING btree ("type") WHERE "content_pages"."type" = 'ABOUT';--> statement-breakpoint
CREATE INDEX "content_pages_type_status_idx" ON "content_pages" USING btree ("type","status","position");--> statement-breakpoint
CREATE UNIQUE INDEX "search_documents_ref_unique" ON "search_documents" USING btree ("doc_type","ref_id");--> statement-breakpoint
CREATE INDEX "search_documents_tsv_idx" ON "search_documents" USING gin ("tsv");--> statement-breakpoint
CREATE INDEX "search_documents_terms_trgm_idx" ON "search_documents" USING gin ("terms" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "search_events_kind_idx" ON "search_events" USING btree ("kind","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "search_phrases_phrase_target_unique" ON "search_phrases" USING btree (lower("phrase"),"target_type","target_id");--> statement-breakpoint
CREATE INDEX "search_phrases_target_idx" ON "search_phrases" USING btree ("target_type","target_id");--> statement-breakpoint
ALTER TABLE "help_requests" ADD CONSTRAINT "help_requests_topic_known" CHECK ("help_requests"."topic" IS NULL OR "help_requests"."topic" IN ('NEW_ORDER','EXISTING_ORDER','COMPANY_ACCOUNT','SOMETHING_ELSE'));