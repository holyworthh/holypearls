import type { AdminHelpRequest, HelpContext, HelpInbox, HelpRequest } from "@holypearls/contracts";
import { and, type Database, desc, eq, lt, or, schema, sql } from "@holypearls/db";
import { AppError } from "../errors.js";
import type { ActorContext } from "../identity/actor.js";
import { createGuestLink, ensureCustomer, redeemGuestLink } from "../identity/customers.js";
import { recordAudit } from "./audit.js";
import { type NotificationDeps, queueEmail } from "./notifications.js";
import { allow, type Decision, hide } from "./policy.js";

export interface HelpDeps extends NotificationDeps {
  webOrigin: string;
  helpInboxEmail: string;
}

type Row = typeof schema.helpRequests.$inferSelect;

/** "Polo configurator · step Artwork": where the person was, for staff. */
export const describeContext = (context: HelpContext) =>
  [context.product?.label ?? context.page.title, context.step ? `step ${context.step}` : null].filter(Boolean).join(" · ");

/**
 * A guest sees only their own request; a signed-in person sees the ones they
 * sent. Anyone else gets 404 (TECH-03 §12).
 */
export function canViewHelpRequest(actor: ActorContext, request: Row): Decision {
  if (actor.type === "user" && request.userId === actor.session.userId) return allow();
  if (actor.type === "guest") {
    const ownSession = request.guestSessionId === actor.guest.guestSessionId;
    const openedByLink = actor.guest.targetType === "HELP_REQUEST" && actor.guest.targetId === request.id;
    if (ownSession || openedByLink) return allow();
  }
  return hide();
}

async function nextReference(db: Database, now: Date) {
  const result = await db.execute<{ n: string }>(sql`select nextval('help_request_number_seq')::text as n`);
  return `HR-${now.getUTCFullYear()}-${String(result.rows[0]!.n).padStart(4, "0")}`;
}

async function replies(db: Database, helpRequestId: string) {
  return db
    .select({
      id: schema.helpReplies.id,
      body: schema.helpReplies.body,
      createdAt: schema.helpReplies.createdAt,
      author: schema.staffProfiles.displayName,
    })
    .from(schema.helpReplies)
    .innerJoin(schema.staffProfiles, eq(schema.staffProfiles.id, schema.helpReplies.staffProfileId))
    .where(eq(schema.helpReplies.helpRequestId, helpRequestId))
    .orderBy(schema.helpReplies.createdAt);
}

const toPublic = (row: Row, list: Awaited<ReturnType<typeof replies>>): HelpRequest => ({
  id: row.id,
  reference: row.reference,
  status: row.status,
  message: row.message,
  context: row.context as HelpContext,
  createdAt: row.createdAt.toISOString(),
  replies: list.map((reply) => ({ id: reply.id, author: reply.author, body: reply.body, createdAt: reply.createdAt.toISOString() })),
});

export interface CreatedHelpRequest {
  request: HelpRequest;
  /** Set when a guest without a session sent it: a guest session so they can see it. */
  guestSession?: { token: string; expiresAt: Date };
}

/**
 * Saves a "Need help" request with its context (PRD-00 §18), tells staff and
 * confirms to the customer. Guests give an email; signed-in customers use
 * their account's.
 */
export async function createHelpRequest(
  deps: HelpDeps,
  actor: ActorContext,
  input: { message: string; email?: string; name?: string; context: HelpContext },
): Promise<CreatedHelpRequest> {
  const now = actor.now;
  const email = actor.type === "user" ? actor.session.email : input.email;
  const customer =
    actor.type === "guest"
      ? (await deps.db.select().from(schema.customers).where(eq(schema.customers.id, actor.guest.customerId)))[0]
      : email
        ? await ensureCustomer(deps.db, {
            email,
            name: actor.type === "user" ? actor.session.name : input.name,
            userId: actor.type === "user" ? actor.session.userId : null,
          })
        : null;
  if (!customer) throw new AppError("VALIDATION_FAILED", { fieldErrors: { email: "Enter your email so we can reply" } });

  const reference = await nextReference(deps.db, now);
  const name = input.name ?? (actor.type === "user" ? actor.session.name : customer.name) ?? null;
  const where = describeContext(input.context);

  const { row, link } = await deps.db.transaction(async (tx) => {
    const [row] = await tx
      .insert(schema.helpRequests)
      .values({
        reference,
        customerId: customer.id,
        userId: actor.type === "user" ? actor.session.userId : null,
        guestSessionId: actor.type === "guest" ? actor.guest.guestSessionId : null,
        name,
        message: input.message,
        context: input.context,
      })
      .returning();
    // Someone with no session gets a link to their own request, so they can come back to it.
    const link =
      actor.type === "anonymous"
        ? await createGuestLink(tx, deps.webOrigin, {
            purpose: "HELP_REQUEST",
            targetType: "HELP_REQUEST",
            targetId: row!.id,
            customerId: customer.id,
            now,
          })
        : null;
    await queueEmail(deps, tx, {
      template: "help_request_staff",
      to: deps.helpInboxEmail,
      data: {
        reference,
        from: `${name ?? "A customer"} (${actor.type === "user" ? "account" : "guest"})`,
        where,
        url: `${deps.webOrigin}/admin/help?request=${row!.id}`,
      },
      record: { type: "HELP_REQUEST", id: row!.id, label: reference },
      linkLabel: `Opens ${reference} in the help inbox`,
      requestId: actor.requestId,
    });
    await queueEmail(deps, tx, {
      template: "help_request_received",
      to: customer.email,
      data: { reference, ...(name ? { name } : {}) },
      customerId: customer.id,
      record: { type: "HELP_REQUEST", id: row!.id, label: reference },
      requestId: actor.requestId,
    });
    return { row: row!, link };
  });

  const created: CreatedHelpRequest = { request: toPublic(row, []) };
  if (link) {
    const redeemed = await redeemGuestLink(deps.db, link.secret, now);
    await deps.db
      .update(schema.helpRequests)
      .set({ guestSessionId: redeemed.session.id })
      .where(eq(schema.helpRequests.id, row.id));
    created.guestSession = { token: redeemed.session.token, expiresAt: redeemed.session.expiresAt };
  }
  return created;
}

export async function getHelpRequestForActor(db: Database, actor: ActorContext, id: string): Promise<HelpRequest> {
  const [row] = await db.select().from(schema.helpRequests).where(eq(schema.helpRequests.id, id));
  if (!row || canViewHelpRequest(actor, row).outcome !== "allow") throw new AppError("NOT_FOUND");
  return toPublic(row, await replies(db, id));
}

/* Staff help inbox (CUSTOMER_SUPPORT, Pen frame 103). */

async function adminRow(db: Database, row: Row, withReplies: boolean): Promise<AdminHelpRequest> {
  const [customer] = await db.select().from(schema.customers).where(eq(schema.customers.id, row.customerId));
  return {
    ...toPublic(row, withReplies ? await replies(db, row.id) : []),
    requester: { name: row.name, email: customer?.email ?? "unknown", kind: row.userId ? "account" : "guest" },
    answeredAt: row.answeredAt?.toISOString() ?? null,
    closedAt: row.closedAt?.toISOString() ?? null,
  };
}

export async function listHelpInbox(
  db: Database,
  query: { status: "OPEN" | "ANSWERED" | "CLOSED"; cursor?: string; limit: number },
): Promise<HelpInbox> {
  const countRows = await db
    .select({ status: schema.helpRequests.status, n: sql<number>`count(*)::int` })
    .from(schema.helpRequests)
    .groupBy(schema.helpRequests.status);
  const counts = { OPEN: 0, ANSWERED: 0, CLOSED: 0 };
  for (const row of countRows) counts[row.status] = row.n;

  const conditions = [eq(schema.helpRequests.status, query.status)];
  if (query.cursor) {
    const [time, id] = Buffer.from(query.cursor, "base64url").toString("utf8").split("|");
    const createdAt = new Date(time ?? "");
    if (id && !Number.isNaN(createdAt.getTime())) {
      conditions.push(
        or(lt(schema.helpRequests.createdAt, createdAt), and(eq(schema.helpRequests.createdAt, createdAt), lt(schema.helpRequests.id, id)))!,
      );
    }
  }
  const rows = await db
    .select()
    .from(schema.helpRequests)
    .where(and(...conditions))
    .orderBy(desc(schema.helpRequests.createdAt), desc(schema.helpRequests.id))
    .limit(query.limit + 1);
  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  const entries = await Promise.all(
    page.map(async (row) => {
      const full: Partial<AdminHelpRequest> = await adminRow(db, row, false);
      delete full.replies;
      return full as Omit<AdminHelpRequest, "replies">;
    }),
  );
  return {
    counts,
    entries,
    nextCursor: rows.length > query.limit && last ? Buffer.from(`${last.createdAt.toISOString()}|${last.id}`).toString("base64url") : null,
  };
}

export async function getHelpRequestForStaff(db: Database, id: string): Promise<AdminHelpRequest> {
  const [row] = await db.select().from(schema.helpRequests).where(eq(schema.helpRequests.id, id));
  if (!row) throw new AppError("NOT_FOUND");
  return adminRow(db, row, true);
}

/** Staff reply by email and the request becomes ANSWERED. */
export async function replyToHelpRequest(deps: HelpDeps, actor: ActorContext, id: string, body: string): Promise<AdminHelpRequest> {
  if (actor.type !== "user" || !actor.staff) throw new AppError("NOT_FOUND");
  const staff = actor.staff;
  const [row] = await deps.db.select().from(schema.helpRequests).where(eq(schema.helpRequests.id, id));
  if (!row) throw new AppError("NOT_FOUND");
  if (row.status === "CLOSED") throw new AppError("CONFLICT", { message: "This request is closed.", context: { reason: "CLOSED" } });
  const [customer] = await deps.db.select().from(schema.customers).where(eq(schema.customers.id, row.customerId));
  await deps.db.transaction(async (tx) => {
    await tx.insert(schema.helpReplies).values({ helpRequestId: id, staffProfileId: staff.staffProfileId, body });
    await tx.update(schema.helpRequests).set({ status: "ANSWERED", answeredAt: actor.now }).where(eq(schema.helpRequests.id, id));
    await queueEmail(deps, tx, {
      template: "help_reply",
      to: customer!.email,
      data: { reference: row.reference, reply: body },
      customerId: customer!.id,
      record: { type: "HELP_REQUEST", id, label: row.reference },
      requestId: actor.requestId,
    });
    await recordAudit(tx, actor, {
      action: "help_request.answered",
      summary: `Replied to ${row.reference}`,
      recordType: "HELP_REQUEST",
      recordId: id,
      recordLabel: row.reference,
      before: { status: row.status },
      after: { status: "ANSWERED" },
      permission: "CUSTOMER_SUPPORT",
    });
  });
  return getHelpRequestForStaff(deps.db, id);
}

export async function closeHelpRequest(db: Database, actor: ActorContext, id: string): Promise<AdminHelpRequest> {
  const [row] = await db.select().from(schema.helpRequests).where(eq(schema.helpRequests.id, id));
  if (!row) throw new AppError("NOT_FOUND");
  if (row.status !== "CLOSED") {
    await db.transaction(async (tx) => {
      await tx.update(schema.helpRequests).set({ status: "CLOSED", closedAt: actor.now }).where(eq(schema.helpRequests.id, id));
      await recordAudit(tx, actor, {
        action: "help_request.closed",
        summary: `Closed ${row.reference}`,
        recordType: "HELP_REQUEST",
        recordId: id,
        recordLabel: row.reference,
        before: { status: row.status },
        after: { status: "CLOSED" },
        permission: "CUSTOMER_SUPPORT",
      });
    });
  }
  return getHelpRequestForStaff(db, id);
}
