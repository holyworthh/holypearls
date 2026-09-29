import { z } from "zod";
import { buyingModeSchema, productFamilySchema } from "./catalogue.js";
import { configuratorSchema } from "./configuration.js";

/*
 * Public catalogue (T02-03, PUB-FR-008–010). Only published products and
 * categories, and only the fields a visitor may see: no SKU, version or staff
 * data.
 */

/** A public image: stable URL through the API's media route, cached by the browser and CDN. */
export const publicImageSchema = z.object({
  url: z.string(),
  thumbnailUrl: z.string(),
  alt: z.string(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
});
export type PublicImage = z.infer<typeof publicImageSchema>;

/**
 * What the card shows where a price goes (PUB-FR-010). Real prices arrive with
 * T03-01; until then the state follows the buying mode.
 */
export const priceStateSchema = z.enum(["PRICE_ON_CONFIGURATION", "QUOTE_REQUIRED", "CONSULTATION_REQUIRED", "UNAVAILABLE"]);
export type PriceState = z.infer<typeof priceStateSchema>;

export const publicProductCardSchema = z.object({
  slug: z.string(),
  name: z.string(),
  summary: z.string().nullable(),
  family: productFamilySchema,
  buyingMode: buyingModeSchema,
  category: z.object({ slug: z.string(), name: z.string() }),
  image: publicImageSchema.nullable(),
  /** TEMPORARILY_UNAVAILABLE products stay listed but can't be ordered. */
  available: z.boolean(),
  priceState: priceStateSchema,
  /** The current list price (before options and VAT), for "From ₦8,500 / piece"; null when quoted. */
  price: z
    .object({
      amountMinor: z.string(),
      currency: z.enum(["NGN", "USD"]),
      basis: z.enum(["PER_UNIT", "PER_PACK", "FIXED"]),
      packSize: z.number().int(),
      state: z.enum(["PRICE_READY", "ESTIMATE_READY"]),
    })
    .nullable(),
  /** Minimum order quantity; null when not set. */
  moq: z.number().int().nullable(),
});
export type PublicProductCard = z.infer<typeof publicProductCardSchema>;

export const productSortSchema = z.enum(["popular", "name", "newest"]);
export const publicProductQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().max(80).optional(),
  family: productFamilySchema.optional(),
  mode: buyingModeSchema.optional(),
  sort: productSortSchema.default("popular"),
  page: z.coerce.number().int().min(1).max(500).default(1),
  limit: z.coerce.number().int().min(1).max(48).default(24),
});
export type PublicProductQuery = z.infer<typeof publicProductQuerySchema>;

/** Numbered pages (Pen 17), because visitors jump between them; the catalogue is small. */
export const publicProductPageSchema = z.object({
  entries: z.array(publicProductCardSchema),
  total: z.number().int(),
  page: z.number().int(),
  pages: z.number().int(),
  /** Counts for the filter panel, for the current search without that filter. */
  facets: z.object({
    categories: z.array(z.object({ slug: z.string(), name: z.string(), count: z.number().int() })),
    families: z.array(z.object({ value: productFamilySchema, count: z.number().int() })),
    modes: z.array(z.object({ value: buyingModeSchema, count: z.number().int() })),
  }),
});
export type PublicProductPage = z.infer<typeof publicProductPageSchema>;

export const publicCategorySchema = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  productCount: z.number().int(),
  image: publicImageSchema.nullable(),
  children: z.array(
    z.object({ slug: z.string(), name: z.string(), productCount: z.number().int(), image: publicImageSchema.nullable() }),
  ),
});
export type PublicCategory = z.infer<typeof publicCategorySchema>;
export const publicCategoryTreeSchema = z.object({ categories: z.array(publicCategorySchema) });

/* Category hub sections (PUB-FR-009, Pen 18 and 105). */

const text = (max: number) => z.string().trim().max(max);
const base = { visible: z.boolean(), heading: text(120) };

export const hubSectionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("summary"), ...base, body: text(600), primaryLabel: text(60), secondaryLabel: text(60), secondaryHref: text(200) }),
  z.object({ type: z.literal("subcategories"), ...base }),
  z.object({ type: z.literal("featured"), ...base, productSlugs: z.array(z.string().max(80)).max(8) }),
  z.object({ type: z.literal("grid"), ...base }),
  z.object({
    type: z.literal("guidance"),
    ...base,
    intro: text(600),
    columns: z.array(text(40)).max(6),
    rows: z.array(z.array(text(160)).max(6)).max(12),
    note: text(300),
  }),
  z.object({
    type: z.literal("process"),
    ...base,
    steps: z.array(z.object({ title: text(80), body: text(300), detail: text(120) })).max(6),
  }),
  z.object({ type: z.literal("faq"), ...base, items: z.array(z.object({ question: text(200), answer: text(2000) })).max(20) }),
  z.object({
    type: z.literal("related"),
    ...base,
    links: z.array(z.object({ title: text(100), body: text(200), href: text(200) })).max(8),
  }),
]);
export type HubSection = z.infer<typeof hubSectionSchema>;
export type HubSectionType = HubSection["type"];
export const HUB_SECTION_TYPES = ["summary", "subcategories", "featured", "grid", "guidance", "process", "faq", "related"] as const;

/** Every section type appears exactly once; the order and visibility are the editor's choice. */
export const hubSchema = z
  .object({ sections: z.array(hubSectionSchema).length(HUB_SECTION_TYPES.length) })
  .refine((hub) => new Set(hub.sections.map((section) => section.type)).size === HUB_SECTION_TYPES.length, "Each section appears once");
export type Hub = z.infer<typeof hubSchema>;

/** The category hub page: category, its published hub, subcategories and products. */
export const publicHubSchema = z.object({
  category: publicCategorySchema,
  parent: z.object({ slug: z.string(), name: z.string() }).nullable(),
  sections: z.array(hubSectionSchema),
  featured: z.array(publicProductCardSchema),
  products: z.array(publicProductCardSchema),
  seoTitle: z.string(),
  seoDescription: z.string().nullable(),
});
export type PublicHub = z.infer<typeof publicHubSchema>;

/** Admin editing of a hub (Pen 105). */
export const adminHubSchema = z.object({
  categoryId: z.string(),
  categoryName: z.string(),
  slug: z.string(),
  draft: hubSchema,
  published: hubSchema.nullable(),
  publishedAt: z.iso.datetime().nullable(),
  /** The draft differs from what's live. */
  unpublishedChanges: z.boolean(),
  version: z.number().int(),
});
export type AdminHub = z.infer<typeof adminHubSchema>;
export const saveHubDraftSchema = z.object({ hub: hubSchema, version: z.number().int().positive() });
export const publishHubSchema = z.object({ version: z.number().int().positive() });

/* Admin-managed lists (PUB-FR-004): mega-menu popular products and homepage "Most ordered". */

export const MERCHANDISING_LISTS = {
  "menu.popular": { label: "Mega-menu · popular products", max: 8 },
  "home.most-ordered": { label: "Homepage · most ordered", max: 8 },
} as const;
export const merchandisingListKeySchema = z.enum(["menu.popular", "home.most-ordered"]);
export type MerchandisingListKey = z.infer<typeof merchandisingListKeySchema>;
export const adminMerchandisingListSchema = z.object({
  key: merchandisingListKeySchema,
  label: z.string(),
  max: z.number().int(),
  products: z.array(z.object({ id: z.string(), name: z.string(), status: z.string() })),
  version: z.number().int(),
});
export const adminMerchandisingListsSchema = z.object({ lists: z.array(adminMerchandisingListSchema) });
export const saveMerchandisingListSchema = z.object({ productIds: z.array(z.uuid()).max(8), version: z.number().int().min(0) });

/** Everything the site header, mega-menu and homepage need, in one cached call. */
export const storefrontNavigationSchema = z.object({
  categories: z.array(publicCategorySchema),
  popular: z.array(z.object({ slug: z.string(), name: z.string() })),
  mostOrdered: z.array(publicProductCardSchema),
  totalProducts: z.number().int(),
});
export type StorefrontNavigation = z.infer<typeof storefrontNavigationSchema>;

/** A product's public page data. The full product page (configurator, prices) is T03-03. */
export const publicProductSchema = publicProductCardSchema.extend({
  description: z.string().nullable(),
  images: z.array(publicImageSchema),
  specifications: z.array(z.object({ label: z.string(), value: z.string() })),
  faqs: z.array(z.object({ question: z.string(), answer: z.string() })),
  categoryParent: z.object({ slug: z.string(), name: z.string() }).nullable(),
  related: z.array(publicProductCardSchema),
  /** Null for consultative products, which are planned with staff. */
  configurator: configuratorSchema.nullable(),
  seoTitle: z.string(),
  seoDescription: z.string().nullable(),
});
export type PublicProduct = z.infer<typeof publicProductSchema>;
