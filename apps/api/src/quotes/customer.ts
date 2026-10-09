import { type AccountQuote, type CustomerQuote, displayMoney, type PaymentSummary, type QuoteVersion, type ScheduleEntry } from "@holypearls/contracts";
import { and, asc, type Database, desc, eq, inArray, isNotNull, lt, schema, sql } from "@holypearls/db";
import { AppError } from "../errors.js";
import type { ActorContext } from "../identity/actor.js";
import { createGuestLink, requireRecentEmailCode } from "../identity/customers.js";
import { nextNumber, type OrderEmailDeps } from "../orders/orders.js";
import { beginAttempt, type PaymentDeps, paymentSettings, paymentsBlocker } from "../payments/payments.js";
import { releaseReadyItems } from "../production/production.js";
import { createProofsForOrder } from "../proofs/proofs.js";
import { recordAudit } from "../platform/audit.js";
import { queueEmail } from "../platform/notifications.js";
import { deviceHash } from "../sales/cart.js";
import { quoteTotals, schedulePayments } from "./quote-math.js";
import { day } from "./quotes.js";

/*
 * The customer's quote (T05-05; QUOTE-FR-002–008, PAY-FR-001–004, TECH-05 §4,
 * §8). Accepting creates the order from the exact accepted version, with its
 * payment schedule, in one transaction; a unique version on orders means a
 * second accept returns the same order. Installments are paid one at a time
 * through the T04-03 payment flow.
 */

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type QuoteRow = typeof schema.quotes.$inferSelect;
type VersionRow = typeof schema.quoteVersions.$inferSelect;

export interface QuoteAccess {
  actor: ActorContext;
  deviceKey: string | null;
}

/**
 * Who can open a quote: the account behind its customer, a guest link to the
 * quote, or whoever can open the project or design it quotes (their owner,
 * browser or link). Anyone else gets 404 (TECH-03 §12).
 */
/** The account's newest quotes, through its linked customer record (TECH-03 §6), for its overview. */
export async function accountQuotes(db: Database, userId: string, limit = 10): Promise<AccountQuote[]> {
  const rows = await db
    .select({ quote: schema.quotes, projectTitle: schema.projects.title })
    .from(schema.quotes)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.quotes.customerId))
    .leftJoin(schema.projects, eq(schema.projects.id, schema.quotes.projectId))
    .where(eq(schema.customers.userId, userId))
    .orderBy(desc(schema.quotes.updatedAt))
    .limit(limit);
  return Promise.all(
    rows.map(async ({ quote, projectTitle }) => {
      // The newest version the customer has received.
      const [sent] = await db
        .select({ number: schema.quoteVersions.number, validUntil: schema.quoteVersions.validUntil })
        .from(schema.quoteVersions)
        .where(and(eq(schema.quoteVersions.quoteId, quote.id), isNotNull(schema.quoteVersions.sentAt)))
        .orderBy(desc(schema.quoteVersions.number))
        .limit(1);
      const snapshot = quote.requestSnapshot as { productName?: string };
      return {
        kind: "QUOTE" as const,
        id: quote.id,
        reference: quote.reference,
        version: sent?.number ?? null,
        title: projectTitle || snapshot.productName || "Your project",
        status: quote.status,
        validUntil: sent?.validUntil?.toISOString() ?? null,
        href: `/quotes/${quote.id}`,
      };
    }),
  );
}

/** Quotes asked for with a customer record before an account existed: the ones linking added. */
export async function quotesBefore(db: Database, customerId: string, before: Date): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.quotes)
    .where(and(eq(schema.quotes.customerId, customerId), lt(schema.quotes.createdAt, before)));
  return row?.n ?? 0;
}

export async function loadCustomerQuote(db: Database | Tx, access: QuoteAccess, id: string): Promise<QuoteRow> {
  const [row] = await db
    .select({
      quote: schema.quotes,
      customerUser: schema.customers.userId,
      projectUser: schema.projects.ownerUserId,
      projectDevice: schema.projects.ownerDeviceHash,
      designUser: schema.configurations.ownerUserId,
      designDevice: schema.configurations.ownerDeviceHash,
    })
    .from(schema.quotes)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.quotes.customerId))
    .leftJoin(schema.projects, eq(schema.projects.id, schema.quotes.projectId))
    .leftJoin(schema.configurations, eq(schema.configurations.id, schema.quotes.configurationId))
    .where(eq(schema.quotes.id, id));
  if (!row) throw new AppError("NOT_FOUND");
  const { actor, deviceKey } = access;
  const quote = row.quote;
  const device = deviceKey ? deviceHash(deviceKey) : null;
  const allowed =
    (actor.type === "user" && [row.customerUser, row.projectUser, row.designUser].includes(actor.session.userId)) ||
    (actor.type === "guest" &&
      ((actor.guest.targetType === "QUOTE" && actor.guest.targetId === quote.id) ||
        (actor.guest.targetType === "PROJECT" && actor.guest.targetId === quote.projectId) ||
        (actor.guest.targetType === "CONFIGURATION" && quote.configurationIds.includes(actor.guest.targetId)))) ||
    (device !== null && (row.projectDevice === device || row.designDevice === device));
  if (!allowed) throw new AppError("NOT_FOUND");
  return quote;
}


function versionOut(row: VersionRow, lines: (typeof schema.quoteLineItems.$inferSelect)[]): Omit<QuoteVersion, "version" | "sentBy" | "scheduleProblem"> {
  const schedule = row.schedule as ScheduleEntry[];
  const payments = schedulePayments(row.totalMinor, schedule);
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    currency: row.currency as "NGN" | "USD",
    lines: lines.map((line) => ({ id: line.id, source: line.source, sourceKey: line.sourceKey, title: line.title, summary: line.summary, quantity: line.quantity, unitMinor: line.unitMinor.toString(), totalMinor: line.totalMinor.toString() })),
    fees: {
      designMinor: row.designMinor.toString(),
      deliveryMinor: row.deliveryMinor.toString(),
      deliveryNote: row.deliveryNote,
      installationMinor: row.installationMinor.toString(),
      installationNote: row.installationNote,
      otherMinor: row.otherMinor.toString(),
      otherLabel: row.otherLabel,
    },
    totals: { goodsMinor: row.goodsMinor.toString(), feesMinor: row.feesMinor.toString(), vatRateBps: row.vatRateBps, vatMinor: row.vatMinor.toString(), totalMinor: row.totalMinor.toString() },
    validDays: row.validDays,
    validUntil: row.validUntil?.toISOString() ?? null,
    terms: row.terms,
    assumptions: row.assumptions,
    productionSequence: row.productionSequence,
    schedule,
    payments: payments.ok ? payments.payments.map((payment) => ({ ...payment, amountMinor: payment.amountMinor.toString() })) : null,
    sentAt: row.sentAt?.toISOString() ?? null,
  };
}

/** "What changed from V1" (QUOTE-FR-005): line quantity and price changes, lines added and removed, fee, total and validity changes. */
export function describeChanges(before: { lines: { title: string; quantity: number; unitMinor: bigint }[]; fees: Record<string, bigint>; totalMinor: bigint; currency: string }, after: typeof before): string[] {
  const changes: string[] = [];
  const old = new Map(before.lines.map((line) => [line.title, line]));
  const now = new Map(after.lines.map((line) => [line.title, line]));
  for (const line of after.lines) {
    const previous = old.get(line.title);
    if (!previous) changes.push(`${line.title} added`);
    else {
      if (previous.quantity !== line.quantity) changes.push(`${line.title} ${previous.quantity} → ${line.quantity}`);
      if (previous.unitMinor !== line.unitMinor) changes.push(`${line.title} price ${displayMoney(previous.unitMinor, before.currency)} → ${displayMoney(line.unitMinor, after.currency)} each`);
    }
  }
  for (const line of before.lines) if (!now.has(line.title)) changes.push(`${line.title} removed`);
  const feeNames: Record<string, string> = { design: "Design fee", delivery: "Delivery", installation: "Installation", other: "Other fee" };
  for (const [key, label] of Object.entries(feeNames)) {
    const a = before.fees[key] ?? 0n;
    const b = after.fees[key] ?? 0n;
    if (a === 0n && b > 0n) changes.push(`${label} added`);
    else if (a > 0n && b === 0n) changes.push(`${label} removed`);
    else if (a !== b) changes.push(`${label} ${displayMoney(a, before.currency)} → ${displayMoney(b, after.currency)}`);
  }
  if (before.totalMinor !== after.totalMinor) changes.push(`Total ${displayMoney(before.totalMinor, before.currency)} → ${displayMoney(after.totalMinor, after.currency)}`);
  return changes;
}

const changeInput = (row: VersionRow, lines: (typeof schema.quoteLineItems.$inferSelect)[]) => ({
  lines: lines.map((line) => ({ title: line.title, quantity: line.quantity, unitMinor: line.unitMinor })),
  fees: { design: row.designMinor, delivery: row.deliveryMinor, installation: row.installationMinor, other: row.otherMinor },
  totalMinor: row.totalMinor,
  currency: row.currency,
});

/** The quote page (Pen 25 desktop, 46 mobile, 47 expired). Drafts are never shown. */
export async function getCustomerQuote(db: Database, access: QuoteAccess, id: string): Promise<CustomerQuote> {
  const quote = await loadCustomerQuote(db, access, id);
  const versions = await db
    .select()
    .from(schema.quoteVersions)
    .where(and(eq(schema.quoteVersions.quoteId, id), inArray(schema.quoteVersions.status, ["SENT", "SUPERSEDED", "ACCEPTED", "DECLINED", "EXPIRED"])))
    .orderBy(desc(schema.quoteVersions.number));
  const shown = versions[0] ?? null;
  const lines = versions.length
    ? await db.select().from(schema.quoteLineItems).where(inArray(schema.quoteLineItems.quoteVersionId, versions.map((version) => version.id))).orderBy(asc(schema.quoteLineItems.position))
    : [];
  const linesOf = (versionId: string) => lines.filter((line) => line.quoteVersionId === versionId);
  const previous = versions[1];
  const changes = shown && previous ? describeChanges(changeInput(previous, linesOf(previous.id)), changeInput(shown, linesOf(shown.id))) : [];
  const [order] = shown ? await db.select({ id: schema.orders.id, number: schema.orders.number }).from(schema.orders).where(eq(schema.orders.quoteVersionId, shown.id)) : [];
  const [project] = quote.projectId ? await db.select({ reference: schema.projects.reference, title: schema.projects.title }).from(schema.projects).where(eq(schema.projects.id, quote.projectId)) : [];
  const snapshot = quote.requestSnapshot as { productName?: string; title?: string | null; type?: string };
  const requests = await db.select().from(schema.quoteChangeRequests).where(eq(schema.quoteChangeRequests.quoteId, id)).orderBy(desc(schema.quoteChangeRequests.createdAt));
  const blockers = acceptBlockers(quote, shown, access.actor.now);
  return {
    id: quote.id,
    reference: quote.reference,
    status: quote.status,
    title: project?.title || snapshot.productName || "Your project",
    projectReference: project?.reference ?? null,
    version: shown ? versionOut(shown, linesOf(shown.id)) : null,
    versions: versions.map((version) => ({ number: version.number, status: version.status, sentAt: version.sentAt?.toISOString() ?? null })),
    changes,
    canAccept: blockers.length === 0,
    blockers,
    order: order ?? null,
    requests: requests.map((request) => ({
      kind: request.kind,
      note: request.note,
      line: request.lineId ? (lines.find((line) => line.id === request.lineId)?.title ?? null) : request.changeType,
      createdAt: request.createdAt.toISOString(),
      status: request.status,
    })),
  };
}

/** Acceptance blockers (TECH-01 §4), checked when accepting, never stored. The email code is checked at accept time. */
function acceptBlockers(quote: QuoteRow, shown: VersionRow | null, now: Date): CustomerQuote["blockers"] {
  if (quote.status === "ACCEPTED") return [{ code: "ALREADY_ACCEPTED", message: "You accepted this quote." }];
  if (!shown || shown.status === "EXPIRED" || quote.status === "EXPIRED" || (shown.validUntil && shown.validUntil <= now)) {
    if (shown) return [{ code: "EXPIRED", message: "This quote has expired. Accept is unavailable on expired quotes." }];
  }
  if (quote.status !== "READY" || !shown || shown.status !== "SENT") return [{ code: "NOT_READY", message: quote.status === "REVISION_REQUESTED" ? "We're revising this quote after your request. You'll get the new version by email." : "This quote isn't ready to accept." }];
  return [];
}

/**
 * Accept (QUOTE-FR-007–008, TECH-05 §8). The customer confirms they've
 * reviewed it and has checked an email code recently. In one transaction,
 * under the quote's lock: the version and quote become ACCEPTED, the project
 * and design ORDERED; the order is made from this version's lines (unique on
 * the version), with its payment schedule; the customer gets the order's link
 * and what's due. A second accept returns the same order.
 */
export async function acceptQuote(deps: OrderEmailDeps, access: QuoteAccess, id: string, input: { versionNumber: number }) {
  const { actor } = access;
  const quote = await loadCustomerQuote(deps.db, access, id);
  const [already] = await deps.db
    .select({ id: schema.orders.id, number: schema.orders.number })
    .from(schema.orders)
    .innerJoin(schema.quoteVersions, eq(schema.quoteVersions.id, schema.orders.quoteVersionId))
    .where(eq(schema.quoteVersions.quoteId, id));
  if (already) return already;
  if (actor.type === "anonymous") {
    throw new AppError("RULE_FAILED", { message: "Open this quote from the link in your email to accept it.", context: { reason: "OPEN_FROM_EMAIL" } });
  }
  await requireRecentEmailCode(deps.db, actor);

  return deps.db.transaction(async (tx) => {
    const [locked] = await tx.select().from(schema.quotes).where(eq(schema.quotes.id, quote.id)).for("update");
    const [version] = await tx
      .select()
      .from(schema.quoteVersions)
      .where(and(eq(schema.quoteVersions.quoteId, id), eq(schema.quoteVersions.number, input.versionNumber)));
    if (!version) throw new AppError("NOT_FOUND");
    const [existing] = await tx.select({ id: schema.orders.id, number: schema.orders.number }).from(schema.orders).where(eq(schema.orders.quoteVersionId, version.id));
    if (existing) return existing;
    const blockers = acceptBlockers(locked!, version.status === "SENT" ? version : null, actor.now);
    if (version.status !== "SENT") throw new AppError("RULE_FAILED", { message: "This version can't be accepted any more. Open the latest version of the quote.", context: { reason: "NOT_CURRENT_VERSION" } });
    if (blockers.length) throw new AppError("RULE_FAILED", { message: blockers[0]!.message, context: { reason: blockers[0]!.code } });

    const payments = schedulePayments(version.totalMinor, version.schedule as ScheduleEntry[]);
    if (!payments.ok) throw new AppError("INTERNAL", { message: "This quote's payment schedule doesn't add up. Contact us." });

    // History is insert-only (PRD-00 §14): the acceptance record, then the status moves.
    await tx.insert(schema.quoteAcceptances).values({
      quoteVersionId: version.id,
      customerId: actor.type === "guest" ? actor.guest.customerId : locked!.customerId,
      actorType: actor.type === "user" ? "USER" : "GUEST",
      emailVerifiedAt: actor.type === "guest" ? actor.guest.emailVerifiedAt : actor.now,
      acknowledgement: "I have reviewed the scope, pricing and production terms in this quote.",
    });
    await tx.update(schema.quoteVersions).set({ status: "ACCEPTED", updatedAt: new Date() }).where(eq(schema.quoteVersions.id, version.id));
    await tx.update(schema.quotes).set({ status: "ACCEPTED", version: sql`${schema.quotes.version} + 1`, updatedAt: new Date() }).where(eq(schema.quotes.id, id));
    let owner: { userId: string | null; device: string | null } = { userId: null, device: null };
    if (locked!.projectId) {
      const [project] = await tx.update(schema.projects).set({ status: "ORDERED", version: sql`${schema.projects.version} + 1` }).where(eq(schema.projects.id, locked!.projectId)).returning();
      owner = { userId: project?.ownerUserId ?? null, device: project?.ownerDeviceHash ?? null };
    }
    if (locked!.configurationId) {
      const designs = locked!.configurationIds.length ? locked!.configurationIds : [locked!.configurationId];
      await tx.update(schema.configurations).set({ status: "ORDERED" }).where(inArray(schema.configurations.id, designs));
      const [design] = await tx.select().from(schema.configurations).where(eq(schema.configurations.id, locked!.configurationId));
      owner = { userId: design?.ownerUserId ?? null, device: design?.ownerDeviceHash ?? null };
    }
    const [customer] = await tx.select({ userId: schema.customers.userId }).from(schema.customers).where(eq(schema.customers.id, locked!.customerId));
    const contact = locked!.contact as { name?: string | null; email: string };
    const lines = await tx.select().from(schema.quoteLineItems).where(eq(schema.quoteLineItems.quoteVersionId, version.id)).orderBy(asc(schema.quoteLineItems.position));
    const fees = { designMinor: version.designMinor, deliveryMinor: version.deliveryMinor, installationMinor: version.installationMinor, otherMinor: version.otherMinor };
    const totals = quoteTotals(lines, fees, { vatRateBps: version.vatRateBps, vatOnDelivery: version.vatOnDelivery });

    const [order] = await tx
      .insert(schema.orders)
      .values({
        number: await nextNumber(tx, "order_number_seq", "HP-", actor.now),
        quoteVersionId: version.id,
        customerId: locked!.customerId,
        ownerUserId: owner.userId ?? customer?.userId ?? null,
        ownerDeviceHash: owner.device,
        // The organization and location the quote was asked for (T10-03; TECH-03 §7: children inherit).
        organizationId: locked!.organizationId,
        locationId: locked!.locationId,
        currency: version.currency,
        goodsMinor: totals.goodsMinor + totals.feesMinor - version.deliveryMinor,
        deliveryMinor: version.deliveryMinor,
        vatMinor: version.vatMinor,
        totalMinor: version.totalMinor,
        vatRateBps: version.vatRateBps,
        contact: { name: contact.name ?? contact.email, email: contact.email },
        address: null,
        delivery: { note: version.deliveryNote, installation: version.installationNote },
        billing: null,
        placedAt: actor.now,
      })
      .onConflictDoNothing({ target: schema.orders.quoteVersionId })
      .returning();
    if (!order) return (await tx.select({ id: schema.orders.id, number: schema.orders.number }).from(schema.orders).where(eq(schema.orders.quoteVersionId, version.id)))[0]!;
    if (lines.length) {
      await tx.insert(schema.orderItems).values(
        lines.map((line, index) => {
          const vat = (line.totalMinor * BigInt(version.vatRateBps) + 5_000n) / 10_000n;
          return {
            orderId: order.id,
            position: index + 1,
            // Each line made from a design keeps that design (a cart request has several).
            configurationId: line.source === "CONFIGURATION" ? (locked!.configurationIds.includes(line.sourceKey ?? "") ? line.sourceKey : locked!.configurationId) : null,
            productName: line.title,
            summary: line.summary,
            quantity: line.quantity,
            goodsMinor: line.totalMinor,
            vatMinor: vat,
            totalMinor: line.totalMinor + vat,
            leadDays: null,
            snapshot: { schema: "quote-line/v1", quoteReference: locked!.reference, version: version.number, line: { ...line, unitMinor: line.unitMinor.toString(), totalMinor: line.totalMinor.toString() } },
          };
        }),
      );
    }

    await createProofsForOrder(tx, order.id);
    const [schedule] = await tx.insert(schema.paymentSchedules).values({ quoteVersionId: version.id, currency: version.currency, totalMinor: version.totalMinor }).returning();
    const dueNow = (trigger: string) => trigger === "ON_ACCEPTANCE" || trigger === "BEFORE_PRODUCTION";
    const parts = await tx
      .insert(schema.installments)
      .values(
        payments.payments.map((payment, index) => ({
          scheduleId: schedule!.id,
          position: index + 1,
          label: payment.label,
          amountMinor: payment.amountMinor,
          currency: version.currency,
          trigger: payment.trigger,
          dueOn: payment.dueDate,
          status: dueNow(payment.trigger) ? ("DUE" as const) : ("NOT_DUE" as const),
        })),
      )
      .returning();
    // With no deposit to pay, items are queued as soon as their proofs allow (T07-01).
    await releaseReadyItems(tx, order.id);
    // A dated payment gets its reminder now, for its date (TECH-02 §8: deadlines get their own job).
    for (const part of parts) {
      if (part.trigger === "ON_DATE" && part.dueOn) {
        const at = new Date(`${part.dueOn}T08:00:00+01:00`);
        const seconds = Math.max(1, Math.ceil((at.getTime() - actor.now.getTime()) / 1000));
        await deps.jobs.send("reminder.send", { v: 1, requestId: actor.requestId, kind: "INSTALLMENT_DUE", recordId: part.id }, { tx, startAfterSeconds: seconds });
      }
    }

    const due = parts.filter((part) => part.status === "DUE");
    const link = await createGuestLink(tx, deps.webOrigin, { purpose: "ORDER", targetType: "ORDER", targetId: order.id, customerId: locked!.customerId, now: actor.now });
    await queueEmail(deps, tx, {
      template: "quote_accepted",
      to: contact.email,
      customerId: locked!.customerId,
      data: {
        reference: locked!.reference,
        version: version.number,
        orderNumber: order.number,
        total: displayMoney(version.totalMinor, version.currency),
        dueNow: due.map((part) => `${part.label}: ${displayMoney(part.amountMinor, version.currency)}`),
        url: link.url,
      },
      record: { type: "ORDER", id: order.id, label: order.number },
      linkLabel: `Opens order ${order.number}`,
      requestId: actor.requestId,
    });
    await recordAudit(tx, actor, {
      action: "quote.accepted",
      summary: `${locked!.reference} V${version.number} accepted; order ${order.number}`,
      recordType: "QUOTE",
      recordId: id,
      recordLabel: locked!.reference,
      after: { version: version.number, orderNumber: order.number, totalMinor: version.totalMinor.toString() },
    });
    return { id: order.id, number: order.number };
  });
}

/** Request changes or ask a question (QUOTE-FR-003–004, OPS-FR-034). A change request moves a READY quote to REVISION_REQUESTED. */
export async function requestQuoteChange(db: Database, access: QuoteAccess, id: string, input: { kind: "CHANGE" | "QUESTION"; lineId?: string | null; changeType?: string | null; note: string; fileIds?: string[] }) {
  const quote = await loadCustomerQuote(db, access, id);
  if (quote.status === "ACCEPTED" || quote.status === "DECLINED") throw new AppError("RULE_FAILED", { message: `This quote was ${quote.status.toLowerCase()}. Contact us about any changes.`, context: { reason: "QUOTE_CLOSED" } });
  const [current] = await db.select().from(schema.quoteVersions).where(and(eq(schema.quoteVersions.quoteId, id), eq(schema.quoteVersions.status, "SENT")));
  if (input.lineId) {
    const [line] = current ? await db.select({ id: schema.quoteLineItems.id }).from(schema.quoteLineItems).where(and(eq(schema.quoteLineItems.id, input.lineId), eq(schema.quoteLineItems.quoteVersionId, current.id))) : [];
    if (!line) throw new AppError("VALIDATION_FAILED", { fieldErrors: { lineId: "Choose a line from this quote." } });
  }
  const { actor } = access;
  await db.transaction(async (tx) => {
    await tx.insert(schema.quoteChangeRequests).values({
      quoteId: id,
      quoteVersionId: current?.id ?? null,
      kind: input.kind,
      lineId: input.lineId ?? null,
      changeType: input.changeType ?? null,
      note: input.note,
      fileIds: input.fileIds ?? [],
      customerId: actor.type === "guest" ? actor.guest.customerId : quote.customerId,
    });
    if (input.kind === "CHANGE") {
      await tx.update(schema.quotes).set({ status: "REVISION_REQUESTED", version: sql`${schema.quotes.version} + 1`, updatedAt: new Date() }).where(and(eq(schema.quotes.id, id), eq(schema.quotes.status, "READY")));
    }
    await recordAudit(tx, actor, { action: input.kind === "CHANGE" ? "quote.changes_requested" : "quote.question_asked", summary: `${input.kind === "CHANGE" ? "Changes requested" : "Question asked"} on ${quote.reference}`, recordType: "QUOTE", recordId: id, recordLabel: quote.reference });
  });
  return getCustomerQuote(db, access, id);
}

/** Decline (QUOTE-FR-003): the quote and its sent version become DECLINED; the reason is kept. */
export async function declineQuote(db: Database, access: QuoteAccess, id: string, reason: string | undefined) {
  const quote = await loadCustomerQuote(db, access, id);
  if (quote.status !== "READY" && quote.status !== "REVISION_REQUESTED") throw new AppError("RULE_FAILED", { message: "This quote can't be declined now.", context: { reason: "NOT_READY" } });
  await db.transaction(async (tx) => {
    const [current] = await tx.select().from(schema.quoteVersions).where(and(eq(schema.quoteVersions.quoteId, id), eq(schema.quoteVersions.status, "SENT")));
    if (current) await tx.update(schema.quoteVersions).set({ status: "DECLINED", updatedAt: new Date() }).where(eq(schema.quoteVersions.id, current.id));
    await tx.update(schema.quotes).set({ status: "DECLINED", version: sql`${schema.quotes.version} + 1`, updatedAt: new Date() }).where(eq(schema.quotes.id, id));
    await tx.insert(schema.quoteChangeRequests).values({ quoteId: id, quoteVersionId: current?.id ?? null, kind: "DECLINE", note: reason ?? "", customerId: quote.customerId });
    await recordAudit(tx, access.actor, { action: "quote.declined", summary: `${quote.reference} declined`, recordType: "QUOTE", recordId: id, recordLabel: quote.reference });
  });
  return getCustomerQuote(db, access, id);
}

/** "Request updated quote" (QUOTE-FR-006): an expired quote goes back to PENDING_REVIEW, keeping the project and history. */
export async function requestUpdatedQuote(db: Database, access: QuoteAccess, id: string) {
  const quote = await loadCustomerQuote(db, access, id);
  if (quote.status !== "EXPIRED") throw new AppError("RULE_FAILED", { message: "Only an expired quote can be renewed.", context: { reason: "NOT_EXPIRED" } });
  await db.transaction(async (tx) => {
    await tx.update(schema.quotes).set({ status: "PENDING_REVIEW", version: sql`${schema.quotes.version} + 1`, updatedAt: new Date() }).where(and(eq(schema.quotes.id, id), eq(schema.quotes.status, "EXPIRED")));
    await tx.insert(schema.quoteChangeRequests).values({ quoteId: id, kind: "UPDATE", note: "Updated quote requested", customerId: quote.customerId });
    await recordAudit(tx, access.actor, { action: "quote.update_requested", summary: `Updated quote requested for ${quote.reference}`, recordType: "QUOTE", recordId: id, recordLabel: quote.reference });
  });
  return getCustomerQuote(db, access, id);
}

/* ------------------------------------------------------------------ */
/* Paying installments (PAY-FR-001–004)                                */
/* ------------------------------------------------------------------ */

/** The schedule of an order made from a quote: total, paid, remaining, next and each payment (PAY-FR-003). */
export async function paymentSummaryForOrder(db: Database | Tx, order: { quoteVersionId: string | null }): Promise<PaymentSummary | null> {
  if (!order.quoteVersionId) return null;
  const [schedule] = await db.select().from(schema.paymentSchedules).where(eq(schema.paymentSchedules.quoteVersionId, order.quoteVersionId));
  if (!schedule) return null;
  const parts = await db.select().from(schema.installments).where(eq(schema.installments.scheduleId, schedule.id)).orderBy(asc(schema.installments.position));
  const live = parts.filter((part) => part.status !== "CANCELLED");
  const next = live.find((part) => part.status !== "PAID") ?? null;
  const paid = live.filter((part) => part.status === "PAID").reduce((sum, part) => sum + part.amountMinor, 0n);
  const view = (part: (typeof parts)[number]) => ({
    id: part.id,
    position: part.position,
    label: part.label,
    amountMinor: part.amountMinor.toString(),
    trigger: part.trigger as "ON_ACCEPTANCE" | "BEFORE_PRODUCTION" | "BEFORE_DISPATCH" | "ON_DATE",
    dueOn: part.dueOn,
    status: part.status,
    paidAt: part.paidAt?.toISOString() ?? null,
    payable: part.id === next?.id && part.status !== "PROCESSING",
  });
  return {
    currency: schedule.currency as "NGN" | "USD",
    totalMinor: schedule.totalMinor.toString(),
    paidMinor: paid.toString(),
    remainingMinor: (schedule.totalMinor - paid).toString(),
    next: next ? view(next) : null,
    installments: parts.map(view),
  };
}

/**
 * Pay an installment (PAY-FR-001–004, TECH-05 §5). Only the next unpaid one;
 * paying early is allowed. One intent per installment, made on the first
 * press; the rest is the same attempt flow as checkout.
 */
export async function payInstallment(deps: PaymentDeps, actor: ActorContext, order: typeof schema.orders.$inferSelect, installmentId: string) {
  const settings = await paymentSettings(deps.db);
  const off = paymentsBlocker(deps.gateway, settings);
  if (off) throw new AppError("RULE_FAILED", { message: off.message, context: { reason: off.code } });
  const summary = await paymentSummaryForOrder(deps.db, order);
  const part = summary?.installments.find((item) => item.id === installmentId);
  if (!summary || !part) throw new AppError("NOT_FOUND");
  if (part.status === "PAID") throw new AppError("CONFLICT", { message: "This payment is already made.", context: { reason: "ALREADY_PAID" } });
  if (summary.next?.id !== part.id) throw new AppError("RULE_FAILED", { message: `Pay the ${summary.next?.label.toLowerCase() ?? "earlier payment"} first.`, context: { reason: "NOT_NEXT" } });
  const contact = order.contact as { email: string };
  return beginAttempt(deps, actor, {
    email: contact.email,
    callbackUrl: `${deps.webOrigin}/orders/${order.id}?paid=${part.id}`,
    metadata: { orderId: order.id, installmentId: part.id },
    prepare: async (tx) => {
      const [locked] = await tx.select().from(schema.installments).where(eq(schema.installments.id, part.id)).for("update");
      const [existing] = await tx.select().from(schema.paymentIntents).where(eq(schema.paymentIntents.installmentId, part.id));
      if (existing) return existing;
      if (locked!.status === "NOT_DUE") await tx.update(schema.installments).set({ status: "DUE" }).where(eq(schema.installments.id, part.id));
      const [intent] = await tx.insert(schema.paymentIntents).values({ installmentId: part.id, amountMinor: locked!.amountMinor, currency: locked!.currency }).returning();
      return intent!;
    },
  });
}

/** reminder.send INSTALLMENT_DUE: a dated payment falls due; the customer is reminded unless it's paid. */
export async function sendInstallmentDueReminder(deps: OrderEmailDeps, installmentId: string, requestId: string, now = new Date()): Promise<"sent" | "skipped"> {
  return deps.db.transaction(async (tx) => {
    const [row] = await tx
      .select({ part: schema.installments, order: schema.orders })
      .from(schema.installments)
      .innerJoin(schema.paymentSchedules, eq(schema.paymentSchedules.id, schema.installments.scheduleId))
      .innerJoin(schema.orders, eq(schema.orders.quoteVersionId, schema.paymentSchedules.quoteVersionId))
      .where(eq(schema.installments.id, installmentId));
    if (!row || row.part.status === "PAID" || row.part.status === "CANCELLED" || row.part.status === "PROCESSING") return "skipped";
    if (row.part.status === "NOT_DUE") await tx.update(schema.installments).set({ status: "DUE" }).where(eq(schema.installments.id, installmentId));
    const contact = row.order.contact as { email: string };
    const link = await createGuestLink(tx, deps.webOrigin, { purpose: "ORDER", targetType: "ORDER", targetId: row.order.id, customerId: row.order.customerId, now });
    await queueEmail(deps, tx, {
      template: "payment_due",
      to: contact.email,
      customerId: row.order.customerId,
      data: { orderNumber: row.order.number, label: row.part.label, amount: displayMoney(row.part.amountMinor, row.part.currency), dueOn: row.part.dueOn ? day(new Date(`${row.part.dueOn}T12:00:00Z`)) : day(now), url: link.url },
      record: { type: "ORDER", id: row.order.id, label: row.order.number },
      linkLabel: `Opens order ${row.order.number}`,
      requestId,
    });
    return "sent";
  });
}
