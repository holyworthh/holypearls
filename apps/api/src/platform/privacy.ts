import type { PrivacyPerson } from "@holypearls/contracts";
import type { Database, Transaction } from "@holypearls/db";
import { AppError } from "../errors.js";
import { type ActorContext, requireRecentMfa } from "../identity/actor.js";
import { eraseIdentity, findPerson, identityForPerson, type PersonSubject, staffBlocker } from "../identity/customers.js";
import { eraseParticipants, participantsForPerson } from "../groups/participants.js";
import { eraseOrders, ordersForPerson, openOrdersBlocker, orderIdsForPerson, receiptsForPerson } from "../orders/orders.js";
import { eraseInvitations, memberBlocker } from "../organizations/team.js";
import { erasePaymentEvents, paymentAttemptsForPerson, paymentBlocker } from "../payments/payments.js";
import { eraseProjects, projectsForPerson } from "../projects/projects.js";
import { eraseQuotes, quotesForPerson } from "../quotes/customer.js";
import { eraseCheckouts, checkoutsForPerson } from "../sales/checkout.js";
import { eraseProblems, problemsForPerson } from "../shipments/problems.js";
import { eraseShipments, shipmentsForOrders } from "../shipments/shipments.js";
import { recordAudit } from "./audit.js";
import { eraseHelpRequests, helpRequestsForPerson } from "./help-requests.js";
import { eraseIdempotencyKeys } from "./idempotency.js";
import { eraseNotifications, notificationsForPerson } from "./notifications.js";

/*
 * Privacy requests (T15-03; TECH-06 §12; Pen 129). Staff look a person up by
 * email, download everything held about them, or erase and anonymize it.
 * Payment, order and tax records stay: numbers, amounts, references and
 * items are never changed, only who and where. Each module exports and
 * erases its own tables; this file only calls them in order. Export and
 * erase need EXPORT_PERSONAL_DATA and a recent MFA check (TECH-03 §8–9), and
 * both are audited without the email. The log of requests is the audit log.
 */

/** Reasons not to erase now, in the order they are shown. */
async function blockers(db: Database | Transaction, subject: PersonSubject) {
  const found = [await staffBlocker(db, subject), await memberBlocker(db, subject), await openOrdersBlocker(db, subject), await paymentBlocker(db, subject)];
  return found.filter((blocker): blocker is NonNullable<typeof blocker> => blocker !== null);
}

/** Everything held about the person, in the export's shape (TECH-06 §12). */
async function collect(db: Database, subject: PersonSubject, now: Date) {
  const orderIds = await orderIdsForPerson(db, subject);
  const identity = await identityForPerson(db, subject);
  const orders = await ordersForPerson(db, subject);
  const receipts = await receiptsForPerson(db, subject);
  const quotes = await quotesForPerson(db, subject);
  const checkouts = await checkoutsForPerson(db, subject);
  return {
    schema: "person-export/v1",
    generatedAt: now.toISOString(),
    email: subject.email,
    identity,
    sales: { checkouts, quotes: quotes.quotes, quoteChangeRequests: quotes.changeRequests, projects: await projectsForPerson(db, subject) },
    orders: { orders, receipts, shipments: await shipmentsForOrders(db, orderIds), problemReports: await problemsForPerson(db, subject) },
    payments: { attempts: await paymentAttemptsForPerson(db, subject) },
    groups: { participants: await participantsForPerson(db, subject) },
    platform: { helpRequests: await helpRequestsForPerson(db, subject), notifications: await notificationsForPerson(db, subject) },
  };
}

const NONE: PrivacyPerson = { found: false, erasedAt: null, hasAccount: false, marketingConsentAt: null, counts: { customers: 0, orders: 0, receipts: 0, quotes: 0, checkouts: 0 }, blockers: [] };

/** What the admin page shows before anything is changed. */
export async function lookupPerson(db: Database, actor: ActorContext, email: string): Promise<PrivacyPerson> {
  const subject = await findPerson(db, email);
  if (!subject) return NONE;
  const data = await collect(db, subject, actor.now);
  const customers = data.identity.customers;
  return {
    found: true,
    erasedAt: customers.length && customers.every((customer) => customer.erasedAt) ? customers[0]!.erasedAt!.toISOString() : null,
    hasAccount: !!subject.userId,
    marketingConsentAt: customers.find((customer) => customer.marketingConsentAt)?.marketingConsentAt?.toISOString() ?? null,
    counts: { customers: customers.length, orders: data.orders.orders.length, receipts: data.orders.receipts.length, quotes: data.sales.quotes.length, checkouts: data.sales.checkouts.length },
    blockers: await blockers(db, subject),
  };
}

/** A JSON copy of the person's data. Built at once: one person's data is small. The audit entry has no email. */
export async function exportPerson(db: Database, actor: ActorContext, email: string) {
  requireRecentMfa(actor);
  const subject = await findPerson(db, email);
  if (!subject) throw new AppError("NOT_FOUND", { message: "No personal data is held under this email." });
  const data = await collect(db, subject, actor.now);
  await recordAudit(db, actor, {
    action: "privacy.exported",
    summary: "Personal data exported",
    recordType: "CUSTOMER",
    recordId: subject.customerIds[0] ?? subject.userId,
    permission: "EXPORT_PERSONAL_DATA",
    after: { customers: data.identity.customers.length, orders: data.orders.orders.length, receipts: data.orders.receipts.length },
  });
  return data;
}

/** Erases and anonymizes in one transaction; erasing again finds nothing and changes nothing. */
export async function erasePerson(db: Database, actor: ActorContext, email: string): Promise<PrivacyPerson> {
  requireRecentMfa(actor);
  const subject = await findPerson(db, email);
  if (!subject) return NONE;
  return db.transaction(async (tx) => {
    const [first] = await blockers(tx, subject);
    if (first) throw new AppError("RULE_FAILED", { message: first.message, context: { reason: first.code } });
    const now = actor.now;
    await eraseCheckouts(tx, subject, now);
    await eraseQuotes(tx, subject);
    await eraseProjects(tx, subject);
    const orderIds = await orderIdsForPerson(tx, subject);
    const orders = await eraseOrders(tx, subject);
    await eraseShipments(tx, orderIds);
    await eraseProblems(tx, subject);
    await erasePaymentEvents(tx, subject);
    await eraseParticipants(tx, subject);
    await eraseInvitations(tx, subject, now);
    await eraseHelpRequests(tx, subject);
    await eraseNotifications(tx, subject);
    await eraseIdempotencyKeys(tx, subject.email);
    const customers = await eraseIdentity(tx, subject, now);
    await recordAudit(tx, actor, {
      action: "privacy.erased",
      summary: "Personal data erased and anonymized",
      recordType: "CUSTOMER",
      recordId: subject.customerIds[0] ?? subject.userId,
      permission: "EXPORT_PERSONAL_DATA",
      after: { customers, orders: orders.orders, receipts: orders.receipts },
    });
    return { ...NONE, erasedAt: now.toISOString() };
  });
}

