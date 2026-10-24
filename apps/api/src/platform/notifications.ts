import type { NotificationEntry, NotificationPage } from "@holypearls/contracts";
import { and, type Database, eq, or, schema, sql, type Transaction } from "@holypearls/db";
import {
  type EmailSender,
  PermanentEmailError,
  renderTemplate,
  seal,
  TEMPLATES,
  type TemplateData,
  type TemplateName,
  unseal,
} from "@holypearls/email";
import type { Jobs } from "@holypearls/jobs";
import type { ActorContext } from "../identity/actor.js";
import { AppError } from "../errors.js";
import { recordAudit } from "./audit.js";
import { afterCursor, newestFirst, pageOf } from "./cursor.js";

/** Retries plus the first try (TECH-02 §8: email.send has 8 retries). */
const MAX_ATTEMPTS = 9;

export interface NotificationDeps {
  db: Database;
  jobs: Jobs;
  /** DATA_ENCRYPTION_KEY: template data is stored sealed. */
  sealKey: string;
}

export interface QueueEmail<T extends TemplateName> {
  template: T;
  to: string;
  data: TemplateData<T>;
  customerId?: string | null;
  record?: { type: string; id: string; label?: string };
  /** Where the email's button goes, in words, for the admin log. */
  linkLabel?: string;
  requestId: string;
}

/**
 * Services decide a notification is needed; this decides how it's sent
 * (TECH-02 §10). It stores the record and queues `email.send` in the same
 * transaction. Controllers never send email directly.
 */
export async function queueEmail<T extends TemplateName>(
  deps: NotificationDeps,
  tx: Transaction | Database,
  email: QueueEmail<T>,
  resendOfId?: string,
): Promise<string> {
  const definition = TEMPLATES[email.template];
  definition.data.parse(email.data);
  const [row] = await tx
    .insert(schema.notifications)
    .values({
      template: email.template,
      recipient: email.to.trim().toLowerCase(),
      customerId: email.customerId ?? null,
      recordType: email.record?.type ?? null,
      recordId: email.record?.id ?? null,
      recordLabel: email.record?.label ?? null,
      linkLabel: email.linkLabel ?? null,
      maxAttempts: MAX_ATTEMPTS,
      sealedData: seal(email.data, deps.sealKey),
      resendable: !definition.carriesSecret,
      resendOfId: resendOfId ?? null,
    })
    .returning({ id: schema.notifications.id });
  await deps.jobs.send("email.send", { v: 1, requestId: email.requestId, notificationId: row!.id }, { tx: tx as Transaction });
  return row!.id;
}

/** A provider message, cut short and without addresses, for the admin log. */
const safeError = (error: unknown) =>
  (error instanceof Error ? error.message : "Unknown error").replace(/[^\s@]+@[^\s@]+/g, "[address]").slice(0, 200);

/**
 * The email.send job: renders and sends one notification. Safe to run twice:
 * a SENT notification is left alone, and the provider gets our ID as its
 * idempotency key. Permanent failures (a rejected address) stop retrying.
 */
export async function sendNotification(db: Database, sender: EmailSender, sealKey: string, notificationId: string): Promise<void> {
  const [row] = await db.select().from(schema.notifications).where(eq(schema.notifications.id, notificationId));
  if (!row || row.status !== "QUEUED" || !row.sealedData) return;
  const template = row.template as TemplateName;
  const attempts = row.attempts + 1;
  try {
    const rendered = await renderTemplate(template, unseal(row.sealedData, sealKey) as never);
    const result = await sender.send({ ...rendered, to: row.recipient, idempotencyKey: row.id });
    await db
      .update(schema.notifications)
      .set({
        status: "SENT",
        attempts,
        providerMessageId: result.providerMessageId,
        lastError: null,
        lastAttemptAt: new Date(),
        sentAt: new Date(),
        // Links and codes are not kept once they're delivered.
        ...(TEMPLATES[template].carriesSecret ? { sealedData: null } : {}),
      })
      .where(eq(schema.notifications.id, notificationId));
  } catch (error) {
    const permanent = error instanceof PermanentEmailError;
    await db
      .update(schema.notifications)
      .set({
        attempts,
        lastError: safeError(error),
        lastAttemptAt: new Date(),
        ...(permanent ? { status: "FAILED" as const, sealedData: TEMPLATES[template].carriesSecret ? null : row.sealedData } : {}),
      })
      .where(eq(schema.notifications.id, notificationId));
    if (!permanent) throw error;
  }
}

/** Called when email.send used up its retries. */
export async function markNotificationFailed(db: Database, notificationId: string): Promise<void> {
  const [row] = await db.select().from(schema.notifications).where(eq(schema.notifications.id, notificationId));
  if (!row || row.status !== "QUEUED") return;
  await db
    .update(schema.notifications)
    .set({ status: "FAILED", ...(TEMPLATES[row.template as TemplateName]?.carriesSecret ? { sealedData: null } : {}) })
    .where(eq(schema.notifications.id, notificationId));
}

const toEntry = (row: typeof schema.notifications.$inferSelect): NotificationEntry => ({
  id: row.id,
  template: row.template,
  templateLabel: TEMPLATES[row.template as TemplateName]?.label ?? row.template,
  recipient: row.recipient,
  recordType: row.recordType,
  recordId: row.recordId,
  recordLabel: row.recordLabel,
  linkLabel: row.linkLabel,
  status: row.status,
  attempts: row.attempts,
  maxAttempts: row.maxAttempts,
  providerMessageId: row.providerMessageId,
  lastError: row.lastError,
  resendable: row.resendable && row.sealedData !== null,
  resendOfId: row.resendOfId,
  lastAttemptAt: row.lastAttemptAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
});

export async function listNotifications(
  db: Database,
  query: { status?: "QUEUED" | "SENT" | "DELIVERED" | "FAILED"; q?: string; cursor?: string; limit: number },
): Promise<NotificationPage> {
  const conditions = [];
  if (query.status) conditions.push(eq(schema.notifications.status, query.status));
  if (query.q) {
    const term = `%${query.q.toLowerCase().replace(/[%_\\]/g, (match) => `\\${match}`)}%`;
    conditions.push(
      or(sql`${schema.notifications.recipient} like ${term}`, sql`lower(coalesce(${schema.notifications.recordLabel}, '')) like ${term}`),
    );
  }
  const after = afterCursor(schema.notifications.createdAt, schema.notifications.id, query.cursor);
  if (after) conditions.push(after);
  const rows = await db
    .select()
    .from(schema.notifications)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(...newestFirst(schema.notifications.createdAt, schema.notifications.id))
    .limit(query.limit + 1);
  const { page, nextCursor } = pageOf(rows, query.limit, (row) => ({ at: row.createdAt, id: row.id }));
  return { entries: page.map(toEntry), nextCursor };
}

export async function findNotification(db: Database, id: string): Promise<NotificationEntry | null> {
  const [row] = await db.select().from(schema.notifications).where(eq(schema.notifications.id, id));
  return row ? toEntry(row) : null;
}

/**
 * Resending creates a new record; the old one is kept (Pen frame 102).
 * Emails that carried a link or code can't be resent: the person requests a
 * fresh one, so an old secret is never sent again.
 */
export async function resendNotification(deps: NotificationDeps, actor: ActorContext, id: string): Promise<NotificationEntry> {
  const [row] = await deps.db.select().from(schema.notifications).where(eq(schema.notifications.id, id));
  if (!row) throw new AppError("NOT_FOUND");
  if (!row.resendable || !row.sealedData) {
    throw new AppError("RULE_FAILED", {
      message: "This email held a sign-in link or code. Ask the person to request a new one.",
      context: { reason: "CARRIES_SECRET" },
    });
  }
  const data = unseal(row.sealedData, deps.sealKey);
  const newId = await deps.db.transaction(async (tx) => {
    const created = await queueEmail(
      deps,
      tx,
      {
        template: row.template as TemplateName,
        to: row.recipient,
        data: data as never,
        customerId: row.customerId,
        record: row.recordType && row.recordId ? { type: row.recordType, id: row.recordId, label: row.recordLabel ?? undefined } : undefined,
        linkLabel: row.linkLabel ?? undefined,
        requestId: actor.requestId,
      },
      row.id,
    );
    await recordAudit(tx, actor, {
      action: "notification.resent",
      summary: `Email resent: ${TEMPLATES[row.template as TemplateName]?.label ?? row.template}`,
      recordType: "NOTIFICATION",
      recordId: created,
      recordLabel: row.recordLabel,
      before: { notificationId: row.id, status: row.status },
      after: { notificationId: created, status: "QUEUED" },
      permission: "CUSTOMER_SUPPORT",
    });
    return created;
  });
  return (await findNotification(deps.db, newId))!;
}

/** How many emails failed for good since `since` (TECH-07 §12 alert A8). */
export async function failedEmailsSince(db: Database, since: Date): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.notifications).where(and(eq(schema.notifications.status, "FAILED"), sql`${schema.notifications.updatedAt} >= ${since}`));
  return row!.n;
}
