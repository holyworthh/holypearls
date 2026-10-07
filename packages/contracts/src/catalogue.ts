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
/** How a product can be made (Pen 17 "How it's made"); the garment routes of PRD-02. */
export const makingRouteSchema = z.enum(["SOURCE_CUSTOMIZE", "MAKE_FROM_SCRATCH", "CUSTOMER_SUPPLIED"]);
/** Decoration methods a product offers (Pen 17 "Decoration"). */
export const decorationMethodSchema = z.enum(["EMBROIDERY", "SCREEN_PRINT", "HEAT_TRANSFER", "PAPER_PRINT", "LARGE_FORMAT_PRINT"]);
export const productStatusSchema = z.enum(["DRAFT", "PUBLISHED", "TEMPORARILY_UNAVAILABLE", "ARCHIVED"]);

/** A shipping box in centimetres. */
export const packageCmSchema = z.object({ length: z.number().min(1).max(500), width: z.number().min(1).max(500), height: z.number().min(0.1).max(500) });

/** A URL slug: lower-case words joined by hyphens. */
export const slugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lower-case letters, numbers and hyphens")
  .max(80, "Use 80 characters or fewer");
const slug = slugSchema;

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
  routes: z.array(makingRouteSchema).max(3).optional(),
  decorations: z.array(decorationMethodSchema).max(5).optional(),
  specifications: z.array(z.object({ label: z.string().max(80), value: z.string().max(300) })).max(40).optional(),
  faqs: z.array(z.object({ question: z.string().max(200), answer: z.string().max(2000) })).max(30).optional(),
  seoTitle: z.string().trim().max(70).nullable().optional(),
  seoDescription: z.string().trim().max(170).nullable().optional(),
  /** Courier prices (T08-05): one unit's weight, and the box for `unitsPerPackage` units. */
  shippingWeightGrams: z.number().int().min(1, "Enter the weight in grams").max(100_000).nullable().optional(),
  packageCm: packageCmSchema.nullable().optional(),
  unitsPerPackage: z.number().int().min(1).max(100_000).nullable().optional(),
});

export const createProductSchema = productFieldsSchema.extend({ sku: z.string().trim().min(3).max(40) });
/** Updates send the version they started from (TECH-02 §5). */
export const updateProductSchema = productFieldsSchema.partial().extend({ version: z.number().int().positive() });
export const changeProductStatusSchema = z.object({ to: productStatusSchema, version: z.number().int().positive() });

const adminProductBase = z.object({
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
  routes: z.array(makingRouteSchema),
  decorations: z.array(decorationMethodSchema),
  specifications: z.array(z.object({ label: z.string(), value: z.string() })),
  faqs: z.array(z.object({ question: z.string(), answer: z.string() })),
  seoTitle: z.string().nullable(),
  seoDescription: z.string().nullable(),
  shippingWeightGrams: z.number().int().nullable(),
  packageCm: packageCmSchema.nullable(),
  unitsPerPackage: z.number().int().nullable(),
  mediaCount: z.number().int(),
  version: z.number().int(),
  updatedAt: z.iso.datetime(),
});

export const adminProductPageSchema = z.object({ entries: z.array(adminProductBase), nextCursor: z.string().nullable() });
export type AdminProductSummary = z.infer<typeof adminProductBase>;

export const adminProductQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: productStatusSchema.optional(),
  family: productFamilySchema.optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

/** Product images (Pen frame 104): public-media files with alt text, in display order. */
export const productMediaSchema = z.object({
  id: z.string(),
  fileId: z.string(),
  alt: z.string(),
  position: z.number().int(),
  fileStatus: z.string(),
});
export const addProductMediaSchema = z.object({
  fileId: z.uuid(),
  alt: z.string().trim().min(1, "Describe the image for people who can't see it").max(200),
});
export const updateProductMediaSchema = addProductMediaSchema.pick({ alt: true });
export const reorderProductMediaSchema = z.object({ mediaIds: z.array(z.uuid()).min(1).max(30) });

export const relatedProductSchema = z.object({ id: z.string(), name: z.string(), sku: z.string(), status: productStatusSchema });
export const setRelatedProductsSchema = z.object({ productIds: z.array(z.uuid()).max(12, "Choose up to 12 related products") });

/** Bulk actions on the product list (Pen frame 96). Each product is checked on its own. */
export const bulkProductStatusSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(100),
  to: z.enum(["PUBLISHED", "TEMPORARILY_UNAVAILABLE", "ARCHIVED"]),
});
export const bulkProductStatusResultSchema = z.object({
  changed: z.array(z.string()),
  skipped: z.array(z.object({ id: z.string(), name: z.string(), reason: z.string() })),
});

export const categoryStatusSchema = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]);
export const adminCategorySchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  parentId: z.string().nullable(),
  parentName: z.string().nullable(),
  position: z.number().int(),
  status: categoryStatusSchema,
  seoTitle: z.string().nullable(),
  seoDescription: z.string().nullable(),
  heroFileId: z.string().nullable(),
  productCount: z.number().int(),
  version: z.number().int(),
  updatedAt: z.iso.datetime(),
});
export type AdminCategory = z.infer<typeof adminCategorySchema>;
export const adminCategoryListSchema = z.object({ entries: z.array(adminCategorySchema) });

const categoryFields = z.object({
  name: z.string().trim().min(1, "Enter a category name").max(80),
  slug,
  parentId: z.uuid().nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  position: z.number().int().min(0).max(1000).optional(),
  seoTitle: z.string().trim().max(70).nullable().optional(),
  seoDescription: z.string().trim().max(170).nullable().optional(),
  heroFileId: z.uuid().nullable().optional(),
});
export const createCategorySchema = categoryFields;
export const updateCategorySchema = categoryFields.partial().extend({ version: z.number().int().positive() });
export const changeCategoryStatusSchema = z.object({ to: z.enum(["PUBLISHED", "ARCHIVED"]), version: z.number().int().positive() });

/** One product with its images and related products (the editor). */
export const adminProductSchema = adminProductBase.extend({
  media: z.array(productMediaSchema),
  related: z.array(relatedProductSchema),
});
export type AdminProduct = z.infer<typeof adminProductSchema>;

/* An image per option value (Pen 21 paper cards; owner, 2026-10-05). */
export const adminProductOptionsSchema = z.object({
  options: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      values: z.array(z.object({ key: z.string(), label: z.string(), image: z.object({ fileId: z.string(), alt: z.string(), fileStatus: z.string() }).nullable() })),
    }),
  ),
});
export const optionImageInputSchema = z.object({
  fileId: z.uuid(),
  alt: z.string().trim().min(1, "Describe the image for people who can't see it").max(200),
});
export type AdminProductOptions = z.infer<typeof adminProductOptionsSchema>;
