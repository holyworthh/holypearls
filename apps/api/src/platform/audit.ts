import type { AuditEntry, AuditPage } from "@holypearls/contracts";
import { and, type Database, desc, eq, gte, ilike, lt, or, schema, type Transaction } from "@holypearls/db";
import type { ActorContext } from "../identity/actor.js";

export interface AuditInput {
  action: string;
  summary: string;
  recordType: string;
  recordId?: string | null;
  recordLabel?: string | null;
  before?: unknown;
  after?: unknown;
  permission?: string | null;
}

/** Who did it, for the entry: staff, a signed-in user, or the system. */
export function auditActor(actor: ActorContext | null) {
  if (actor?.type === "guest") {
    return { actorType: "GUEST" as const, actorUserId: null, actorLabel: "Guest", mfaVerifiedAt: null, requestId: actor.requestId };
  }
  if (!actor || actor.type === "anonymous") {
    return { actorType: "SYSTEM" as const, actorUserId: null, actorLabel: "System", mfaVerifiedAt: null, requestId: actor?.requestId ?? null };
  }
  return {
    actorType: actor.staff ? ("STAFF" as const) : ("USER" as const),
    actorUserId: actor.session.userId,
    actorLabel: actor.staff?.displayName ?? actor.session.name,
    mfaVerifiedAt: actor.session.mfaVerifiedAt,
    requestId: actor.requestId,
  };
}

/**
 * Writes one audit entry, inside the business change's transaction when one
 * is given (TECH-03 §15). The table is insert-only.
 */
export async function recordAudit(db: Database | Transaction, actor: ActorContext | null, input: AuditInput): Promise<string> {
  const [row] = await db
    .insert(schema.auditLog)
    .values({
      ...auditActor(actor),
      action: input.action,
      summary: input.summary,
      recordType: input.recordType,
      recordId: input.recordId ?? null,
      recordLabel: input.recordLabel ?? null,
      before: input.before ?? null,
      after: input.after ?? null,
      permission: input.permission ?? null,
    })
    .returning({ id: schema.auditLog.id });
  return row!.id;
}

const toEntry = (row: typeof schema.auditLog.$inferSelect): AuditEntry => ({
  id: row.id,
  occurredAt: row.occurredAt.toISOString(),
  actorType: row.actorType,
  actorLabel: row.actorLabel,
  action: row.action,
  summary: row.summary,
  recordType: row.recordType,
  recordId: row.recordId,
  recordLabel: row.recordLabel,
  before: row.before ?? null,
  after: row.after ?? null,
  permission: row.permission,
  mfaVerifiedAt: row.mfaVerifiedAt?.toISOString() ?? null,
  requestId: row.requestId,
});

/** Cursor = the last entry's time and ID, so paging stays stable as new entries arrive (TECH-02 §3). */
const encodeCursor = (row: { occurredAt: Date; id: string }) =>
  Buffer.from(`${row.occurredAt.toISOString()}|${row.id}`).toString("base64url");

function decodeCursor(cursor: string): { occurredAt: Date; id: string } | null {
  const [time, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
  const occurredAt = new Date(time ?? "");
  return id && !Number.isNaN(occurredAt.getTime()) ? { occurredAt, id } : null;
}

export interface AuditQuery {
  q?: string;
  action?: string;
  sinceDays?: number;
  recordType?: string;
  recordId?: string;
  cursor?: string;
  limit: number;
}

export async function listAudit(db: Database, query: AuditQuery, now = new Date()): Promise<AuditPage> {
  const conditions = [];
  if (query.q) {
    const term = `%${query.q.replace(/[%_\\]/g, (match) => `\\${match}`)}%`;
    conditions.push(
      or(
        ilike(schema.auditLog.summary, term),
        ilike(schema.auditLog.actorLabel, term),
        ilike(schema.auditLog.recordLabel, term),
        ilike(schema.auditLog.recordId, term),
      ),
    );
  }
  if (query.action) conditions.push(eq(schema.auditLog.action, query.action));
  if (query.recordType) conditions.push(eq(schema.auditLog.recordType, query.recordType));
  if (query.recordId) conditions.push(eq(schema.auditLog.recordId, query.recordId));
  if (query.sinceDays) conditions.push(gte(schema.auditLog.occurredAt, new Date(now.getTime() - query.sinceDays * 86_400_000)));
  const cursor = query.cursor ? decodeCursor(query.cursor) : null;
  if (cursor) {
    conditions.push(
      or(
        lt(schema.auditLog.occurredAt, cursor.occurredAt),
        and(eq(schema.auditLog.occurredAt, cursor.occurredAt), lt(schema.auditLog.id, cursor.id)),
      ),
    );
  }

  const rows = await db
    .select()
    .from(schema.auditLog)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(schema.auditLog.occurredAt), desc(schema.auditLog.id))
    .limit(query.limit + 1);
  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  return {
    entries: page.map(toEntry),
    nextCursor: rows.length > query.limit && last ? encodeCursor(last) : null,
  };
}

export async function findAuditEntry(db: Database, id: string): Promise<AuditEntry | null> {
  const [row] = await db.select().from(schema.auditLog).where(eq(schema.auditLog.id, id));
  return row ? toEntry(row) : null;
}
