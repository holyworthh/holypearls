import type { SQL } from "@holypearls/db";
import { catalogueRetainsFile } from "../catalogue/media.js";
import { assetRetainsFile } from "../organizations/assets.js";
import { canSeeImportFile, importRetainsFile } from "../groups/imports.js";
import { canReadOrder, orderRetainsFile } from "../orders/orders.js";
import { cartRetainsFile } from "../sales/cart.js";
import { quoteRetainsFile } from "../quotes/customer.js";
import { canSeeProjectFile, projectRetainsFile } from "../projects/projects.js";
import { canSeeConfigurationFile, configurationRetainsFile } from "../configuration/drafts.js";
import type { FileView } from "@holypearls/contracts";
import { and, type Database, eq, inArray, isNull, lt, schema, sql, type Transaction } from "@holypearls/db";
import type { Jobs } from "@holypearls/jobs";
import type { StorageAdapter } from "@holypearls/storage";
import { AppError } from "../errors.js";
import type { ActorContext } from "../identity/actor.js";
import { customerForActor } from "../identity/customers.js";
import { incidentSwitches } from "../platform/incidents.js";
import { canViewHelpRequest } from "../platform/help-requests.js";
import { canSeeBrandAssetVersion } from "../organizations/assets.js";
import {
  DOWNLOAD_URL_SECONDS,
  describeLimit,
  declaredTypeFor,
  detectType,
  type FilePurpose,
  type FileType,
  PURPOSES,
  safeFileName,
  UNATTACHED_DAYS,
  UPLOAD_URL_SECONDS,
} from "./rules.js";

export interface FileDeps {
  db: Database;
  jobs: Jobs;
  storage: StorageAdapter;
  publicStorage: StorageAdapter;
}

type FileRow = typeof schema.files.$inferSelect;
const storageFor = (deps: Pick<FileDeps, "storage" | "publicStorage">, row: { bucket: string }) =>
  row.bucket === "public" ? deps.publicStorage : deps.storage;

/**
 * Who may attach files to, and see files of, each kind of record (TECH-04 §7).
 * Each module registers its record type here; access follows that record's
 * permissions.
 */
export const FILE_OWNERS: Record<string, (db: Database, actor: ActorContext, ownerId: string) => Promise<boolean>> = {
  CONFIGURATION: canSeeConfigurationFile,
  PRODUCT: async (_db, actor) => actor.type === "user" && Boolean(actor.staff?.permissions.has("CATALOGUE_MANAGE")),
  IMPORT_BATCH: canSeeImportFile,
  /** Content-page images are public once shown; in admin, content staff manage them. */
  CONTENT_PAGE: async (_db, actor) => actor.type === "user" && Boolean(actor.staff?.permissions.has("CONTENT_MANAGE")),
  /** Project files: the project's owner or its link's guest; staff who quote it (QUOTE_MANAGE). */
  PROJECT: canSeeProjectFile,
  /** A published proof version's files: whoever can open its order; staff with PROOF_MANAGE (TECH-04 §10). */
  PROOF_VERSION: async (db, actor, ownerId) => {
    if (actor.type === "user" && actor.staff?.permissions.has("PROOF_MANAGE")) return true;
    const [row] = await db
      .select({ status: schema.proofVersions.status, orderId: schema.orderItems.orderId })
      .from(schema.proofVersions)
      .innerJoin(schema.proofs, eq(schema.proofs.id, schema.proofVersions.proofId))
      .innerJoin(schema.orderItems, eq(schema.orderItems.id, schema.proofs.orderItemId))
      .where(eq(schema.proofVersions.id, ownerId));
    if (!row || row.status === "DRAFT") return false;
    return canReadOrder(db, actor, row.orderId);
  },
  /** Problem report photos: support staff, or whoever can open the order (T08-01). */
  PROBLEM_REPORT: async (db, actor, ownerId) => {
    if (actor.type === "user" && actor.staff?.permissions.has("CUSTOMER_SUPPORT")) return true;
    const [row] = await db
      .select({ orderId: schema.problemReports.orderId })
      .from(schema.problemReports)
      .where(eq(schema.problemReports.id, ownerId));
    if (!row) return false;
    return canReadOrder(db, actor, row.orderId);
  },
  /** A brand asset version (T11-01): members of its organization, and staff who support or review organizations. */
  BRAND_ASSET_VERSION: async (db, actor, ownerId) => canSeeBrandAssetVersion(db, actor, ownerId),
  HELP_REQUEST: async (db, actor, ownerId) => {
    const [row] = await db.select().from(schema.helpRequests).where(eq(schema.helpRequests.id, ownerId));
    return Boolean(row) && canViewHelpRequest(actor, row!).outcome === "allow";
  },
};

/** Until attached, a file belongs to whoever uploaded it. After that, to its record. */
async function canUseFile(db: Database, actor: ActorContext, row: FileRow): Promise<boolean> {
  if (row.ownerType || row.ownerId) {
    if (!row.ownerType || !row.ownerId) return false;
    const check = FILE_OWNERS[row.ownerType];
    return check ? check(db, actor, row.ownerId) : false;
  }
  if (actor.type === "user" && row.uploadedByUserId === actor.session.userId) return true;
  if (actor.type === "guest" && row.uploadedByGuestSessionId === actor.guest.guestSessionId) return true;
  // Staff files (proofs, product media) are visible to staff holding that purpose's permission.
  const permission = PURPOSES[row.purpose as FilePurpose].staffPermission;
  return Boolean(permission && actor.type === "user" && actor.staff?.permissions.has(permission));
}

/** Loads a file the actor may use, or 404: missing and not-yours look the same. */
export async function findFileForActor(db: Database, actor: ActorContext, id: string): Promise<FileRow> {
  const [row] = await db.select().from(schema.files).where(eq(schema.files.id, id));
  if (!row || !(await canUseFile(db, actor, row))) throw new AppError("NOT_FOUND");
  return row;
}

export async function toFileView(db: Database, row: FileRow): Promise<FileView> {
  const renditions = await db
    .select({ kind: schema.fileRenditions.kind, page: schema.fileRenditions.page })
    .from(schema.fileRenditions)
    .where(eq(schema.fileRenditions.fileId, row.id));
  return {
    id: row.id,
    purpose: row.purpose,
    status: row.status,
    name: row.safeName,
    sizeBytes: row.sizeBytes ?? row.declaredSize,
    type: row.detectedType ?? row.declaredType,
    reason: row.reason,
    metadata: (row.metadata as Record<string, number> | null) ?? null,
    hasThumbnail: renditions.some((item) => item.kind === "THUMBNAIL"),
    pages: renditions.filter((item) => item.kind === "PAGE").length,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Status, name, type and thumbnail for several files at once, for records that show their files (no N+1). */
export async function fileSummaries(db: Database | Transaction, ids: readonly string[]) {
  if (!ids.length) return new Map<string, { status: FileRow["status"]; name: string; type: string; hasThumbnail: boolean; reason: string | null }>();
  const [rows, thumbs] = await Promise.all([
    db.select().from(schema.files).where(inArray(schema.files.id, [...ids])),
    db.select({ fileId: schema.fileRenditions.fileId }).from(schema.fileRenditions).where(and(inArray(schema.fileRenditions.fileId, [...ids]), eq(schema.fileRenditions.kind, "THUMBNAIL"))),
  ]);
  const withThumb = new Set(thumbs.map((row) => row.fileId));
  return new Map(rows.map((row) => [row.id, { status: row.status, name: row.safeName, type: row.detectedType ?? row.declaredType, hasThumbnail: withThumb.has(row.id), reason: row.reason }]));
}

/**
 * Step 1–3 (TECH-04 §3): checks the purpose's limits and who may attach,
 * then creates the row and a 15-minute URL for one object. Oversized and
 * disallowed files are refused before anything is signed.
 */
export async function createUpload(
  deps: FileDeps,
  actor: ActorContext,
  input: { purpose: FilePurpose; fileName: string; size: number; contentType: string; owner?: { type: string; id: string } },
) {
  if ((await incidentSwitches(deps.db)).uploadsPausedSince) throw new AppError("RULE_FAILED", { message: "Uploads are paused for a short while. Your saved files still work. Try again later.", context: { reason: "UPLOADS_PAUSED" } });
  const rule = PURPOSES[input.purpose];
  if (rule.staffPermission) {
    if (actor.type !== "user" || !actor.staff) throw new AppError("NOT_FOUND");
    if (!actor.staff.permissions.has(rule.staffPermission)) {
      throw new AppError("FORBIDDEN", { context: { permission: rule.staffPermission } });
    }
  } else if (actor.type === "anonymous") {
    throw new AppError("NOT_SIGNED_IN");
  }
  const declaredType = declaredTypeFor(input.contentType, input.fileName);
  if (!rule.types.includes(declaredType as FileType)) {
    throw new AppError("VALIDATION_FAILED", { fieldErrors: { file: `Upload ${rule.typesLabel}.` }, context: { reason: "TYPE_NOT_ALLOWED" } });
  }
  if (input.size > rule.maxBytes) {
    throw new AppError("VALIDATION_FAILED", {
      fieldErrors: { file: `This file is too big. Upload ${describeLimit(rule)}.` },
      context: { reason: "TOO_LARGE", maxBytes: rule.maxBytes },
    });
  }
  if (input.owner) {
    const check = FILE_OWNERS[input.owner.type];
    if (!check || !(await check(deps.db, actor, input.owner.id))) throw new AppError("NOT_FOUND");
  }

  const customer = actor.type === "user" && actor.staff ? null : await customerForActor(deps.db, actor);
  const [row] = await deps.db
    .insert(schema.files)
    .values({
      purpose: input.purpose,
      ownerType: input.owner?.type ?? null,
      ownerId: input.owner?.id ?? null,
      attachedAt: input.owner ? new Date() : null,
      uploadedByUserId: actor.type === "user" ? actor.session.userId : null,
      uploadedByGuestSessionId: actor.type === "guest" ? actor.guest.guestSessionId : null,
      uploadedByCustomerId: customer?.id ?? null,
      originalName: input.fileName.slice(0, 255),
      safeName: safeFileName(input.fileName),
      declaredType,
      declaredSize: input.size,
      storageKey: `pending-${crypto.randomUUID()}`,
      bucket: rule.bucket,
    })
    .returning();
  const storageKey = `uploads/pending/${row!.id}`;
  await deps.db.update(schema.files).set({ storageKey }).where(eq(schema.files.id, row!.id));
  const uploadUrl = await storageFor(deps, row!).presignUpload(storageKey, {
    contentType: input.contentType,
    contentLength: input.size,
    expiresInSeconds: UPLOAD_URL_SECONDS,
  });
  return { file: await toFileView(deps.db, { ...row!, storageKey }), uploadUrl, uploadHeaders: { "if-none-match": "*" }, expiresInSeconds: UPLOAD_URL_SECONDS };
}

/** Steps 5–6: the browser says it finished; the API checks the object and its real size, then queues file.inspect. */
export async function completeUpload(deps: FileDeps, actor: ActorContext, id: string) {
  const row = await findFileForActor(deps.db, actor, id);
  if (row.status !== "PENDING_UPLOAD") return toFileView(deps.db, row);
  const head = await storageFor(deps, row).head(row.storageKey);
  if (!head) {
    throw new AppError("RULE_FAILED", { message: "We didn't receive the file. Try uploading it again.", context: { reason: "NOT_UPLOADED" } });
  }
  const rule = PURPOSES[row.purpose as FilePurpose];
  const tooBig = head.size > rule.maxBytes;
  await deps.db.transaction(async (tx) => {
    await tx
      .update(schema.files)
      .set({
        sizeBytes: head.size,
        status: tooBig ? "REJECTED" : "PROCESSING",
        reason: tooBig ? `This file is too big. Upload ${describeLimit(rule)}.` : null,
      })
      .where(eq(schema.files.id, id));
    if (!tooBig) await deps.jobs.send("file.inspect", { v: 1, requestId: actor.requestId, fileId: id }, { tx });
  });
  const [updated] = await deps.db.select().from(schema.files).where(eq(schema.files.id, id));
  return toFileView(deps.db, updated!);
}

const REJECT_TYPE = (rule: { typesLabel: string }) =>
  `This isn't a file we can use. Upload ${rule.typesLabel}. For EPS or PSD files, ask us for design help.`;

/**
 * file.inspect (step 7): reads the first bytes to find the real type. A type
 * that isn't allowed, or doesn't match the claim, is REJECTED. Safe to run twice.
 */
export async function inspectFile(deps: Pick<FileDeps, "db" | "jobs" | "storage" | "publicStorage">, fileId: string, requestId: string) {
  const [row] = await deps.db.select().from(schema.files).where(eq(schema.files.id, fileId));
  if (!row || row.status !== "PROCESSING") return;
  const rule = PURPOSES[row.purpose as FilePurpose];
  const detected = detectType(await storageFor(deps, row).readStart(row.storageKey, 4096), row.originalName);
  const allowed = detected !== null && rule.types.includes(detected);
  const matches = detected === row.declaredType || (detected === "text/csv" && row.declaredType.startsWith("text/"));
  if (!allowed || !matches) {
    await deps.db.update(schema.files).set({ status: "REJECTED", detectedType: detected, reason: REJECT_TYPE(rule) }).where(eq(schema.files.id, fileId));
    return;
  }
  await deps.db.transaction(async (tx) => {
    await tx.update(schema.files).set({ detectedType: detected }).where(eq(schema.files.id, fileId));
    await deps.jobs.send("file.preview", { v: 1, requestId, fileId }, { tx });
  });
}

/** Called for inspect or preview jobs that used up their retries. */
export async function markFileNeedsReview(db: Database, fileId: string, reason: string) {
  await db
    .update(schema.files)
    .set({ status: "NEEDS_REVIEW", reason })
    .where(and(eq(schema.files.id, fileId), eq(schema.files.status, "PROCESSING")));
}

/** A 5-minute download URL for the original (owner and permitted staff only). Never stored or logged. */
export async function downloadUrl(deps: FileDeps, actor: ActorContext, id: string) {
  const row = await findFileForActor(deps.db, actor, id);
  if (row.status === "PENDING_UPLOAD" || row.status === "REJECTED") {
    throw new AppError("RULE_FAILED", { message: "This file isn't available.", context: { reason: row.status } });
  }
  return { url: await storageFor(deps, row).presignDownload(row.storageKey, { expiresInSeconds: DOWNLOAD_URL_SECONDS, fileName: row.safeName }), expiresInSeconds: DOWNLOAD_URL_SECONDS };
}

/** A 5-minute URL for a preview; browsers only ever display previews (TECH-04 §5). */
export async function previewUrl(deps: FileDeps, actor: ActorContext, id: string, kind: "PREVIEW" | "THUMBNAIL" | "PAGE", page = 1) {
  const row = await findFileForActor(deps.db, actor, id);
  const [rendition] = await deps.db
    .select()
    .from(schema.fileRenditions)
    .where(and(eq(schema.fileRenditions.fileId, id), eq(schema.fileRenditions.kind, kind), eq(schema.fileRenditions.page, page)));
  if (!rendition) throw new AppError("NOT_FOUND");
  return {
    url: await storageFor(deps, row).presignDownload(rendition.storageKey, { expiresInSeconds: DOWNLOAD_URL_SECONDS, inline: true }),
    expiresInSeconds: DOWNLOAD_URL_SECONDS,
  };
}

/** Modules call this inside their own transaction when a file joins a record. */
export async function attachFile(tx: Transaction, fileId: string, owner: { type: string; id: string }) {
  await tx
    .update(schema.files)
    .set({ ownerType: owner.type, ownerId: owner.id, attachedAt: new Date() })
    .where(and(eq(schema.files.id, fileId), isNull(schema.files.ownerId)));
}

const unreferenced = (fileId: string | SQL) => and(
  ...[configurationRetainsFile, projectRetainsFile, quoteRetainsFile, cartRetainsFile, orderRetainsFile, importRetainsFile, assetRetainsFile, catalogueRetainsFile]
    .map(retained => sql`not (${retained(fileId)})`),
);

/** cleanup.daily: removes uploads never attached to anything after 7 days, with their previews (TECH-04 §13). */
export async function removeUnattachedFiles(deps: Pick<FileDeps, "db" | "storage" | "publicStorage">, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - UNATTACHED_DAYS * 86_400_000);
  const candidates = await deps.db.select({ id: schema.files.id }).from(schema.files)
    .where(and(isNull(schema.files.ownerId), lt(schema.files.createdAt, cutoff), unreferenced(sql`${schema.files.id}`))).limit(500);
  let removed = 0;
  for (const candidate of candidates) {
    removed += await deps.db.transaction(async tx => {
      const [row] = await tx.select().from(schema.files)
        .where(and(eq(schema.files.id, candidate.id), isNull(schema.files.ownerId), lt(schema.files.createdAt, cutoff)))
        .for("update", { skipLocked: true });
      if (!row) return 0;
      const [eligible] = await tx.select({ id: schema.files.id }).from(schema.files).where(and(eq(schema.files.id, row.id), unreferenced(row.id)));
      if (!eligible) return 0;
      const renditions = await tx.select().from(schema.fileRenditions).where(eq(schema.fileRenditions.fileId, row.id));
      const store = storageFor(deps, row);
      // Hold the attachment lock and retain retry metadata until every object is gone.
      await store.remove(row.storageKey);
      for (const rendition of renditions) await store.remove(rendition.storageKey);
      await tx.delete(schema.files).where(eq(schema.files.id, row.id));
      return 1;
    });
  }
  return removed;
}

/** How many files were rejected or need review since `since` (TECH-07 §12 alert A9). */
export async function failedFilesSince(db: Database, since: Date): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.files)
    .where(and(inArray(schema.files.status, ["REJECTED", "NEEDS_REVIEW"]), sql`${schema.files.updatedAt} >= ${since}`));
  return row!.n;
}

/**
 * Daily copy of private files to the backup bucket (TECH-07 §5): READY and NEEDS_REVIEW files changed
 * since `since`, skipping any already copied at the same size. Returns how many were copied.
 * ponytail: buffered copy (max 100 MB), 7-day window; server-side CopyObject or a watermark when volume grows.
 */
export async function backupFiles(deps: { db: Database; storage: StorageAdapter; backupStorage: StorageAdapter }, since: Date): Promise<number> {
  const rows = await deps.db
    .select()
    .from(schema.files)
    .where(and(eq(schema.files.bucket, "private"), inArray(schema.files.status, ["READY", "NEEDS_REVIEW"]), sql`${schema.files.updatedAt} >= ${since}`));
  let copied = 0;
  for (const row of rows) {
    const size = (await deps.storage.head(row.storageKey))?.size;
    if (size === undefined || (await deps.backupStorage.head(row.storageKey))?.size === size) continue;
    await deps.backupStorage.write(row.storageKey, await deps.storage.read(row.storageKey), row.detectedType ?? row.declaredType);
    copied += 1;
  }
  return copied;
}
