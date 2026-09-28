import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, idColumn, updatedAt, versionColumn } from "../columns.js";
import { files } from "./files.js";

const at = (name: string) => timestamp(name, { withTimezone: true });

/** Product families (Stage 1.4 archetypes): each shares one configurator and rule set. */
export const PRODUCT_FAMILIES = [
  "GARMENT",
  "APPAREL_PRINT",
  "EMBROIDERY",
  "PAPER_PRINT",
  "LARGE_FORMAT",
  "PACKAGING",
  "STICKER_LABEL",
  "PROMOTIONAL_ITEM",
  "WALL_ART",
  "CUSTOM_PROJECT",
] as const;
export const productFamily = pgEnum("product_family", PRODUCT_FAMILIES);

/** The three ways customers buy (PRD-00 §2, PRD-02 §3). */
export const buyingMode = pgEnum("buying_mode", ["SIMPLE_CONFIGURABLE", "CONFIGURABLE_QUOTE", "CONSULTATIVE_PROJECT"]);

/** TECH-01 §4 plus "unpublish" back to DRAFT (Pen frame 96/98; see T02-01 report). */
export const productStatus = pgEnum("product_status", ["DRAFT", "PUBLISHED", "TEMPORARILY_UNAVAILABLE", "ARCHIVED"]);
export const categoryStatus = pgEnum("category_status", ["DRAFT", "PUBLISHED", "ARCHIVED"]);

/** The nine canonical categories and their subcategories (Stage 1.2 taxonomy). */
export const categories = pgTable(
  "categories",
  {
    id: idColumn(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    parentId: uuid("parent_id"),
    position: integer("position").notNull().default(0),
    status: categoryStatus("status").notNull().default("DRAFT"),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    heroFileId: uuid("hero_file_id").references(() => files.id, { onDelete: "set null" }),
    version: versionColumn(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("categories_slug_unique").on(table.slug), index("categories_parent_idx").on(table.parentId, table.position)],
);

/**
 * One product page per real product (PUB-SEO-001); colour, size and similar
 * variants are options on the same product, never separate products
 * (PUB-SEO-002). Prices and rules live in T03-01's tables.
 */
export const products = pgTable(
  "products",
  {
    id: idColumn(),
    /** Catalogue reference from the seed sheet, for example HP-APP-001. */
    sku: text("sku").notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    summary: text("summary"),
    description: text("description"),
    family: productFamily("family").notNull(),
    buyingMode: buyingMode("buying_mode").notNull(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    status: productStatus("status").notNull().default("DRAFT"),
    /** Listed in directory, search and menus once published. Unlisted products are reachable by link only. */
    listed: boolean("listed").notNull().default(true),
    searchPhrases: text("search_phrases").array().notNull().default(sql`'{}'::text[]`),
    /** Label and value pairs shown on the product page. */
    specifications: jsonb("specifications").notNull().default(sql`'[]'::jsonb`),
    faqs: jsonb("faqs").notNull().default(sql`'[]'::jsonb`),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    publishedAt: at("published_at"),
    version: versionColumn(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("products_slug_unique").on(table.slug),
    uniqueIndex("products_sku_unique").on(table.sku),
    index("products_status_idx").on(table.status, table.updatedAt.desc()),
    index("products_category_idx").on(table.categoryId),
  ],
);

export const optionKind = pgEnum("option_kind", ["SINGLE", "MULTI"]);

/** Reusable option groups (Stage 1.2): colour, size, paper, finish… */
export const productOptions = pgTable(
  "product_options",
  {
    id: idColumn(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    kind: optionKind("kind").notNull().default("SINGLE"),
    required: boolean("required").notNull().default(true),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("product_options_key_unique").on(table.productId, table.key)],
);

export const productOptionValues = pgTable(
  "product_option_values",
  {
    id: idColumn(),
    optionId: uuid("option_id")
      .notNull()
      .references(() => productOptions.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("product_option_values_key_unique").on(table.optionId, table.key)],
);

/** Product images from the public-media bucket (staff only). */
export const productMedia = pgTable(
  "product_media",
  {
    id: idColumn(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "restrict" }),
    alt: text("alt").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("product_media_file_unique").on(table.productId, table.fileId)],
);

export const productRelations = pgTable(
  "product_relations",
  {
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    relatedProductId: uuid("related_product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.productId, table.relatedProductId] }),
    check("product_relations_not_self", sql`${table.productId} <> ${table.relatedProductId}`),
  ],
);
