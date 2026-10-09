import { z } from "zod";

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
