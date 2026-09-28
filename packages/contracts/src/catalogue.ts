import { z } from "zod";

export const productFamilySchema = z.enum([
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
]);
export const buyingModeSchema = z.enum(["SIMPLE_CONFIGURABLE", "CONFIGURABLE_QUOTE", "CONSULTATIVE_PROJECT"]);
export const productStatusSchema = z.enum(["DRAFT", "PUBLISHED", "TEMPORARILY_UNAVAILABLE", "ARCHIVED"]);

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lower-case letters, numbers and hyphens").max(80);

export const productFieldsSchema = z.object({
  name: z.string().trim().min(1, "Enter a product name").max(120),
  slug,
  family: productFamilySchema,
  buyingMode: buyingModeSchema,
  categoryId: z.uuid("Choose a category"),
  summary: z.string().trim().max(300).nullable().optional(),
  description: z.string().trim().max(10_000).nullable().optional(),
  listed: z.boolean().optional(),
  searchPhrases: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  specifications: z.array(z.object({ label: z.string().max(80), value: z.string().max(300) })).max(40).optional(),
  faqs: z.array(z.object({ question: z.string().max(200), answer: z.string().max(2000) })).max(30).optional(),
  seoTitle: z.string().trim().max(70).nullable().optional(),
  seoDescription: z.string().trim().max(170).nullable().optional(),
});

export const createProductSchema = productFieldsSchema.extend({ sku: z.string().trim().min(3).max(40) });
/** Updates send the version they started from (TECH-02 §5). */
export const updateProductSchema = productFieldsSchema.partial().extend({ version: z.number().int().positive() });
export const changeProductStatusSchema = z.object({ to: productStatusSchema, version: z.number().int().positive() });

export const adminProductSchema = z.object({
  id: z.string(),
  sku: z.string(),
  slug: z.string(),
  name: z.string(),
  family: productFamilySchema,
  buyingMode: buyingModeSchema,
  categoryId: z.string(),
  categoryName: z.string(),
  status: productStatusSchema,
  listed: z.boolean(),
  summary: z.string().nullable(),
  description: z.string().nullable(),
  searchPhrases: z.array(z.string()),
  specifications: z.array(z.object({ label: z.string(), value: z.string() })),
  faqs: z.array(z.object({ question: z.string(), answer: z.string() })),
  seoTitle: z.string().nullable(),
  seoDescription: z.string().nullable(),
  mediaCount: z.number().int(),
  version: z.number().int(),
  updatedAt: z.iso.datetime(),
});
export type AdminProduct = z.infer<typeof adminProductSchema>;

export const adminProductPageSchema = z.object({ entries: z.array(adminProductSchema), nextCursor: z.string().nullable() });

export const adminProductQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: productStatusSchema.optional(),
  family: productFamilySchema.optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
