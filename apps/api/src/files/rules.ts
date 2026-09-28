import type { StaffPermission } from "@holypearls/contracts";

export type FilePurpose = "ARTWORK" | "PROJECT_ATTACHMENT" | "PROOF" | "PROBLEM_PHOTO" | "CSV_IMPORT" | "PRODUCT_MEDIA";
export type FileType = "image/jpeg" | "image/png" | "image/webp" | "application/pdf" | "text/csv";

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

/**
 * Allowed types and limits per purpose (TECH-04 §4, starting values). AI, EPS,
 * SVG and PSD are not accepted: SVG can contain scripts, and design files go
 * through "design help" instead.
 */
export const PURPOSES: Record<FilePurpose, PurposeRule> = {
  ARTWORK: { types: ["image/jpeg", "image/png", "application/pdf"], maxBytes: 50 * MB, bucket: "private", typesLabel: "JPEG, PNG or PDF" },
  PROJECT_ATTACHMENT: { types: ["image/jpeg", "image/png", "application/pdf"], maxBytes: 25 * MB, bucket: "private", typesLabel: "JPEG, PNG or PDF" },
  PROOF: {
    types: ["image/jpeg", "image/png", "application/pdf"],
    maxBytes: 100 * MB,
    staffPermission: "PROOF_MANAGE",
    bucket: "private",
    typesLabel: "JPEG, PNG or PDF",
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
};

/** Upload URLs last 15 minutes; download URLs 5 minutes (TECH-04 §3, §6). */
export const UPLOAD_URL_SECONDS = 15 * 60;
export const DOWNLOAD_URL_SECONDS = 5 * 60;
/** Unattached uploads are deleted after 7 days (TECH-04 §13). */
export const UNATTACHED_DAYS = 7;

/** Detects the real type from the first bytes. Never trust the browser's claim (TECH-04 §3). */
export function detectType(head: Buffer): FileType | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (head.subarray(0, 4).toString("latin1") === "RIFF" && head.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (head.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
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
