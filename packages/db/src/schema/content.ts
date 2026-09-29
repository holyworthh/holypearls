import { type SQL, sql } from "drizzle-orm";
import { boolean, check, customType, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, idColumn, updatedAt, versionColumn } from "../columns.js";
import { files } from "./files.js";
import { staffProfiles } from "./identity.js";

const at = (name: string) => timestamp(name, { withTimezone: true });

/*
 * Public content and search, owned by the catalogue module (TECH-00 §4,
 * TECH-01 §3). T02-06: PUB-FR-006, 007, 011–013, 016.
 */

export const contentType = pgEnum("content_type", ["PROJECT", "GUIDE", "CASE_STUDY", "ABOUT"]);
export const contentStatus = pgEnum("content_status", ["DRAFT", "PUBLISHED", "ARCHIVED"]);

/**
 * Project / solution pages, guides, case studies and About. Staff edit the
 * working copy; publishing copies it to `published`, which is all the public
 * site ever reads. Unpublished edits never show.
 */
export const contentPages = pgTable(
  "content_pages",
  {
    id: idColumn(),
    type: contentType("type").notNull(),
    slug: text("slug").notNull(),
    status: contentStatus("status").notNull().default("DRAFT"),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    /** Rich text, already cleaned on save to the editor's allow-list. */
    body: text("body").notNull().default(""),
    heroFileId: uuid("hero_file_id").references(() => files.id, { onDelete: "set null" }),
    heroAlt: text("hero_alt").notNull().default(""),
    featured: boolean("featured").notNull().default(false),
    /** Shown with a "Demo" label until real, approved content replaces it (PUB-FR-012). */
    demo: boolean("demo").notNull().default(false),
    position: integer("position").notNull().default(0),
    seoTitle: text("seo_title").notNull().default(""),
    seoDescription: text("seo_description").notNull().default(""),
    /** Empty means the page's own address. */
    canonicalPath: text("canonical_path").notNull().default(""),
    indexable: boolean("indexable").notNull().default(true),
    linkedProductIds: uuid("linked_product_ids").array().notNull().default(sql`'{}'::uuid[]`),
    linkedPageIds: uuid("linked_page_ids").array().notNull().default(sql`'{}'::uuid[]`),
    /** Type-specific parts (project kit, case-study facts, guide comparison…), validated by the contracts. */
    data: jsonb("data").notNull().default(sql`'{}'::jsonb`),
    /** The last published copy of every field above; null until first published. */
    published: jsonb("published"),
    publishedAt: at("published_at"),
    /** What the last save removed from the text, for the editor's warning. */
    sanitized: jsonb("sanitized"),
    updatedByStaffId: uuid("updated_by_staff_id").references(() => staffProfiles.id, { onDelete: "set null" }),
    version: versionColumn(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("content_pages_type_slug_unique").on(table.type, table.slug),
    uniqueIndex("content_pages_one_about").on(table.type).where(sql`${table.type} = 'ABOUT'`),
    index("content_pages_type_status_idx").on(table.type, table.status, table.position),
    check("content_pages_published_has_copy", sql`${table.status} <> 'PUBLISHED' OR ${table.published} IS NOT NULL`),
  ],
);

/** Images a content page uses (hero, figures, gallery), so the public media route knows they may be shown. */
export const contentPageMedia = pgTable(
  "content_page_media",
  {
    pageId: uuid("page_id")
      .notNull()
      .references(() => contentPages.id, { onDelete: "cascade" }),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.pageId, table.fileId] }), index("content_page_media_file_idx").on(table.fileId)],
);

const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

export const searchDocType = pgEnum("search_doc_type", ["PRODUCT", "CATEGORY", "PROJECT", "GUIDE", "CASE_STUDY"]);

/**
 * The search index (TECH-00 §2: PostgreSQL full text + pg_trgm). Rebuilt by
 * the search.refresh job from published records only, so a draft can never
 * be found. If a refresh fails, the catalogue is still right and the index
 * catches up on the next run (TECH-00 §9).
 */
export const searchDocuments = pgTable(
  "search_documents",
  {
    id: idColumn(),
    docType: searchDocType("doc_type").notNull(),
    refId: uuid("ref_id").notNull(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    bodyText: text("body_text").notNull().default(""),
    /** Everyday phrases for this record, space-separated (PUB-FR-007). */
    phrasesText: text("phrases_text").notNull().default(""),
    /** Product's top-level category slug, for "Narrow it down". */
    categorySlug: text("category_slug"),
    /** Higher ranks first when relevance ties (the "Most ordered" order for products). */
    boost: integer("boost").notNull().default(0),
    /** Title and phrases weigh most, then the summary, then the text. */
    tsv: tsvector("tsv").generatedAlwaysAs(
      (): SQL =>
        sql`setweight(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(phrases_text, '')), 'A') || setweight(to_tsvector('english', coalesce(summary, '')), 'B') || setweight(to_tsvector('english', coalesce(body_text, '')), 'C')`,
    ),
    /** Lower-case title and phrases, for spelling tolerance (pg_trgm). */
    terms: text("terms").generatedAlwaysAs((): SQL => sql`lower(coalesce(title, '') || ' ' || coalesce(phrases_text, ''))`),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("search_documents_ref_unique").on(table.docType, table.refId),
    index("search_documents_tsv_idx").using("gin", table.tsv),
    index("search_documents_terms_trgm_idx").using("gin", sql`${table.terms} gin_trgm_ops`),
  ],
);

export const searchPhraseTarget = pgEnum("search_phrase_target", ["PRODUCT", "CATEGORY", "PAGE"]);

/** Everyday phrases staff add ("company shirts", "souvenir") and where they lead (PUB-FR-007). */
export const searchPhrases = pgTable(
  "search_phrases",
  {
    id: idColumn(),
    phrase: text("phrase").notNull(),
    targetType: searchPhraseTarget("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    createdByStaffId: uuid("created_by_staff_id").references(() => staffProfiles.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("search_phrases_phrase_target_unique").on(sql`lower(${table.phrase})`, table.targetType, table.targetId), index("search_phrases_target_idx").on(table.targetType, table.targetId)],
);

export const searchEventKind = pgEnum("search_event_kind", ["SEARCH", "NO_RESULTS", "CLICK"]);

/**
 * Search analytics (PRD-01 §11). The query is trimmed, lower-cased and cut
 * to 100 characters, and anything that looks like an email or phone number
 * is removed before it's stored. No person, session or IP is recorded.
 */
export const searchEvents = pgTable(
  "search_events",
  {
    id: idColumn(),
    kind: searchEventKind("kind").notNull(),
    query: text("query").notNull(),
    scope: text("scope"),
    results: integer("results"),
    targetType: text("target_type"),
    targetSlug: text("target_slug"),
    position: integer("position"),
    createdAt: createdAt(),
  },
  (table) => [index("search_events_kind_idx").on(table.kind, table.createdAt.desc())],
);
