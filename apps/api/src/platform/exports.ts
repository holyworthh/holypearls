import {
  EXPORT_LABELS,
  EXPORT_PERMISSIONS,
  EXPORT_TYPES,
  type ExportItem,
  type ExportList,
  type ExportRequest,
  type ExportType,
  PERSONAL_EXPORTS,
  type StaffPermission,
} from "@holypearls/contracts";
import { and, type Database, desc, eq, inArray, lte, schema } from "@holypearls/db";
import type { Jobs } from "@holypearls/jobs";
import type { StorageAdapter } from "@holypearls/storage";
import { catalogueForExport } from "../catalogue/products.js";
import { AppError } from "../errors.js";
import { collectionTotalsForExport } from "../groups/order-drafts.js";
import { type ActorContext, requireRecentMfa } from "../identity/actor.js";
import { customersForExport } from "../identity/customers.js";
import { ordersForExport } from "../orders/orders.js";
import { paymentsForExport } from "../payments/admin.js";
import { productionForExport } from "../production/production.js";
import { recordAudit } from "./audit.js";

/*
 * Exports (T13-03b; PRD-06 §19; TECH-07 §16; TECH-04 §8; Pen 120). A request
 * only saves a row and queues export.generate; the worker builds the CSV from
 * each module's own export function and writes it to private storage. The
 * file can be downloaded for 24 hours through a 5-minute link, then the daily
 * clean-up removes it. Customers is personal data: EXPORT_PERSONAL_DATA and a
 * recent MFA check (TECH-03 §9). Requests and downloads are audited.
 */

export interface ExportDeps {
  db: Database;
  jobs: Jobs;
  storage: StorageAdapter;
}

type Row = typeof schema.exports.$inferSelect;
const KEEP_MS = 24 * 3_600_000;
const LINK_SECONDS = 5 * 60;

const ROWS: Record<ExportType, (db: Database, range: { start: Date; end: Date }) => Promise<string[][]>> = {
  ORDERS: ordersForExport,
  PAYMENTS: paymentsForExport,
  CUSTOMERS: customersForExport,
  PRODUCTION: productionForExport,
  CATALOGUE: (db) => catalogueForExport(db),
  COLLECTION_TOTALS: collectionTotalsForExport,
};

const permissionsOf = (actor: ActorContext): ReadonlySet<StaffPermission> => (actor.type === "user" && actor.staff ? actor.staff.permissions : new Set());
const allowedTypes = (actor: ActorContext) => EXPORT_TYPES.filter((type) => EXPORT_PERMISSIONS[type].some((permission) => permissionsOf(actor).has(permission)));

/** The permission check every route makes; personal data also needs a recent MFA check when `mfa` is set. */
function mayExport(actor: ActorContext, type: ExportType, mfa: boolean) {
  if (!allowedTypes(actor).includes(type)) throw new AppError("FORBIDDEN", { context: { reason: "PERMISSION_REQUIRED", permission: EXPORT_PERMISSIONS[type][0] } });
  if (mfa && PERSONAL_EXPORTS.includes(type)) requireRecentMfa(actor);
}

const label = (row: Pick<Row, "type" | "fromDate" | "toDate">) => `${EXPORT_LABELS[row.type]}${row.fromDate ? ` · ${row.fromDate} to ${row.toDate}` : ""}`;

function view(row: Row, now: Date): ExportItem {
  const expired = row.status === "EXPIRED" || (row.status === "READY" && row.expiresAt!.getTime() <= now.getTime());
  return {
    id: row.id,
    type: row.type,
    from: row.fromDate,
    to: row.toDate,
    status: expired ? "EXPIRED" : row.status,
    rows: row.rowCount,
    failure: row.failure,
    requestedBy: row.requestedByName,
    requestedAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
  };
}

async function load(db: Database, id: string) {
  const [row] = await db.select().from(schema.exports).where(eq(schema.exports.id, id));
  if (!row) throw new AppError("NOT_FOUND");
  return row;
}

/** Recent exports of the types this person may request (others' too: Pen 120 shows the team's list). */
export async function listExports(db: Database, actor: ActorContext): Promise<ExportList> {
  const allowed = allowedTypes(actor);
  if (!allowed.length) throw new AppError("FORBIDDEN", { context: { reason: "PERMISSION_REQUIRED", permission: "EXPORT_PERSONAL_DATA" } });
  const rows = await db.select().from(schema.exports).where(inArray(schema.exports.type, allowed)).orderBy(desc(schema.exports.createdAt)).limit(50);
  return { items: rows.map((row) => view(row, actor.now)), allowed };
}

export async function requestExport(deps: ExportDeps, actor: ActorContext, input: ExportRequest): Promise<ExportItem> {
  mayExport(actor, input.type, true);
  const personal = PERSONAL_EXPORTS.includes(input.type);
  const range = input.type === "CATALOGUE" ? { fromDate: null, toDate: null } : { fromDate: input.from, toDate: input.to };
  const row = await deps.db.transaction(async (tx) => {
    const [created] = await tx
      .insert(schema.exports)
      .values({ type: input.type, ...range, requestedByUserId: actor.type === "user" ? actor.session.userId : null, requestedByName: actor.type === "user" ? (actor.staff?.displayName ?? "Staff") : "Staff", createdAt: actor.now, updatedAt: actor.now })
      .returning();
    await recordAudit(tx, actor, {
      action: "export.requested",
      summary: `Export requested: ${label(created!)}${personal ? " (personal data)" : ""}`,
      recordType: "EXPORT",
      recordId: created!.id,
      recordLabel: label(created!),
      permission: personal ? "EXPORT_PERSONAL_DATA" : EXPORT_PERMISSIONS[input.type].find((permission) => permissionsOf(actor).has(permission))!,
    });
    await deps.jobs.send("export.generate", { v: 1, requestId: actor.requestId, exportId: created!.id }, { tx });
    return created!;
  });
  return view(row, actor.now);
}

/** A failed export can be tried again (Pen 120 "Failed · retry"). */
export async function retryExport(deps: ExportDeps, actor: ActorContext, id: string): Promise<ExportItem> {
  const row = await load(deps.db, id);
  mayExport(actor, row.type, true);
  const updated = await deps.db.transaction(async (tx) => {
    const [changed] = await tx
      .update(schema.exports)
      .set({ status: "GENERATING", failure: null, updatedAt: actor.now })
      .where(and(eq(schema.exports.id, id), eq(schema.exports.status, "FAILED")))
      .returning();
    if (!changed) throw new AppError("CONFLICT", { context: { reason: "NOT_FAILED" } });
    await recordAudit(tx, actor, { action: "export.retried", summary: `Export retried: ${label(row)}`, recordType: "EXPORT", recordId: id, recordLabel: label(row) });
    await deps.jobs.send("export.generate", { v: 1, requestId: actor.requestId, exportId: id }, { tx });
    return changed;
  });
  return view(updated, actor.now);
}

/** A 5-minute link to a ready file (TECH-04 §6); every download is logged. */
export async function downloadExport(deps: ExportDeps, actor: ActorContext, id: string) {
  const row = await load(deps.db, id);
  mayExport(actor, row.type, false);
  if (view(row, actor.now).status !== "READY") throw new AppError("RULE_FAILED", { context: { reason: "EXPORT_NOT_READY" } });
  await recordAudit(deps.db, actor, {
    action: "export.downloaded",
    summary: `Export downloaded: ${label(row)}`,
    recordType: "EXPORT",
    recordId: id,
    recordLabel: label(row),
    permission: PERSONAL_EXPORTS.includes(row.type) ? "EXPORT_PERSONAL_DATA" : null,
  });
  const fileName = `holypearls-${row.type.toLowerCase().replaceAll("_", "-")}${row.fromDate ? `-${row.fromDate}-to-${row.toDate}` : ""}.csv`;
  return { url: await deps.storage.presignDownload(row.fileKey!, { expiresInSeconds: LINK_SECONDS, fileName }), expiresInSeconds: LINK_SECONDS };
}

/** One CSV cell. A leading =, +, -, @ or tab is neutralised so spreadsheets never run it as a formula (OWASP CSV injection). */
const cell = (value: string) => {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
};
export const toCsv = (rows: string[][]) => rows.map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";

/** export.generate (worker): builds the file once; a repeat delivery after it's built does nothing. */
export async function generateExport(deps: Pick<ExportDeps, "db" | "storage">, id: string, now = new Date()) {
  const row = await load(deps.db, id);
  if (row.status !== "GENERATING") return "skipped";
  // Dates are whole days in Lagos time (WAT, UTC+1, no daylight saving).
  const range = row.fromDate
    ? { start: new Date(`${row.fromDate}T00:00:00+01:00`), end: new Date(new Date(`${row.toDate}T00:00:00+01:00`).getTime() + 86_400_000) }
    : { start: new Date(0), end: now };
  // ponytail: the whole file is built in memory; stream rows to storage when exports reach tens of thousands of rows.
  const rows = await ROWS[row.type](deps.db, range);
  const fileKey = `exports/${id}.csv`;
  // The byte-order mark makes Excel read ₦ and accented names as UTF-8.
  await deps.storage.write(fileKey, Buffer.from(`\uFEFF${toCsv(rows)}`, "utf8"), "text/csv; charset=utf-8");
  await deps.db
    .update(schema.exports)
    .set({ status: "READY", fileKey, rowCount: rows.length - 1, readyAt: now, expiresAt: new Date(now.getTime() + KEEP_MS), updatedAt: now })
    .where(and(eq(schema.exports.id, id), eq(schema.exports.status, "GENERATING")));
  return "ready";
}

/** Dead-letter handler: the export stays listed as failed, with a retry. */
export async function markExportFailed(db: Database, id: string) {
  await db
    .update(schema.exports)
    .set({ status: "FAILED", failure: "We couldn't build this file. Try again.", updatedAt: new Date() })
    .where(and(eq(schema.exports.id, id), eq(schema.exports.status, "GENERATING")));
}

/** Daily clean-up: files past their 24 hours are deleted and the row marked EXPIRED (TECH-04 §8). */
export async function expireExports(deps: Pick<ExportDeps, "db" | "storage">, now: Date) {
  const due = await deps.db
    .select()
    .from(schema.exports)
    .where(and(eq(schema.exports.status, "READY"), lte(schema.exports.expiresAt, now)));
  for (const row of due) {
    if (row.fileKey) await deps.storage.remove(row.fileKey);
    await deps.db.update(schema.exports).set({ status: "EXPIRED", fileKey: null, updatedAt: now }).where(eq(schema.exports.id, row.id));
  }
  return due.length;
}
