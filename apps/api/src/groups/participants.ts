import { GARMENT_SIZES, type ParticipantAnswers, type ParticipantField, type Participation } from "@holypearls/contracts";
import { type Database, eq, schema, type Transaction } from "@holypearls/db";
import { productOptions } from "../configuration/pricing.js";
import { AppError } from "../errors.js";
import type { ActorContext } from "../identity/actor.js";
import { createGuestLink, ensureGuestCustomer, sha256, startGuestSession } from "../identity/customers.js";
import type { OrganizationDeps } from "../organizations/team.js";
import { queueEmail } from "../platform/notifications.js";
import { inviteView } from "./collections.js";

/*
 * The participant flow (T12-01b; PRD-05 B2B-FR-060–064; Pen 31, 76). No
 * account: a participant joins from the share link with their name and email,
 * gets a guest session for their own submission only (and a personal link by
 * email to come back), and answers only the fields the organizer allowed.
 * Nobody sees anyone else's answers. The organization pays, so there are no
 * payment screens (owner decision 2026-10-10).
 */

type Db = Database | Transaction;
type CollectionRow = typeof schema.groupCollections.$inferSelect;
type ParticipantRow = typeof schema.participants.$inferSelect;
const PARTICIPANT_TARGET = "PARTICIPANT";

const longDay = (date: Date) => date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Lagos" });

/** Open and before its deadline: answers can be given or changed. */
function accepting(collection: CollectionRow, now: Date) {
  if (collection.status === "PAUSED") throw new AppError("RULE_FAILED", { message: "This collection is paused. Try again later.", context: { reason: "COLLECTION_PAUSED" } });
  if (collection.status !== "OPEN" || (collection.deadline && collection.deadline <= now)) {
    throw new AppError("RULE_FAILED", { message: "This collection has closed. If you still need one, ask your organiser.", context: { reason: "COLLECTION_CLOSED" } });
  }
}

/** Join from the share link (B2B-FR-060): a new participant, a guest session for them alone, and their personal link by email. */
export async function joinCollection(deps: OrganizationDeps, actor: ActorContext, input: { secret: string; name: string; email: string }) {
  const db = deps.db;
  const [collection] = await db.select().from(schema.groupCollections).where(eq(schema.groupCollections.shareSecretHash, sha256(input.secret)));
  if (!collection || collection.status === "DRAFT" || collection.status === "CANCELLED") throw new AppError("NOT_FOUND");
  accepting(collection, actor.now);
  return db.transaction(async (tx) => {
    const customer = await ensureGuestCustomer(tx, { email: input.email, name: input.name });
    const [participant] = await tx
      .insert(schema.participants)
      .values({ collectionId: collection.id, customerId: customer.id, userId: actor.type === "user" ? actor.session.userId : null, name: input.name, email: input.email.trim(), status: "IN_PROGRESS" })
      .returning();
    await tx.insert(schema.participantSubmissions).values({ participantId: participant!.id, answers: {} });
    const link = await createGuestLink(tx, deps.webOrigin, { purpose: "COLLECTION_SUBMISSION", targetType: PARTICIPANT_TARGET, targetId: participant!.id, customerId: customer.id, now: actor.now });
    await queueEmail(deps, tx, {
      template: "guest_link",
      to: input.email,
      customerId: customer.id,
      data: { url: link.url, what: `answers for ${collection.title}` },
      record: { type: "PARTICIPANT", id: participant!.id, label: collection.title },
      linkLabel: "Opens your answers for the group collection",
      requestId: actor.requestId,
    });
    const [row] = await tx.select().from(schema.guestLinks).where(eq(schema.guestLinks.id, link.id));
    const session = await startGuestSession(tx, row!, actor.now);
    return { participantId: participant!.id, session };
  });
}

/** Only the participant themselves: their guest session, or their account if they joined signed in (B2B-FR-061). */
async function loadOwn(db: Db, actor: ActorContext, participantId: string, options: { lock?: boolean } = {}) {
  const query = db.select().from(schema.participants).where(eq(schema.participants.id, participantId));
  const [participant] = options.lock ? await query.for("update") : await query;
  const own =
    participant &&
    ((actor.type === "guest" && actor.guest.targetType === PARTICIPANT_TARGET && actor.guest.targetId === participant.id) || (actor.type === "user" && participant.userId === actor.session.userId));
  if (!own || participant.status === "REMOVED") throw new AppError("NOT_FOUND");
  const [collection] = await db.select().from(schema.groupCollections).where(eq(schema.groupCollections.id, participant.collectionId));
  if (!collection || collection.status === "CANCELLED") throw new AppError("NOT_FOUND");
  return { participant, collection };
}

async function colourChoices(db: Db, collection: CollectionRow) {
  if (!(collection.fields as string[]).includes("COLOUR")) return [];
  const [source] = await db.select({ productId: schema.configurations.productId }).from(schema.configurations).where(eq(schema.configurations.id, collection.sourceConfigurationId));
  const options = source ? await productOptions(db as Database, source.productId) : [];
  const colour = options.find((option) => /^colou?r$/.test(option.key));
  return colour ? colour.values.map((value) => ({ value: value.key, label: value.label })) : [];
}

async function participationView(db: Db, participant: ParticipantRow, collection: CollectionRow, now: Date): Promise<Participation> {
  const [submission] = await db.select().from(schema.participantSubmissions).where(eq(schema.participantSubmissions.participantId, participant.id));
  const fields = collection.fields as ParticipantField[];
  const answers = { size: null, sizeUnsure: false, personalization: null, quantity: null, colour: null, branchLocationId: null, ...(submission?.answers as Partial<ParticipantAnswers>) };
  return {
    participantId: participant.id,
    name: participant.name,
    status: participant.status,
    answers,
    correction: participant.status === "NEEDS_CORRECTION" ? (submission?.correction ?? null) : null,
    collection: await inviteView(db, collection, now),
    sizes: fields.includes("SIZE") ? [...GARMENT_SIZES] : [],
    colours: await colourChoices(db, collection),
    canEdit: collection.status === "OPEN" && (!collection.deadline || collection.deadline > now),
    version: participant.version,
  };
}

export async function getParticipation(db: Database, actor: ActorContext, participantId: string): Promise<Participation> {
  const { participant, collection } = await loadOwn(db, actor, participantId);
  return participationView(db, participant, collection, actor.now);
}

/**
 * Answers are checked against the organizer's choices (B2B-FR-052, 062–063):
 * a field the collection doesn't ask for can't be answered, sizes come from
 * the list, "not sure" only when allowed, and a branch only from the approved
 * ones. There is nothing about payment or a home address.
 */
async function checkAnswers(db: Db, collection: CollectionRow, answers: ParticipantAnswers) {
  const fields = collection.fields as ParticipantField[];
  const refuse = (field: string, message: string) => {
    throw new AppError("VALIDATION_FAILED", { fieldErrors: { [`answers.${field}`]: message } });
  };
  if (!fields.includes("SIZE") && (answers.size || answers.sizeUnsure)) refuse("size", "This collection doesn't ask for a size.");
  if (!fields.includes("PERSONALIZATION") && answers.personalization) refuse("personalization", "This collection doesn't ask for a name.");
  if (!fields.includes("QUANTITY") && answers.quantity !== null && answers.quantity !== 1) refuse("quantity", "This collection is one each.");
  if (!fields.includes("COLOUR") && answers.colour) refuse("colour", "This collection doesn't ask for a colour.");
  if (collection.deliveryMode !== "BRANCHES" && answers.branchLocationId) refuse("branchLocationId", "Everything is delivered together; there's no branch to choose.");
  if (answers.size && !(GARMENT_SIZES as readonly string[]).includes(answers.size)) refuse("size", "Choose one of the sizes.");
  if (answers.sizeUnsure && collection.unsureSizeRule !== "ALLOW_UNSURE") refuse("size", "Your organiser needs a size.");
  if (answers.colour && !(await colourChoices(db, collection)).some((choice) => choice.value === answers.colour)) refuse("colour", "Choose one of the colours.");
  if (answers.branchLocationId && !collection.branchLocationIds.includes(answers.branchLocationId)) refuse("branchLocationId", "Choose one of the branches.");
}

export async function saveParticipation(db: Database, actor: ActorContext, participantId: string, input: { answers: ParticipantAnswers; version: number }): Promise<Participation> {
  const current = await loadOwn(db, actor, participantId);
  accepting(current.collection, actor.now);
  await checkAnswers(db, current.collection, input.answers);
  await db.transaction(async (tx) => {
    const { participant } = await loadOwn(tx, actor, participantId, { lock: true });
    if (participant.version !== input.version) throw new AppError("VERSION_CONFLICT", { context: { currentVersion: participant.version } });
    await tx.update(schema.participantSubmissions).set({ answers: input.answers, updatedAt: actor.now }).where(eq(schema.participantSubmissions.participantId, participantId));
    await tx
      .update(schema.participants)
      .set({ status: participant.status === "NOT_STARTED" ? "IN_PROGRESS" : participant.status, version: participant.version + 1, updatedAt: actor.now })
      .where(eq(schema.participants.id, participantId));
  });
  return getParticipation(db, actor, participantId);
}

/** "Send my response" (frame 31): everything the collection needs is there; the participant gets a copy. */
export async function submitParticipation(deps: OrganizationDeps, actor: ActorContext, participantId: string, version: number): Promise<Participation> {
  const db = deps.db;
  const { collection } = await loadOwn(db, actor, participantId);
  accepting(collection, actor.now);
  const [organization] = await db.select({ name: schema.organizations.name }).from(schema.organizations).where(eq(schema.organizations.id, collection.organizationId));
  const branches = collection.branchLocationIds.length ? await db.select({ id: schema.locations.id, name: schema.locations.name }).from(schema.locations).where(eq(schema.locations.organizationId, collection.organizationId)) : [];
  await db.transaction(async (tx) => {
    const { participant } = await loadOwn(tx, actor, participantId, { lock: true });
    if (participant.version !== version) throw new AppError("VERSION_CONFLICT", { context: { currentVersion: participant.version } });
    const [submission] = await tx.select().from(schema.participantSubmissions).where(eq(schema.participantSubmissions.participantId, participantId));
    const answers = submission!.answers as ParticipantAnswers;
    const fields = collection.fields as ParticipantField[];
    const missing: Record<string, string> = {};
    if (fields.includes("SIZE") && !answers.size && !answers.sizeUnsure) missing["answers.size"] = "Choose your size.";
    if (fields.includes("COLOUR") && !answers.colour) missing["answers.colour"] = "Choose a colour.";
    if (collection.deliveryMode === "BRANCHES" && !answers.branchLocationId) missing["answers.branchLocationId"] = "Choose your branch.";
    if (Object.keys(missing).length) throw new AppError("VALIDATION_FAILED", { fieldErrors: missing });
    await tx.update(schema.participantSubmissions).set({ submittedAt: actor.now, correction: null, updatedAt: actor.now }).where(eq(schema.participantSubmissions.participantId, participantId));
    await tx.update(schema.participants).set({ status: "SUBMITTED", version: participant.version + 1, updatedAt: actor.now }).where(eq(schema.participants.id, participantId));
    const summary = [
      ...(fields.includes("SIZE") ? [`Size: ${answers.sizeUnsure ? "not sure yet, your organiser will confirm it" : answers.size}`] : []),
      ...(fields.includes("PERSONALIZATION") ? [`Name: ${answers.personalization || "no name, just the logo"}`] : []),
      ...(fields.includes("QUANTITY") ? [`Quantity: ${answers.quantity ?? 1}`] : []),
      ...(answers.branchLocationId ? [`Branch: ${branches.find((branch) => branch.id === answers.branchLocationId)?.name ?? ""}`] : []),
    ];
    await queueEmail(deps, tx, {
      template: "collection_submitted",
      to: participant.email,
      customerId: participant.customerId,
      data: { collection: collection.title, organization: organization?.name ?? "", summary, deadline: collection.deadline ? longDay(collection.deadline) : undefined },
      record: { type: "PARTICIPANT", id: participant.id, label: collection.title },
      requestId: actor.requestId,
    });
  });
  return getParticipation(db, actor, participantId);
}
