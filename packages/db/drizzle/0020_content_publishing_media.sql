CREATE TABLE "content_page_published_media" (
	"page_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_page_published_media_page_id_file_id_pk" PRIMARY KEY("page_id","file_id")
);
--> statement-breakpoint
CREATE TABLE "search_terms" (
	"term" text PRIMARY KEY NOT NULL,
	"documents" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_pages" ADD COLUMN "last_published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "content_page_published_media" ADD CONSTRAINT "content_page_published_media_page_id_content_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."content_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_page_published_media" ADD CONSTRAINT "content_page_published_media_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_page_published_media_file_idx" ON "content_page_published_media" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "search_terms_trgm_idx" ON "search_terms" USING gin ("term" gin_trgm_ops);--> statement-breakpoint
-- Backfill: pages published so far were last changed when they were published.
UPDATE "content_pages" SET "last_published_at" = "published_at" WHERE "published_at" IS NOT NULL;--> statement-breakpoint
-- Backfill: the images each live copy uses (hero, body figures, case-study gallery), when they are usable content media.
INSERT INTO "content_page_published_media" ("page_id", "file_id")
SELECT DISTINCT refs.page_id, f.id
FROM (
  SELECT p.id AS page_id, (p.published->>'heroFileId') AS file_id FROM "content_pages" p WHERE p.status = 'PUBLISHED'
  UNION ALL
  SELECT p.id, m[1] FROM "content_pages" p, regexp_matches(p.published->>'body', '/api/v1/media/([0-9a-fA-F-]{36})/', 'g') AS m WHERE p.status = 'PUBLISHED'
  UNION ALL
  SELECT p.id, g->>'fileId' FROM "content_pages" p, jsonb_array_elements(coalesce(p.published->'data'->'gallery', '[]'::jsonb)) AS g WHERE p.status = 'PUBLISHED'
) refs
JOIN "files" f ON f.id::text = lower(refs.file_id) AND f.purpose IN ('CONTENT_MEDIA', 'PRODUCT_MEDIA') AND f.status = 'READY'
WHERE refs.file_id IS NOT NULL
ON CONFLICT DO NOTHING;
