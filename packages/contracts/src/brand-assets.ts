import { z } from "zod";
import { publicImageSchema } from "./storefront.js";

/*
 * Brand assets (T11-01; PRD-05 B2B-FR-020–024; TECH-04 §9). An asset is the
 * logo or artwork as a concept; each version points to exactly one file and
 * is never overwritten (uploading V5 keeps V4).
 */

const isoDate = z.iso.datetime();

export const BRAND_ASSET_KINDS = ["LOGO", "PRINT", "EMBROIDERY", "GUIDELINES", "PACKAGING"] as const;
export const brandAssetKindSchema = z.enum(BRAND_ASSET_KINDS);
export type BrandAssetKind = z.infer<typeof brandAssetKindSchema>;

export const BRAND_ASSET_KIND_LABELS: Record<BrandAssetKind, string> = {
  LOGO: "Logo",
  PRINT: "Print",
  EMBROIDERY: "Embroidery",
  GUIDELINES: "Guidelines",
  PACKAGING: "Packaging",
};

/** PROCESSING → NEEDS_REVIEW → PRODUCTION_READY → SUPERSEDED | RETIRED; any → ARCHIVED (TECH-01 §4). */
export const ASSET_VERSION_STATUSES = ["PROCESSING", "NEEDS_REVIEW", "PRODUCTION_READY", "SUPERSEDED", "RETIRED", "ARCHIVED"] as const;
export const assetVersionStatusSchema = z.enum(ASSET_VERSION_STATUSES);
export type AssetVersionStatus = z.infer<typeof assetVersionStatusSchema>;

export const assetVersionSchema = z.object({
  id: z.string(),
  number: z.number().int(),
  status: assetVersionStatusSchema,
  fileId: z.string(),
  fileName: z.string(),
  fileType: z.string(),
  hasThumbnail: z.boolean(),
  /** HolyPearls' production note, shown to the organization (frame 116). */
  reviewNote: z.string().nullable(),
  uploadedBy: z.string().nullable(),
  createdAt: isoDate,
  reviewedAt: isoDate.nullable(),
});
export type AssetVersion = z.infer<typeof assetVersionSchema>;

export const brandAssetSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: brandAssetKindSchema,
  /** The version new orders use: the PRODUCTION_READY one, if any. */
  current: assetVersionSchema.nullable(),
  /** The newest version, which may still be in review. */
  latest: assetVersionSchema,
  versionCount: z.number().int(),
  updatedAt: isoDate,
});
export type BrandAssetSummary = z.infer<typeof brandAssetSummarySchema>;

export const brandAssetListSchema = z.object({ assets: z.array(brandAssetSummarySchema), canManage: z.boolean() });
export type BrandAssetList = z.infer<typeof brandAssetListSchema>;

export const brandAssetSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: brandAssetKindSchema,
  versions: z.array(assetVersionSchema),
  /** Templates that use one of its versions (frame 66 "Used in N templates"). */
  templates: z.array(z.object({ id: z.string(), name: z.string(), status: z.string(), number: z.number().int() })).default([]),
  canManage: z.boolean(),
  version: z.number().int(),
});
export type BrandAsset = z.infer<typeof brandAssetSchema>;

export const createBrandAssetSchema = z.object({
  name: z.string().trim().min(1, "Name the asset, for example Primary Logo").max(80, "Use 80 characters or fewer"),
  kind: brandAssetKindSchema,
  fileId: z.uuid("Upload the file first"),
});
export type CreateBrandAsset = z.infer<typeof createBrandAssetSchema>;

export const addAssetVersionSchema = z.object({ fileId: z.uuid("Upload the file first") });

/* Staff production review (frame 116; OPS-FR-083). */

export const reviewAssetVersionSchema = z.object({
  decision: z.enum(["PRODUCTION_READY", "KEEP_IN_REVIEW"]),
  note: z.string().trim().max(1000, "Use 1,000 characters or fewer").nullable().default(null),
});
export type ReviewAssetVersion = z.infer<typeof reviewAssetVersionSchema>;

export const adminAssetReviewRowSchema = z.object({
  versionId: z.string(),
  assetId: z.string(),
  assetName: z.string(),
  kind: brandAssetKindSchema,
  organizationId: z.string(),
  organizationName: z.string(),
  number: z.number().int(),
  status: assetVersionStatusSchema,
  uploadedBy: z.string().nullable(),
  createdAt: isoDate,
});
export const adminAssetReviewListSchema = z.object({ versions: z.array(adminAssetReviewRowSchema) });
export type AdminAssetReviewList = z.infer<typeof adminAssetReviewListSchema>;

export const adminAssetSchema = brandAssetSchema.omit({ canManage: true }).extend({ organizationId: z.string(), organizationName: z.string() });
export type AdminAsset = z.infer<typeof adminAssetSchema>;

/* Workspace Product Templates (T11-01b; PRD-05 B2B-FR-024, 030–032; OPS-FR-082). */

/** DRAFT → AWAITING_APPROVAL → APPROVED → NEEDS_REVIEW → AWAITING_APPROVAL; any → ARCHIVED (TECH-01 §4). */
export const TEMPLATE_STATUSES = ["DRAFT", "AWAITING_APPROVAL", "APPROVED", "NEEDS_REVIEW", "ARCHIVED"] as const;
export const templateStatusSchema = z.enum(TEMPLATE_STATUSES);
export type TemplateStatus = z.infer<typeof templateStatusSchema>;

/** Company Controlled (locked) or Buyer Editable, each with a stated reason (B2B-FR-031). */
export const FIELD_CONTROLS = ["LOCKED", "EDITABLE"] as const;
export const fieldControlSchema = z.enum(FIELD_CONTROLS);
export type FieldControl = z.infer<typeof fieldControlSchema>;

export const templateFieldSchema = z.object({
  /** "option:paper", "garment:decoration", "logo", "quantity", "sizes", "personalization", "delivery". */
  key: z.string().max(80),
  label: z.string(),
  value: z.string(),
  control: fieldControlSchema,
  reason: z.string(),
});
export type TemplateField = z.infer<typeof templateFieldSchema>;

export const templateAssetSchema = z.object({
  assetId: z.string(),
  assetName: z.string(),
  versionId: z.string(),
  number: z.number().int(),
  status: assetVersionStatusSchema,
  /** The asset's current ready version, when the template uses an older one. */
  currentNumber: z.number().int().nullable(),
});

export const templateSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  status: templateStatusSchema,
  productName: z.string(),
  productSlug: z.string(),
  /** The product's main photo (Pen 68 "product photo first"). */
  image: publicImageSchema.nullable(),
  /** "Available using logo V4" or "Blocked — asset review required" (B2B-FR-024), or null. */
  assetLabel: z.string().nullable(),
  allLocations: z.boolean(),
  locations: z.array(z.object({ id: z.string(), name: z.string() })),
  updatedAt: isoDate,
});
export type TemplateSummary = z.infer<typeof templateSummarySchema>;

export const templateListSchema = z.object({ templates: z.array(templateSummarySchema), canManage: z.boolean() });
export type TemplateList = z.infer<typeof templateListSchema>;

export const templateSchema = templateSummarySchema.extend({
  fields: z.array(templateFieldSchema),
  assets: z.array(templateAssetSchema),
  /** HolyPearls' note when the template was returned to draft. */
  reviewNote: z.string().nullable(),
  sourceLabel: z.string(),
  canManage: z.boolean(),
  version: z.number().int(),
});
export type Template = z.infer<typeof templateSchema>;

/** Where a template can start from: one of the organization's ordered items, or one of the person's saved designs. */
export const templateSourceSchema = z.object({
  configurationId: z.string(),
  label: z.string(),
  productName: z.string(),
  kind: z.enum(["ORDER_ITEM", "DRAFT"]),
});
export const templateSourceListSchema = z.object({ sources: z.array(templateSourceSchema) });
export type TemplateSourceList = z.infer<typeof templateSourceListSchema>;

const fieldControlsInput = z.array(z.object({ key: z.string().max(80), control: fieldControlSchema, reason: z.string().trim().min(1, "Give buyers a reason").max(200) })).max(60);
const templateScope = {
  allLocations: z.boolean(),
  locationIds: z.array(z.uuid()).max(100).default([]),
};

export const createTemplateSchema = z
  .object({
    name: z.string().trim().min(1, "Name the template, for example ACME Staff Polo").max(80, "Use 80 characters or fewer"),
    configurationId: z.uuid("Choose what the template starts from"),
    assetVersionIds: z.array(z.uuid()).max(10).default([]),
    ...templateScope,
  })
  .refine((value) => value.allLocations || value.locationIds.length > 0, { message: "Choose at least one location, or All locations", path: ["locationIds"] });
export type CreateTemplate = z.infer<typeof createTemplateSchema>;

export const updateTemplateSchema = z
  .object({
    name: z.string().trim().min(1, "Name the template").max(80),
    fields: fieldControlsInput,
    assetVersionIds: z.array(z.uuid()).max(10),
    ...templateScope,
    version: z.number().int(),
  })
  .refine((value) => value.allLocations || value.locationIds.length > 0, { message: "Choose at least one location, or All locations", path: ["locationIds"] });
export type UpdateTemplate = z.infer<typeof updateTemplateSchema>;

export const templateActionSchema = z.object({ version: z.number().int() });

/* Staff approval (frame 117; OPS-FR-082). */

export const templateCheckSchema = z.object({ label: z.string(), pass: z.boolean(), detail: z.string().nullable() });
export const adminTemplateSchema = templateSchema.omit({ canManage: true }).extend({
  organizationId: z.string(),
  organizationName: z.string(),
  createdBy: z.string().nullable(),
  checks: z.array(templateCheckSchema),
});
export type AdminTemplate = z.infer<typeof adminTemplateSchema>;

export const adminTemplateRowSchema = z.object({ id: z.string(), name: z.string(), organizationName: z.string(), productName: z.string(), status: templateStatusSchema, updatedAt: isoDate });
export const adminTemplateListSchema = z.object({ templates: z.array(adminTemplateRowSchema) });
export type AdminTemplateList = z.infer<typeof adminTemplateListSchema>;

export const decideTemplateSchema = z.object({
  decision: z.enum(["APPROVE", "RETURN_TO_DRAFT"]),
  note: z.string().trim().max(1000).nullable().default(null),
  version: z.number().int(),
});
