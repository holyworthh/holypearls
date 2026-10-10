import { type CollectionDashboard, type CollectionStatus, GARMENT_SIZES, type ParticipantAnswers } from "@holypearls/contracts";
import { and, type Database, eq, inArray, schema, type Transaction } from "@holypearls/db";
import { AppError } from "../errors.js";
import type { ActorContext } from "../identity/actor.js";
import { createGuestLink } from "../identity/customers.js";
import type { OrganizationDeps } from "../organizations/team.js";
import { recordAudit } from "../platform/audit.js";
import { queueEmail } from "../platform/notifications.js";
import { canSee, changeable, loadCollection } from "./collections.js";
import { requireMember } from "../organizations/members.js";

/*
 * The organizer's dashboard (T12-03; PRD-05 B2B-FR-053–055; Pen 30, 74, 133,
 * 134). Progress, the issues to fix, live size and delivery counts, the
 * participants, reminders and corrections; then close, review (fix or
 * exclude) and reopen. Closing never starts production. A removed
 * participant leaves the totals but stays in the list and history; there are
 * no participant payments to resolve (owner decision 2026-10-10).
 */

type Db = Database | Transaction;
type CollectionRow = typeof schema.groupCollections.$inferSelect;
type ParticipantRow = typeof schema.participants.$inferSelect;
const REVIEWING: readonly CollectionStatus[] = ["CLOSED", "NEEDS_REVIEW", "READY_TO_ORDER"];

export const answersOf = (value: unknown): ParticipantAnswers => ({ size: null, sizeUnsure: false, personalization: null, quantity: null, colour: null, branchLocationId: null, ...(value as Partial<ParticipantAnswers>) });
export const inOrder = (participant: ParticipantRow) => participant.status !== "REMOVED" && !participant.excludedAt;
const day = (date: Date) => date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Lagos" });

export async function rows(db: Db, collectionId: string) {
  const participants = await db.select().from(schema.participants).where(eq(schema.participants.collectionId, collectionId)).orderBy(schema.participants.name);
  const submissions = participants.length ? await db.select().from(schema.participantSubmissions).where(inArray(schema.participantSubmissions.participantId, participants.map((row) => row.id))) : [];
  return participants.map((participant) => {
    const submission = submissions.find((row) => row.participantId === participant.id);
    return { participant, answers: answersOf(submission?.answers), submittedAt: submission?.submittedAt ?? null };
  });
}

type Issue = CollectionDashboard["issues"][number];

/** What still stops the order, for the people in it (Pen 30 issues; 133 NEEDS_REVIEW). */
function issuesOf(collection: CollectionRow, list: Awaited<ReturnType<typeof rows>>): Issue[] {
  const fields = collection.fields as string[];
  return list
    .filter(({ participant }) => inOrder(participant))
    .flatMap(({ participant, answers }): Issue[] => {
      if (participant.status === "NEEDS_CORRECTION") return [{ participantId: participant.id, name: participant.name, kind: "NEEDS_CORRECTION", message: "Asked to correct their answers" }];
      if (participant.status !== "SUBMITTED") return [{ participantId: participant.id, name: participant.name, kind: "NOT_SUBMITTED", message: participant.status === "NOT_STARTED" ? "Hasn't started" : "Hasn't sent their answers" }];
      if (fields.includes("SIZE") && answers.sizeUnsure && !answers.size) return [{ participantId: participant.id, name: participant.name, kind: "SIZE_TO_CONFIRM", message: "Size to confirm" }];
      return [];
    });
}

/** After closing and after every fix during review: NEEDS_REVIEW while anything stops the order, otherwise READY_TO_ORDER (B2B-FR-054). */
async function review(tx: Transaction, actor: ActorContext, collection: CollectionRow) {
  if (!REVIEWING.includes(collection.status)) return collection.status;
  const next: CollectionStatus = issuesOf(collection, await rows(tx, collection.id)).length ? "NEEDS_REVIEW" : "READY_TO_ORDER";
  if (next !== collection.status) {
    await tx.update(schema.groupCollections).set({ status: next, version: collection.version + 1, updatedAt: actor.now }).where(eq(schema.groupCollections.id, collection.id));
    await recordAudit(tx, actor, { action: `collection.${next === "READY_TO_ORDER" ? "ready" : "needs_review"}`, summary: `Group collection ${next === "READY_TO_ORDER" ? "ready to order" : "needs review"}: ${collection.title}`, recordType: "GROUP_COLLECTION", recordId: collection.id, before: { status: collection.status }, after: { status: next } });
  }
  return next;
}

export async function collectionDashboard(db: Database, actor: ActorContext, organizationId: string, collectionId: string): Promise<CollectionDashboard> {
  const member = await requireMember(db, actor, organizationId);
  const collection = await loadCollection(db, organizationId, collectionId);
  if (!canSee(member, collection)) throw new AppError("NOT_FOUND");
  const list = await rows(db, collection.id);
  const locations = await db.select({ id: schema.locations.id, name: schema.locations.name }).from(schema.locations).where(eq(schema.locations.organizationId, organizationId));
  const counted = list.filter(({ participant }) => inOrder(participant) && participant.status === "SUBMITTED");
  const quantityOf = (answers: ParticipantAnswers) => answers.quantity ?? 1;
  const sizes = GARMENT_SIZES.map((size) => ({ size, count: counted.filter(({ answers }) => answers.size === size).reduce((sum, { answers }) => sum + quantityOf(answers), 0) })).filter((item) => item.count > 0);
  const delivery =
    collection.deliveryMode === "CENTRAL"
      ? [{ name: locations.find((location) => location.id === collection.centralLocationId)?.name ?? "Central", count: counted.reduce((sum, { answers }) => sum + quantityOf(answers), 0) }]
      : collection.branchLocationIds.map((id) => ({ name: locations.find((location) => location.id === id)?.name ?? "", count: counted.filter(({ answers }) => answers.branchLocationId === id).reduce((sum, { answers }) => sum + quantityOf(answers), 0) }));
  const active = list.filter(({ participant }) => participant.status !== "REMOVED");
  return {
    progress: {
      total: active.length,
      submitted: active.filter(({ participant }) => participant.status === "SUBMITTED").length,
      incomplete: active.filter(({ participant }) => participant.status === "IN_PROGRESS" || participant.status === "NEEDS_CORRECTION").length,
      notStarted: active.filter(({ participant }) => participant.status === "NOT_STARTED").length,
      removed: list.length - active.length,
      excluded: active.filter(({ participant }) => participant.excludedAt).length,
    },
    issues: issuesOf(collection, list),
    sizes,
    sizesToConfirm: counted.filter(({ answers }) => answers.sizeUnsure && !answers.size).length,
    withNames: counted.filter(({ answers }) => answers.personalization).length,
    pieces: counted.reduce((sum, { answers }) => sum + quantityOf(answers), 0),
    delivery,
    participants: list.map(({ participant, answers, submittedAt }) => ({
      id: participant.id,
      name: participant.name,
      email: participant.email,
      status: participant.status,
      size: answers.size,
      sizeUnsure: answers.sizeUnsure,
      personalization: answers.personalization,
      quantity: quantityOf(answers),
      colour: answers.colour,
      branchName: answers.branchLocationId ? (locations.find((location) => location.id === answers.branchLocationId)?.name ?? null) : null,
      excluded: Boolean(participant.excludedAt),
      origin: participant.origin,
      submittedAt: submittedAt?.toISOString() ?? null,
      removedAt: participant.removedAt?.toISOString() ?? null,
      version: participant.version,
    })),
    lastRemindedAt: collection.lastRemindedAt?.toISOString() ?? null,
    closedAt: collection.closedAt?.toISOString() ?? null,
  };
}

/** A fresh personal link for a participant, for reminders and corrections (their first one is stored hashed). */
async function freshLink(deps: OrganizationDeps, tx: Transaction, actor: ActorContext, participant: ParticipantRow) {
  return createGuestLink(tx, deps.webOrigin, { purpose: "COLLECTION_SUBMISSION", targetType: "PARTICIPANT", targetId: participant.id, customerId: participant.customerId, now: actor.now });
}

async function participantFor(tx: Transaction, collectionId: string, participantId: string, version: number) {
  const [participant] = await tx.select().from(schema.participants).where(and(eq(schema.participants.id, participantId), eq(schema.participants.collectionId, collectionId))).for("update");
  if (!participant) throw new AppError("NOT_FOUND");
  if (participant.version !== version) throw new AppError("VERSION_CONFLICT", { context: { currentVersion: participant.version } });
  return participant;
}

const refuse = (reason: string, message: string) => new AppError("RULE_FAILED", { message, context: { reason } });

type ParticipantAction = { kind: "correction"; note: string } | { kind: "settle-size"; size: string } | { kind: "exclude" } | { kind: "include" } | { kind: "remove" };

/**
 * The organizer acts on one participant (Pen 30, 76 B, 133, 134):
 * - correction: while open, asks them to fix something (NEEDS_CORRECTION) and emails them their link;
 * - settle-size: confirms a "not sure" size;
 * - exclude / include: during review, leaves a row out of the order or puts it back;
 * - remove: takes them out of the totals for good; they stay in the list and history.
 */
export async function actOnParticipant(deps: OrganizationDeps, actor: ActorContext, organizationId: string, collectionId: string, participantId: string, action: ParticipantAction, version: number) {
  const db = deps.db;
  const { member } = await changeable(db, actor, organizationId, collectionId);
  await db.transaction(async (tx) => {
    const collection = await loadCollection(tx, organizationId, collectionId, { lock: true });
    const participant = await participantFor(tx, collectionId, participantId, version);
    if (participant.status === "REMOVED") throw refuse("REMOVED", "This person was removed.");
    const [submission] = await tx.select().from(schema.participantSubmissions).where(eq(schema.participantSubmissions.participantId, participantId));
    const answers = answersOf(submission?.answers);
    const audit = (what: string, after: Record<string, unknown>) =>
      recordAudit(tx, actor, { action: `collection.participant_${what}`, summary: `${participant.name}: ${what.replace(/_/g, " ")} (${collection.title})`, recordType: "GROUP_COLLECTION", recordId: collectionId, after: { participantId, ...after } });
    const bump = { version: participant.version + 1, updatedAt: actor.now };
    switch (action.kind) {
      case "correction": {
        if (collection.status !== "OPEN") throw refuse("NOT_OPEN", "Corrections can be asked for while the collection is open.");
        if (participant.status !== "SUBMITTED") throw refuse("NOT_SUBMITTED", "They haven't sent their answers yet.");
        await tx.update(schema.participantSubmissions).set({ correction: action.note, updatedAt: actor.now }).where(eq(schema.participantSubmissions.participantId, participantId));
        await tx.update(schema.participants).set({ status: "NEEDS_CORRECTION", ...bump }).where(eq(schema.participants.id, participantId));
        const link = await freshLink(deps, tx, actor, participant);
        await queueEmail(deps, tx, {
          template: "guest_link",
          to: participant.email,
          customerId: participant.customerId,
          data: { url: link.url, what: `answers for ${collection.title} (please fix 1 thing)` },
          record: { type: "PARTICIPANT", id: participant.id, label: collection.title },
          linkLabel: "Opens your answers to correct them",
          requestId: actor.requestId,
        });
        await audit("correction_requested", { note: action.note });
        break;
      }
      case "settle-size": {
        if (!(GARMENT_SIZES as readonly string[]).includes(action.size)) throw new AppError("VALIDATION_FAILED", { fieldErrors: { size: "Choose one of the sizes." } });
        if (!(collection.fields as string[]).includes("SIZE")) throw refuse("NO_SIZES", "This collection doesn't ask for sizes.");
        if (!["OPEN", "PAUSED", "CLOSED", "NEEDS_REVIEW", "READY_TO_ORDER"].includes(collection.status)) throw refuse("WRONG_STATUS", "This collection can't change now.");
        await tx.update(schema.participantSubmissions).set({ answers: { ...answers, size: action.size, sizeUnsure: false }, updatedAt: actor.now }).where(eq(schema.participantSubmissions.participantId, participantId));
        await tx.update(schema.participants).set(bump).where(eq(schema.participants.id, participantId));
        await audit("size_settled", { size: action.size });
        break;
      }
      case "exclude":
      case "include": {
        if (!REVIEWING.includes(collection.status)) throw refuse("NOT_REVIEWING", "Rows are left out during review, after the collection closes.");
        await tx.update(schema.participants).set({ excludedAt: action.kind === "exclude" ? actor.now : null, ...bump }).where(eq(schema.participants.id, participantId));
        await audit(action.kind === "exclude" ? "excluded" : "included", {});
        break;
      }
      case "remove": {
        if (collection.status === "ORDER_DRAFT_CREATED" || collection.status === "CANCELLED") throw refuse("WRONG_STATUS", "Reopen the collection before removing people.");
        await tx.update(schema.participants).set({ status: "REMOVED", removedAt: actor.now, removedByUserId: member.userId, ...bump }).where(eq(schema.participants.id, participantId));
        // Their link stops working: a removed participant sees nothing (B2B-FR-061).
        await tx.update(schema.guestLinks).set({ revokedAt: actor.now }).where(and(eq(schema.guestLinks.targetType, "PARTICIPANT"), eq(schema.guestLinks.targetId, participantId)));
        await audit("removed", { status: participant.status });
        break;
      }
    }
    await review(tx, actor, await loadCollection(tx, organizationId, collectionId));
  });
  return collectionDashboard(db, actor, organizationId, collectionId);
}

/** "Remind N people" (Pen 30): everyone in the order who hasn't sent, each with a fresh link. */
export async function remindParticipants(deps: OrganizationDeps, actor: ActorContext, organizationId: string, collectionId: string) {
  const db = deps.db;
  await changeable(db, actor, organizationId, collectionId);
  const collection = await loadCollection(db, organizationId, collectionId);
  if (collection.status !== "OPEN") throw refuse("NOT_OPEN", "Reminders go out while the collection is open.");
  const waiting = (await rows(db, collectionId)).filter(({ participant }) => inOrder(participant) && participant.status !== "SUBMITTED");
  await db.transaction(async (tx) => {
    for (const { participant } of waiting) {
      const link = await freshLink(deps, tx, actor, participant);
      await queueEmail(deps, tx, {
        template: "guest_link",
        to: participant.email,
        customerId: participant.customerId,
        data: { url: link.url, what: `answers for ${collection.title}${collection.deadline ? ` (closes ${day(collection.deadline)})` : ""}` },
        record: { type: "PARTICIPANT", id: participant.id, label: collection.title },
        linkLabel: "Opens your answers for the group collection",
        requestId: actor.requestId,
      });
    }
    await tx.update(schema.groupCollections).set({ lastRemindedAt: actor.now }).where(eq(schema.groupCollections.id, collectionId));
    await recordAudit(tx, actor, { action: "collection.reminded", summary: `Reminded ${waiting.length} people: ${collection.title}`, recordType: "GROUP_COLLECTION", recordId: collectionId, after: { count: waiting.length } });
  });
  return { reminded: waiting.length };
}

/**
 * Close (Pen 133 "Close now? Closing doesn't start production."): OPEN or
 * PAUSED → CLOSED, then straight into review. Reopen (B2B-FR-055): before an
 * Order Draft exists, back to OPEN with a new deadline.
 */
export async function closeOrReopen(deps: OrganizationDeps, actor: ActorContext, organizationId: string, collectionId: string, action: { kind: "close"; version: number } | { kind: "reopen"; deadline: string; version: number }) {
  const db = deps.db;
  await changeable(db, actor, organizationId, collectionId);
  if (action.kind === "reopen" && new Date(action.deadline) <= actor.now) throw new AppError("VALIDATION_FAILED", { fieldErrors: { deadline: "Choose a deadline in the future." } });
  await db.transaction(async (tx) => {
    const collection = await loadCollection(tx, organizationId, collectionId, { lock: true });
    if (collection.version !== action.version) throw new AppError("VERSION_CONFLICT", { context: { currentVersion: collection.version } });
    if (action.kind === "close") {
      if (collection.status !== "OPEN" && collection.status !== "PAUSED") throw refuse("WRONG_STATUS", "Only an open or paused collection can be closed.");
      await tx.update(schema.groupCollections).set({ status: "CLOSED", closedAt: actor.now, version: collection.version + 1, updatedAt: actor.now }).where(eq(schema.groupCollections.id, collectionId));
      await recordAudit(tx, actor, { action: "collection.closed", summary: `Group collection closed: ${collection.title}`, recordType: "GROUP_COLLECTION", recordId: collectionId, before: { status: collection.status }, after: { status: "CLOSED" } });
      await review(tx, actor, await loadCollection(tx, organizationId, collectionId));
    } else {
      if (!REVIEWING.includes(collection.status) && collection.status !== "ORDER_DRAFT_CREATED") throw refuse("WRONG_STATUS", "Only a closed collection can be reopened.");
      // An Order Draft becomes STALE and must be made again after closing (B2B-FR-055); a sent one can't be reopened this way.
      const stale = await staleDraftsForReopen(tx, actor, collectionId);
      await tx.update(schema.groupCollections).set({ status: "OPEN", deadline: new Date(action.deadline), closedAt: null, version: collection.version + 1, updatedAt: actor.now }).where(eq(schema.groupCollections.id, collectionId));
      await recordAudit(tx, actor, { action: "collection.reopened", summary: `Group collection reopened: ${collection.title}`, recordType: "GROUP_COLLECTION", recordId: collectionId, before: { status: collection.status }, after: { status: "OPEN", deadline: action.deadline, staleDrafts: stale } });
    }
  });
  return collectionDashboard(db, actor, organizationId, collectionId);
}

/** Reopening (B2B-FR-055): an unsubmitted draft becomes STALE; a submitted one means changes go through a change request. */
export async function staleDraftsForReopen(tx: Transaction, actor: ActorContext, collectionId: string) {
  const drafts = await tx.select().from(schema.orderDrafts).where(and(eq(schema.orderDrafts.collectionId, collectionId), inArray(schema.orderDrafts.status, ["CURRENT", "SUBMITTED"])));
  if (drafts.some((draft) => draft.status === "SUBMITTED")) {
    throw new AppError("RULE_FAILED", { message: "This Order Draft was sent. Changes go through a change request and may need a new quote and re-approval.", context: { reason: "DRAFT_SUBMITTED" } });
  }
  for (const draft of drafts) {
    await tx.update(schema.orderDrafts).set({ status: "STALE", version: draft.version + 1, updatedAt: actor.now }).where(eq(schema.orderDrafts.id, draft.id));
  }
  return drafts.length;
}
