import { z } from "zod";
import { contentCardSchema } from "./content.js";
import { publicProductCardSchema } from "./storefront.js";

/*
 * Search (T02-06, PUB-FR-006, 007, 016): one index of products, categories,
 * projects, guides and case studies; everyday phrases staff add; spelling
 * tolerance; grouped results; and a recovery page that never comes up blank.
 */

export const searchScopeSchema = z.enum(["all", "products", "projects", "guides"]);
export type SearchScope = z.infer<typeof searchScopeSchema>;
export const SEARCH_SCOPE_LABEL: Record<SearchScope, string> = { all: "All", products: "Products", projects: "Projects", guides: "Guides" };

export const searchQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(100),
    scope: searchScopeSchema.default("all"),
    page: z.coerce.number().int().min(1).max(50).default(1),
    /** "Search for that instead": search exactly what was typed, without the spelling correction. */
    exact: z
      .enum(["1", "0"])
      .optional()
      .transform((value) => value === "1"),
  })
  .strict();
export type SearchQuery = z.input<typeof searchQuerySchema>;

const group = <T extends z.ZodType>(entry: T) => z.object({ total: z.number().int(), entries: z.array(entry) });
const categoryHit = z.object({ slug: z.string(), name: z.string(), count: z.number().int() });

export const searchResultsSchema = z.object({
  /** What was searched: the corrected query when a correction was made. */
  q: z.string(),
  /** What the visitor typed, when it was corrected ("You typed ‘staf shrits’"). */
  typed: z.string().nullable(),
  scope: searchScopeSchema,
  page: z.number().int(),
  pages: z.number().int(),
  counts: z.object({ all: z.number().int(), products: z.number().int(), projects: z.number().int(), guides: z.number().int() }),
  products: group(publicProductCardSchema),
  projects: group(contentCardSchema),
  guides: group(contentCardSchema),
  /** "Narrow it down" (Pen 07): categories holding matches, and related everyday searches. */
  narrow: z.object({ categories: z.array(categoryHit), searches: z.array(z.string()) }),
  /** No results: the closest things we have (Pen 10 · ZW64K). */
  closest: z.object({ product: publicProductCardSchema.nullable(), category: categoryHit.nullable(), guide: contentCardSchema.nullable() }).nullable(),
});
export type SearchResults = z.infer<typeof searchResultsSchema>;

/** A click on a result, for search analytics (PRD-01 §11). No personal details are kept. */
export const searchClickSchema = z
  .object({
    q: z.string().trim().min(1).max(100),
    type: z.enum(["PRODUCT", "CATEGORY", "PROJECT", "GUIDE", "CASE_STUDY", "SEARCH"]),
    slug: z.string().max(120),
    position: z.number().int().min(0).max(200),
  })
  .strict();

/** Everyday phrases staff add so ordinary words find the right page (PUB-FR-007). */
export const searchPhraseTargetSchema = z.enum(["PRODUCT", "CATEGORY", "PAGE"]);
export const searchPhraseSchema = z.object({
  id: z.string(),
  phrase: z.string(),
  target: z.object({
    type: searchPhraseTargetSchema,
    id: z.string(),
    label: z.string(),
    href: z.string(),
    /** The target's own status (PUBLISHED, DRAFT, ARCHIVED…), or REMOVED. */
    status: z.string(),
    /** True while the target is public: only then does the phrase work on the site. */
    active: z.boolean(),
  }),
  createdAt: z.string(),
  createdBy: z.string().nullable(),
});
export type SearchPhrase = z.infer<typeof searchPhraseSchema>;
export const searchPhraseListSchema = z.object({ entries: z.array(searchPhraseSchema) });
export const createSearchPhraseSchema = z
  .object({
    phrase: z
      .string()
      .trim()
      .min(2, "Use at least 2 characters")
      .max(60, "Use 60 characters or fewer")
      .regex(/^[\p{L}\p{N}][\p{L}\p{N} &'’-]*$/u, "Use letters, numbers, spaces, & and hyphens"),
    targetType: searchPhraseTargetSchema,
    targetId: z.uuid("Choose where it leads"),
  })
  .strict();

/** What the admin phrase picker can point at. */
export const searchTargetOptionSchema = z.object({ type: searchPhraseTargetSchema, id: z.string(), label: z.string(), detail: z.string() });
export const searchTargetOptionsSchema = z.object({ entries: z.array(searchTargetOptionSchema) });
export const searchTargetQuerySchema = z.object({ q: z.string().trim().min(1).max(60) }).strict();

/** Search analytics for staff (PRD-01 §11): top searches and the ones that found nothing. */
export const searchReportSchema = z.object({
  since: z.string(),
  searches: z.number().int(),
  noResults: z.number().int(),
  top: z.array(z.object({ query: z.string(), count: z.number().int() })),
  topNoResults: z.array(z.object({ query: z.string(), count: z.number().int() })),
});

/** Public pages for the XML sitemap (PUB-SEO-009): published and indexable only. */
export const sitemapSchema = z.object({
  /** `updatedAt` is null for pages whose content doesn't change (it's left out of the sitemap). */
  entries: z.array(z.object({ path: z.string(), updatedAt: z.string().nullable() })),
});
