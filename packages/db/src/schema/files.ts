import { sql } from "drizzle-orm";
import { bigint, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, idColumn, updatedAt } from "../columns.js";
import { customers } from "./customers.js";
import { users } from "./identity.js";

const at = (name: string) => timestamp(name, { withTimezone: true });

export const filePurpose = pgEnum("file_purpose", [
  "ARTWORK",
  "PROJECT_ATTACHMENT",
  "PROOF",
  "PROBLEM_PHOTO",
  "CSV_IMPORT",
  "PRODUCT_MEDIA",
  "CONTENT_MEDIA",
  "BRAND_ASSET",
]);

/** TECH-01 §4: PENDING_UPLOAD → PROCESSING → READY | NEEDS_REVIEW | REJECTED. */
export const fileStatus = pgEnum("file_status", ["PENDING_UPLOAD", "PROCESSING", "READY", "NEEDS_REVIEW", "REJECTED"]);

/**
 * Every uploaded file (TECH-04). Access follows the record it belongs to
 * (`ownerType`/`ownerId`); until attached, only the uploader can use it.
 * Knowing an ID or storage key never grants access.
 */
export const files = pgTable(
  "files",
  {
    id: idColumn(),
    purpose: filePurpose("purpose").notNull(),
    status: fileStatus("status").notNull().default("PENDING_UPLOAD"),
    ownerType: text("owner_type"),
    ownerId: uuid("owner_id"),
    uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id, { onDelete: "set null" }),
    uploadedByCustomerId: uuid("uploaded_by_customer_id").references(() => customers.id, { onDelete: "set null" }),
    /** The guest session that uploaded it, when a guest did. */
    uploadedByGuestSessionId: uuid("uploaded_by_guest_session_id"),
    originalName: text("original_name").notNull(),
    safeName: text("safe_name").notNull(),
    declaredType: text("declared_type").notNull(),
    declaredSize: bigint("declared_size", { mode: "number" }).notNull(),
    detectedType: text("detected_type"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    storageKey: text("storage_key").notNull(),
    /** Stored in the public-media bucket (staff product media) rather than the private one. */
    bucket: text("bucket").notNull().default("private"),
    /** Why a file was rejected or needs review, in words a customer understands. */
    reason: text("reason"),
    metadata: jsonb("metadata"),
    attachedAt: at("attached_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("files_storage_key_unique").on(table.storageKey),
    index("files_owner_idx").on(table.ownerType, table.ownerId),
    index("files_unattached_idx").on(table.createdAt).where(sql`${table.ownerId} is null`),
  ],
);

export const renditionKind = pgEnum("rendition_kind", ["PREVIEW", "THUMBNAIL", "PAGE"]);

/** Previews made by the worker; browsers only ever show these (TECH-04 §5). */
export const fileRenditions = pgTable(
  "file_renditions",
  {
    id: idColumn(),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    kind: renditionKind("kind").notNull(),
    page: integer("page").notNull().default(1),
    storageKey: text("storage_key").notNull(),
    contentType: text("content_type").notNull(),
    width: integer("width"),
    height: integer("height"),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("file_renditions_unique").on(table.fileId, table.kind, table.page)],
);
