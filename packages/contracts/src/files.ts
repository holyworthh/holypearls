import { z } from "zod";

export const filePurposeSchema = z.enum(["ARTWORK", "PROJECT_ATTACHMENT", "PROOF", "PROBLEM_PHOTO", "CSV_IMPORT", "PRODUCT_MEDIA", "CONTENT_MEDIA"]);
export const fileStatusSchema = z.enum(["PENDING_UPLOAD", "PROCESSING", "READY", "NEEDS_REVIEW", "REJECTED"]);

/** Step 1 (TECH-04 §3): what the browser says about the file. Never trusted; checked again after upload. */
export const createUploadSchema = z.object({
  purpose: filePurposeSchema,
  fileName: z.string().trim().min(1).max(255),
  size: z.number().int().positive(),
  contentType: z.string().max(100),
  owner: z.object({ type: z.string().max(40), id: z.uuid() }).optional(),
});

export const fileViewSchema = z.object({
  id: z.string(),
  purpose: filePurposeSchema,
  status: fileStatusSchema,
  name: z.string(),
  sizeBytes: z.number(),
  type: z.string(),
  /** Why a file was rejected or needs review, in plain words. */
  reason: z.string().nullable(),
  metadata: z.record(z.string(), z.number()).nullable(),
  hasThumbnail: z.boolean(),
  pages: z.number().int(),
  createdAt: z.iso.datetime(),
});
export type FileView = z.infer<typeof fileViewSchema>;

export const uploadCreatedSchema = z.object({
  file: fileViewSchema,
  /** PUT the file here; valid 15 minutes, one object only. */
  uploadUrl: z.url(),
  expiresInSeconds: z.number().int(),
});

/** Short-lived URL (5 minutes); never stored, emailed or logged. */
export const fileUrlSchema = z.object({ url: z.url(), expiresInSeconds: z.number().int() });
