import type { SQL } from "@holypearls/db";
import { type AdminAsset, type AdminAssetReviewList, type AssetVersion, type AssetVersionStatus, BRAND_ASSET_KIND_LABELS, type BrandAsset, type BrandAssetList, type CreateBrandAsset, type ReviewAssetVersion } from "@holypearls/contracts";
import { and, type Database, eq, ilike, inArray, schema, sql, type Transaction } from "@holypearls/db";
import { AppError } from "../errors.js";
import { attachFile, fileSummaries, findFileForActor } from "../files/files.js";
import type { ActorContext } from "../identity/actor.js";
import { assertStaff } from "../identity/staff.guard.js";
import { recordAudit } from "../platform/audit.js";
import { queueEmail } from "../platform/notifications.js";
import { enforce } from "../platform/policy.js";
import { findActiveMember, requireMember } from "./members.js";
import { needsPermission } from "./policies.js";
import type { OrganizationDeps } from "./team.js";
import { templatesNeedReviewFor, templatesUsingAsset } from "./templates.js";

/*
 * Brand assets and versions (T11-01; PRD-05 B2B-FR-020–024; TECH-04 §9).
 * Each version points to exactly one file and is never overwritten: a new
 * file adds V(n+1). Status changes follow TECH-01 §4, one transaction each,
 * audited. PROCESSING becomes NEEDS_REVIEW once the files module has checked
 * the file; HolyPearls staff then mark it PRODUCTION_READY, which supersedes
 * the previous ready version.
 */

type Db = Database | Transaction;
type VersionRow = typeof schema.brandAssetVersions.$inferSelect;
type AssetRow = typeof schema.brandAssets.$inferSelect;

/** Versions that can still be used in templates and new orders (B2B-FR-024: a superseded V4 stays usable until retired). */
export const USABLE_VERSION: readonly AssetVersionStatus[] = ["PRODUCTION_READY", "SUPERSEDED"];

/** PROCESSING versions whose file is now READY move to NEEDS_REVIEW (TECH-01 §4: the file check finished). */
async function syncProcessing(db: Db, rows: VersionRow[]) {
  const waiting = rows.filter((row) => row.status === "PROCESSING");
  if (!waiting.length) return rows;
  const summaries = await fileSummaries(db, waiting.map((row) => row.fileId));
  const ready = waiting.filter((row) => summaries.get(row.fileId)?.status === "READY").map((row) => row.id);
  if (ready.length) {
    await db.update(schema.brandAssetVersions).set({ status: "NEEDS_REVIEW" }).where(and(inArray(schema.brandAssetVersions.id, ready), eq(schema.brandAssetVersions.status, "PROCESSING")));
  }
  return rows.map((row) => (ready.includes(row.id) ? { ...row, status: "NEEDS_REVIEW" as const } : row));
}

async function versionViews(db: Db, rows: VersionRow[]): Promise<AssetVersion[]> {
  const synced = await syncProcessing(db, rows);
  const files = await fileSummaries(db, synced.map((row) => row.fileId));
  const uploaderIds = [...new Set(synced.flatMap((row) => (row.uploadedByUserId ? [row.uploadedByUserId] : [])))];
  const uploaders = uploaderIds.length ? await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(inArray(schema.users.id, uploaderIds)) : [];
  const names = new Map(uploaders.map((row) => [row.id, row.name]));
  return synced
    .sort((a, b) => b.number - a.number)
    .map((row) => {
      const file = files.get(row.fileId);
      return {
        id: row.id,
        number: row.number,
        status: row.status,
        fileId: row.fileId,
        fileName: file?.name ?? "file",
        fileType: file?.type ?? "",
        hasThumbnail: file?.hasThumbnail ?? false,
        reviewNote: row.reviewNote ?? (row.status === "PROCESSING" && file?.status === "REJECTED" ? file.reason : null),
        uploadedBy: row.uploadedByUserId ? (names.get(row.uploadedByUserId) ?? null) : null,
        createdAt: row.createdAt.toISOString(),
        reviewedAt: row.reviewedAt?.toISOString() ?? null,
      };
    });
}

async function versionsOf(db: Db, assetIds: readonly string[]) {
  if (!assetIds.length) return new Map<string, VersionRow[]>();
  const rows = await db.select().from(schema.brandAssetVersions).where(inArray(schema.brandAssetVersions.assetId, [...assetIds]));
  const byAsset = new Map<string, VersionRow[]>();
  for (const row of rows) byAsset.set(row.assetId, [...(byAsset.get(row.assetId) ?? []), row]);
  return byAsset;
}

/** Scoped query: an asset of this organization, or 404. */
async function assetOf(db: Db, organizationId: string, assetId: string, options: { lock?: boolean } = {}) {
  const query = db.select().from(schema.brandAssets).where(and(eq(schema.brandAssets.id, assetId), eq(schema.brandAssets.organizationId, organizationId)));
  const [row] = options.lock ? await query.for("update") : await query;
  if (!row) throw new AppError("NOT_FOUND");
  return row;
}

async function assetView(db: Db, asset: AssetRow, canManage: boolean): Promise<BrandAsset> {
  const versions = await versionViews(db, (await versionsOf(db, [asset.id])).get(asset.id) ?? []);
  const templates = await templatesUsingAsset(db as Database, asset.id);
  return { id: asset.id, name: asset.name, kind: asset.kind, versions, templates, canManage, version: asset.version };
}

/** The library (frame 65): every member sees the organization's assets; MANAGE_BRAND changes them. */
export async function listBrandAssets(db: Database, actor: ActorContext, organizationId: string, options: { query?: string } = {}): Promise<BrandAssetList> {
  const member = await requireMember(db, actor, organizationId);
  const term = options.query?.trim().replace(/[%_\\]/g, "\\$&");
  const assets = await db.select().from(schema.brandAssets).where(and(eq(schema.brandAssets.organizationId, organizationId), term ? ilike(schema.brandAssets.name, `%${term}%`) : undefined)).orderBy(schema.brandAssets.name);
  const byAsset = await versionsOf(db, assets.map((asset) => asset.id));
  const views = await Promise.all(
    assets.map(async (asset) => {
      const versions = await versionViews(db, byAsset.get(asset.id) ?? []);
      return {
        id: asset.id,
        name: asset.name,
        kind: asset.kind,
        current: versions.find((version) => version.status === "PRODUCTION_READY") ?? null,
        latest: versions[0]!,
        versionCount: versions.length,
        updatedAt: (versions[0] ? versions[0].createdAt : asset.updatedAt.toISOString()),
      };
    }),
  );
  return { assets: views.filter((view) => view.latest), canManage: member.permissions.has("MANAGE_BRAND") };
}

export async function getBrandAsset(db: Database, actor: ActorContext, organizationId: string, assetId: string): Promise<BrandAsset> {
  const member = await requireMember(db, actor, organizationId);
  return assetView(db, await assetOf(db, organizationId, assetId), member.permissions.has("MANAGE_BRAND"));
}

/** The uploaded file must be the person's own, unattached, and a brand asset upload. */
async function usableUpload(db: Database, actor: ActorContext, fileId: string) {
  const file = await findFileForActor(db, actor, fileId);
  if (file.purpose !== "BRAND_ASSET" || file.ownerId) throw new AppError("VALIDATION_FAILED", { fieldErrors: { fileId: "Upload a new brand asset file" } });
  if (file.status === "REJECTED") throw new AppError("VALIDATION_FAILED", { fieldErrors: { fileId: file.reason ?? "This file can't be used. Upload another one." } });
  return file;
}

const firstStatus = (fileStatus: string): AssetVersionStatus => (fileStatus === "READY" ? "NEEDS_REVIEW" : "PROCESSING");

export async function createBrandAsset(db: Database, actor: ActorContext, organizationId: string, input: CreateBrandAsset): Promise<BrandAsset> {
  const member = await requireMember(db, actor, organizationId);
  enforce(needsPermission(member, "MANAGE_BRAND"));
  const file = await usableUpload(db, actor, input.fileId);
  const asset = await db.transaction(async (tx) => {
    const [created] = await tx.insert(schema.brandAssets).values({ organizationId, name: input.name, kind: input.kind, createdByUserId: member.userId }).returning();
    const [version] = await tx
      .insert(schema.brandAssetVersions)
      .values({ assetId: created!.id, number: 1, fileId: file.id, status: firstStatus(file.status), uploadedByUserId: member.userId })
      .returning();
    await attachFile(tx, file.id, { type: "BRAND_ASSET_VERSION", id: version!.id });
    await recordAudit(tx, actor, {
      action: "brand_asset.created",
      summary: `Brand asset added: ${input.name} V1`,
      recordType: "BRAND_ASSET",
      recordId: created!.id,
      recordLabel: member.organizationName,
      after: { name: input.name, kind: input.kind, versionId: version!.id, number: 1, status: version!.status },
      permission: "MANAGE_BRAND",
    });
    return created!;
  });
  return assetView(db, asset, true);
}

/** Replace version (B2B-FR-023): V(n+1) is added; every earlier version stays as it was. */
export async function addBrandAssetVersion(db: Database, actor: ActorContext, organizationId: string, assetId: string, fileId: string): Promise<BrandAsset> {
  const member = await requireMember(db, actor, organizationId);
  enforce(needsPermission(member, "MANAGE_BRAND"));
  const file = await usableUpload(db, actor, fileId);
  const asset = await db.transaction(async (tx) => {
    const locked = await assetOf(tx, organizationId, assetId, { lock: true });
    const [last] = await tx.select({ number: sql<number | null>`max(${schema.brandAssetVersions.number})` }).from(schema.brandAssetVersions).where(eq(schema.brandAssetVersions.assetId, assetId));
    const number = (last?.number ?? 0) + 1;
    const [version] = await tx.insert(schema.brandAssetVersions).values({ assetId, number, fileId: file.id, status: firstStatus(file.status), uploadedByUserId: member.userId }).returning();
    await tx.update(schema.brandAssets).set({ version: locked.version + 1 }).where(eq(schema.brandAssets.id, assetId));
    await attachFile(tx, file.id, { type: "BRAND_ASSET_VERSION", id: version!.id });
    await recordAudit(tx, actor, {
      action: "brand_asset.version_added",
      summary: `New version uploaded: ${locked.name} V${number}`,
      recordType: "BRAND_ASSET",
      recordId: assetId,
      recordLabel: member.organizationName,
      after: { versionId: version!.id, number, status: version!.status },
      permission: "MANAGE_BRAND",
    });
    return locked;
  });
  return assetView(db, { ...asset, version: asset.version + 1 }, true);
}

/** Retire (B2B-FR-021): no new orders with it. Ready and superseded versions can be retired (B2B-FR-024). */
async function retire(tx: Transaction, actor: ActorContext, asset: AssetRow, versionId: string, label: string, permission: string) {
  const [row] = await tx.select().from(schema.brandAssetVersions).where(and(eq(schema.brandAssetVersions.id, versionId), eq(schema.brandAssetVersions.assetId, asset.id))).for("update");
  if (!row) throw new AppError("NOT_FOUND");
  if (!USABLE_VERSION.includes(row.status)) throw new AppError("RULE_FAILED", { message: "Only a version in use can be retired.", context: { reason: "NOT_IN_USE", status: row.status } });
  await tx.update(schema.brandAssetVersions).set({ status: "RETIRED" }).where(eq(schema.brandAssetVersions.id, versionId));
  // Templates using it can't be ordered until they move to a current version (B2B-FR-024).
  await templatesNeedReviewFor(tx, actor, versionId);
  await recordAudit(tx, actor, {
    action: "brand_asset.version_retired",
    summary: `Retired for new use: ${asset.name} V${row.number}`,
    recordType: "BRAND_ASSET",
    recordId: asset.id,
    recordLabel: label,
    before: { versionId, status: row.status },
    after: { versionId, status: "RETIRED" },
    permission,
  });
}

/** Archive: any version, from any status (TECH-01 §4). History stays; it can't be deleted. */
async function archive(tx: Transaction, actor: ActorContext, asset: AssetRow, versionId: string, label: string, permission: string) {
  const [row] = await tx.select().from(schema.brandAssetVersions).where(and(eq(schema.brandAssetVersions.id, versionId), eq(schema.brandAssetVersions.assetId, asset.id))).for("update");
  if (!row) throw new AppError("NOT_FOUND");
  if (row.status === "ARCHIVED") throw new AppError("RULE_FAILED", { message: "This version is already archived.", context: { reason: "ALREADY_ARCHIVED" } });
  await tx.update(schema.brandAssetVersions).set({ status: "ARCHIVED" }).where(eq(schema.brandAssetVersions.id, versionId));
  await recordAudit(tx, actor, {
    action: "brand_asset.version_archived",
    summary: `Archived: ${asset.name} V${row.number}`,
    recordType: "BRAND_ASSET",
    recordId: asset.id,
    recordLabel: label,
    before: { versionId, status: row.status },
    after: { versionId, status: "ARCHIVED" },
    permission,
  });
}

export async function changeBrandAssetVersion(db: Database, actor: ActorContext, organizationId: string, assetId: string, versionId: string, action: "retire" | "archive"): Promise<BrandAsset> {
  const member = await requireMember(db, actor, organizationId);
  enforce(needsPermission(member, "MANAGE_BRAND"));
  const asset = await db.transaction(async (tx) => {
    const locked = await assetOf(tx, organizationId, assetId, { lock: true });
    await (action === "retire" ? retire : archive)(tx, actor, locked, versionId, member.organizationName, "MANAGE_BRAND");
    return locked;
  });
  return assetView(db, asset, true);
}

/* Files (TECH-04): who may download a version's file. */

export async function canSeeBrandAssetVersion(db: Database, actor: ActorContext, versionId: string) {
  if (actor.type !== "user") return false;
  if (actor.staff?.permissions.has("STAFF_ADMIN") || actor.staff?.permissions.has("ORGANIZATION_SUPPORT")) return true;
  const [row] = await db
    .select({ organizationId: schema.brandAssets.organizationId })
    .from(schema.brandAssetVersions)
    .innerJoin(schema.brandAssets, eq(schema.brandAssets.id, schema.brandAssetVersions.assetId))
    .where(eq(schema.brandAssetVersions.id, versionId));
  return Boolean(row && (await findActiveMember(db, row.organizationId, actor.session.userId)));
}

/* Staff production review (frame 116; OPS-FR-083). STAFF_ADMIN until the owner chooses a permission. */

const REVIEW_PERMISSION = "STAFF_ADMIN" as const;

export async function assetReviewQueue(db: Database, status = "NEEDS_REVIEW"): Promise<AdminAssetReviewList> {
  const wanted: AssetVersionStatus[] = status === "PROCESSING" ? ["PROCESSING"] : status === "ALL" ? ["PROCESSING", "NEEDS_REVIEW"] : ["NEEDS_REVIEW"];
  // Versions whose file finished checking move along first.
  await syncProcessing(db, await db.select().from(schema.brandAssetVersions).where(eq(schema.brandAssetVersions.status, "PROCESSING")).limit(500));
  const rows = await db
    .select({ version: schema.brandAssetVersions, asset: schema.brandAssets, organizationName: schema.organizations.name, uploadedBy: schema.users.name })
    .from(schema.brandAssetVersions)
    .innerJoin(schema.brandAssets, eq(schema.brandAssets.id, schema.brandAssetVersions.assetId))
    .innerJoin(schema.organizations, eq(schema.organizations.id, schema.brandAssets.organizationId))
    .leftJoin(schema.users, eq(schema.users.id, schema.brandAssetVersions.uploadedByUserId))
    .where(inArray(schema.brandAssetVersions.status, wanted))
    .orderBy(schema.brandAssetVersions.createdAt)
    .limit(200);
  return {
    versions: rows.map((row) => ({
      versionId: row.version.id,
      assetId: row.asset.id,
      assetName: row.asset.name,
      kind: row.asset.kind,
      organizationId: row.asset.organizationId,
      organizationName: row.organizationName,
      number: row.version.number,
      status: row.version.status,
      uploadedBy: row.uploadedBy,
      createdAt: row.version.createdAt.toISOString(),
    })),
  };
}

export async function adminBrandAsset(db: Database, assetId: string): Promise<AdminAsset> {
  const [row] = await db
    .select({ asset: schema.brandAssets, organizationName: schema.organizations.name })
    .from(schema.brandAssets)
    .innerJoin(schema.organizations, eq(schema.organizations.id, schema.brandAssets.organizationId))
    .where(eq(schema.brandAssets.id, assetId));
  if (!row) throw new AppError("NOT_FOUND");
  const { canManage: _canManage, ...view } = await assetView(db, row.asset, false);
  void _canManage;
  return { ...view, organizationId: row.asset.organizationId, organizationName: row.organizationName };
}

/** Assets for the read-only support view (OPS-FR-081). */
export async function organizationAssetSummaries(db: Database, organizationId: string) {
  const assets = await db.select().from(schema.brandAssets).where(eq(schema.brandAssets.organizationId, organizationId)).orderBy(schema.brandAssets.name);
  const byAsset = await versionsOf(db, assets.map((asset) => asset.id));
  return assets.map((asset) => {
    const versions = (byAsset.get(asset.id) ?? []).sort((a, b) => b.number - a.number);
    const current = versions.find((version) => version.status === "PRODUCTION_READY");
    return { id: asset.id, name: asset.name, kind: asset.kind, latestNumber: versions[0]?.number ?? 0, latestStatus: versions[0]?.status ?? "PROCESSING", currentNumber: current?.number ?? null };
  });
}

async function adminAssetForVersion(tx: Transaction, versionId: string) {
  const [row] = await tx
    .select({ asset: schema.brandAssets, organizationName: schema.organizations.name })
    .from(schema.brandAssetVersions)
    .innerJoin(schema.brandAssets, eq(schema.brandAssets.id, schema.brandAssetVersions.assetId))
    .innerJoin(schema.organizations, eq(schema.organizations.id, schema.brandAssets.organizationId))
    .where(eq(schema.brandAssetVersions.id, versionId));
  if (!row) throw new AppError("NOT_FOUND");
  await tx.select({ id: schema.brandAssets.id }).from(schema.brandAssets).where(eq(schema.brandAssets.id, row.asset.id)).for("update");
  return row;
}

/**
 * Mark PRODUCTION_READY, or keep in review with a note asking for a new file
 * (frame 116). Ready supersedes the asset's previous ready version; templates
 * on it stay usable ("Available using logo V4", T11-01b). The uploader is
 * emailed either way.
 */
export async function reviewBrandAssetVersion(deps: OrganizationDeps, actor: ActorContext, versionId: string, input: ReviewAssetVersion): Promise<AdminAsset> {
  const staff = assertStaff(actor, REVIEW_PERMISSION);
  if (input.decision === "KEEP_IN_REVIEW" && !input.note) throw new AppError("VALIDATION_FAILED", { fieldErrors: { note: "Tell the organization what to change" } });
  const assetId = await deps.db.transaction(async (tx) => {
    const { asset, organizationName } = await adminAssetForVersion(tx, versionId);
    const [row] = await tx.select().from(schema.brandAssetVersions).where(eq(schema.brandAssetVersions.id, versionId)).for("update");
    const [synced] = await syncProcessing(tx, [row!]);
    if (synced!.status !== "NEEDS_REVIEW") throw new AppError("RULE_FAILED", { message: synced!.status === "PROCESSING" ? "The file is still being checked." : "This version isn't waiting for review.", context: { reason: "NOT_IN_REVIEW", status: synced!.status } });
    if (input.decision === "PRODUCTION_READY") {
      await tx
        .update(schema.brandAssetVersions)
        .set({ status: "SUPERSEDED" })
        .where(and(eq(schema.brandAssetVersions.assetId, asset.id), eq(schema.brandAssetVersions.status, "PRODUCTION_READY")));
      await tx.update(schema.brandAssetVersions).set({ status: "PRODUCTION_READY", reviewNote: input.note, reviewedAt: actor.now, reviewedByStaffId: staff.staff.staffProfileId }).where(eq(schema.brandAssetVersions.id, versionId));
    } else {
      await tx.update(schema.brandAssetVersions).set({ reviewNote: input.note, reviewedAt: actor.now, reviewedByStaffId: staff.staff.staffProfileId }).where(eq(schema.brandAssetVersions.id, versionId));
    }
    await recordAudit(tx, actor, {
      action: input.decision === "PRODUCTION_READY" ? "brand_asset.version_ready" : "brand_asset.version_kept_in_review",
      summary: `${input.decision === "PRODUCTION_READY" ? "Production ready" : "Kept in review"}: ${asset.name} V${row!.number}`,
      recordType: "BRAND_ASSET",
      recordId: asset.id,
      recordLabel: organizationName,
      before: { versionId, status: "NEEDS_REVIEW" },
      after: { versionId, status: input.decision === "PRODUCTION_READY" ? "PRODUCTION_READY" : "NEEDS_REVIEW", note: input.note },
      permission: REVIEW_PERMISSION,
    });
    if (row!.uploadedByUserId) {
      const [uploader] = await tx.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, row!.uploadedByUserId));
      if (uploader) {
        await queueEmail(deps, tx, {
          template: "brand_asset_reviewed",
          to: uploader.email,
          data: {
            asset: `${asset.name} V${row!.number}`,
            kind: BRAND_ASSET_KIND_LABELS[asset.kind],
            ready: input.decision === "PRODUCTION_READY",
            note: input.note ?? undefined,
            url: `${deps.webOrigin}/workspace/${asset.organizationId}/assets/${asset.id}`,
          },
          record: { type: "BRAND_ASSET", id: asset.id, label: asset.name },
          requestId: actor.requestId,
        });
      }
    }
    return asset.id;
  });
  return adminBrandAsset(deps.db, assetId);
}

export async function staffChangeBrandAssetVersion(db: Database, actor: ActorContext, versionId: string, action: "retire" | "archive"): Promise<AdminAsset> {
  assertStaff(actor, REVIEW_PERMISSION);
  const assetId = await db.transaction(async (tx) => {
    const { asset, organizationName } = await adminAssetForVersion(tx, versionId);
    await (action === "retire" ? retire : archive)(tx, actor, asset, versionId, organizationName, REVIEW_PERMISSION);
    return asset.id;
  });
  return adminBrandAsset(db, assetId);
}


/** Retained attachments and snapshots must survive upload cleanup. */
export function assetRetainsFile(fileId: string | SQL) {
  return sql`exists (select 1 from brand_asset_versions where file_id = ${fileId}::uuid)`;
}
