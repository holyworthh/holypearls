import type { AuditEntry, AuditPage } from "@holypearls/contracts";
import { and, type Database, eq, gte, ilike, or, schema, type Transaction } from "@holypearls/db";
import type { ActorContext } from "../identity/actor.js";
import { afterCursor, newestFirst, pageOf } from "./cursor.js";

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
    // Staff are named (it's their work record); a customer is identified by ID only (review P2-09).
    actorLabel: actor.staff?.displayName ?? "Customer",
    mfaVerifiedAt: actor.session.mfaVerifiedAt,
    requestId: actor.requestId,
  };
}

/**
 * Personal details never enter the insert-only audit log (review P2-09):
 * emails, phone numbers, addresses, names of customers and contact or billing
 * blocks are replaced wherever they appear in `before` and `after`, and an
 * email or phone number in the record label is masked. Audit rows can't be
 * changed later, so they mustn't need erasing.
 */
const PERSONAL_KEY = /^(e-?mail|phone|mobile|street|address|landmark|postcode|contact|billing|delivery_?address|first_?name|last_?name|full_?name|customer_?name|recipient|account_?name|ip_?address)$/i;
export const REMOVED = "[personal data removed]";

/** For stored raw bodies (Paystack, courier): the JSON without personal keys, or REMOVED when it isn't JSON. */
export function scrubJsonText(raw: string): string {
  try {
    return JSON.stringify(withoutPersonalData(JSON.parse(raw)));
  } catch {
    return REMOVED;
  }
}

export function withoutPersonalData(value: unknown, depth = 0): unknown {
  if (depth > 8 || value === null || typeof value !== "object") return typeof value === "string" ? maskContact(value) : value;
  if (Array.isArray(value)) return value.map((item) => withoutPersonalData(item, depth + 1));
  return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, PERSONAL_KEY.test(key) ? REMOVED : withoutPersonalData(inner, depth + 1)]));
}

const EMAIL = /[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+/g;
const PHONE = /\+?\d[\d\s-]{8,}\d/g;
const maskContact = (text: string) => text.replace(EMAIL, REMOVED).replace(PHONE, REMOVED);

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
      recordLabel: input.recordLabel ? maskContact(input.recordLabel) : null,
      before: withoutPersonalData(input.before ?? null),
      after: withoutPersonalData(input.after ?? null),
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
        ilike(schema.auditLog.requestId, term),
      ),
    );
  }
  if (query.action) conditions.push(eq(schema.auditLog.action, query.action));
  if (query.recordType) conditions.push(eq(schema.auditLog.recordType, query.recordType));
  if (query.recordId) conditions.push(eq(schema.auditLog.recordId, query.recordId));
  if (query.sinceDays) conditions.push(gte(schema.auditLog.occurredAt, new Date(now.getTime() - query.sinceDays * 86_400_000)));
  // Cursor = the last entry's time and ID, so paging stays stable as new entries arrive.
  const after = afterCursor(schema.auditLog.occurredAt, schema.auditLog.id, query.cursor);
  if (after) conditions.push(after);

  const rows = await db
    .select()
    .from(schema.auditLog)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(...newestFirst(schema.auditLog.occurredAt, schema.auditLog.id))
    .limit(query.limit + 1);
  const { page, nextCursor } = pageOf(rows, query.limit, (row) => ({ at: row.occurredAt, id: row.id }));
  return { entries: page.map(toEntry), nextCursor };
}

export async function findAuditEntry(db: Database, id: string): Promise<AuditEntry | null> {
  const [row] = await db.select().from(schema.auditLog).where(eq(schema.auditLog.id, id));
  return row ? toEntry(row) : null;
}
