import type { StaffPermission } from "@holypearls/contracts";

export type FilePurpose = "ARTWORK" | "PROJECT_ATTACHMENT" | "PROOF" | "PROBLEM_PHOTO" | "CSV_IMPORT" | "PRODUCT_MEDIA" | "CONTENT_MEDIA" | "BRAND_ASSET";
export type FileType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "application/pdf"
  | "image/svg+xml"
  | "application/illustrator"
  | "text/csv";

const MB = 1024 * 1024;

export interface PurposeRule {
  types: readonly FileType[];
  maxBytes: number;
  /** Staff-only purposes and the permission they need. */
  staffPermission?: StaffPermission;
  bucket: "private" | "public";
  /** Words for the upload hint, for example "JPEG, PNG or PDF". */
  typesLabel: string;
}

/** Design files: print-ready PDF first, then Illustrator, SVG and images (docs/research/UPLOAD-FORMATS.md). */
const DESIGN_TYPES: readonly FileType[] = ["application/pdf", "application/illustrator", "image/svg+xml", "image/png", "image/jpeg"];
const DESIGN_LABEL = "PDF, AI, SVG, PNG or JPEG";

/**
 * Allowed types and limits per purpose (TECH-04 §4, starting values; SVG and
 * AI added by the owner, 2026-09-28). SVG originals are only ever downloaded,
 * never shown; browsers see raster previews. EPS and PSD go through "design
 * help" instead.
 */
export const PURPOSES: Record<FilePurpose, PurposeRule> = {
  ARTWORK: { types: DESIGN_TYPES, maxBytes: 50 * MB, bucket: "private", typesLabel: DESIGN_LABEL },
  PROJECT_ATTACHMENT: { types: DESIGN_TYPES, maxBytes: 25 * MB, bucket: "private", typesLabel: DESIGN_LABEL },
  PROOF: {
    types: DESIGN_TYPES,
    maxBytes: 100 * MB,
    staffPermission: "PROOF_MANAGE",
    bucket: "private",
    typesLabel: DESIGN_LABEL,
  },
  PROBLEM_PHOTO: { types: ["image/jpeg", "image/png"], maxBytes: 15 * MB, bucket: "private", typesLabel: "JPEG or PNG" },
  CSV_IMPORT: { types: ["text/csv"], maxBytes: 5 * MB, bucket: "private", typesLabel: "CSV" },
  PRODUCT_MEDIA: {
    types: ["image/jpeg", "image/png", "image/webp"],
    maxBytes: 20 * MB,
    staffPermission: "CATALOGUE_MANAGE",
    bucket: "public",
    typesLabel: "JPEG, PNG or WebP",
  },
  /** An organization's logo or artwork version (T11-01, TECH-04 §9): design files, private to the organization. */
  BRAND_ASSET: { types: DESIGN_TYPES, maxBytes: 50 * MB, bucket: "private", typesLabel: DESIGN_LABEL },
  /** Images for content pages (T02-06): hero, figures and case-study galleries. Public once a page uses them. */
  CONTENT_MEDIA: {
    types: ["image/jpeg", "image/png", "image/webp"],
    maxBytes: 20 * MB,
    staffPermission: "CONTENT_MANAGE",
    bucket: "public",
    typesLabel: "JPEG, PNG or WebP",
  },
};

/** Upload URLs last 15 minutes; download URLs 5 minutes (TECH-04 §3, §6). */
export const UPLOAD_URL_SECONDS = 15 * 60;
export const DOWNLOAD_URL_SECONDS = 5 * 60;
/** Unattached uploads are deleted after 7 days (TECH-04 §13). */
export const UNATTACHED_DAYS = 7;

const isIllustratorName = (name: string) => /\.ai$/i.test(name.trim());
const SVG_START = /^\uFEFF?\s*(<\?xml[^>]*\?>\s*)?((<!--[\s\S]*?-->|<!DOCTYPE[^>]*>)\s*)*<svg[\s>]/i;

/**
 * The type the upload claims. Browsers often send nothing, or
 * application/postscript, for .ai files, so the name decides for AI and SVG.
 */
export function declaredTypeFor(contentType: string, fileName: string): string {
  if (isIllustratorName(fileName)) return "application/illustrator";
  if (/\.svg$/i.test(fileName.trim())) return "image/svg+xml";
  return contentType;
}

/**
 * Detects the real type from the first bytes. Never trust the browser's claim
 * (TECH-04 §3). Illustrator files are PDFs (when saved "PDF compatible") or
 * PostScript inside; the .ai name tells them apart from a plain PDF.
 */
export function detectType(head: Buffer, fileName = ""): FileType | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (head.subarray(0, 4).toString("latin1") === "RIFF" && head.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (head.subarray(0, 5).toString("latin1") === "%PDF-") return isIllustratorName(fileName) ? "application/illustrator" : "application/pdf";
  if (head.subarray(0, 10).toString("latin1") === "%!PS-Adobe" && isIllustratorName(fileName)) return "application/illustrator";
  if (!head.includes(0) && SVG_START.test(head.toString("utf8"))) return "image/svg+xml";
  // CSV: printable UTF-8 text with a separator on the first line, no NUL bytes.
  const text = head.toString("utf8");
  if (!head.includes(0) && !text.includes("�") && /^[^\n]*[,;\t][^\n]*(\r?\n|$)/.test(text) && !/<\s*(svg|html|script)/i.test(text)) {
    return "text/csv";
  }
  return null;
}

/** A file name that is safe to show and to use in a download header. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base.normalize("NFKC").replace(/[^\p{L}\p{N}._ -]/gu, "_").replace(/\s+/g, " ").trim();
  return (cleaned || "file").slice(0, 120);
}

const MIB = (bytes: number) => `${Math.round(bytes / MB)} MB`;
export const describeLimit = (rule: PurposeRule) => `${rule.typesLabel}, up to ${MIB(rule.maxBytes)}`;
