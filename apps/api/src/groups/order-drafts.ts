import { GARMENT_SIZES, type OrderDraft, type OrderDraftOrigin, type OrderDraftState } from "@holypearls/contracts";
import { and, type Database, desc, eq, schema, type Transaction } from "@holypearls/db";
import { configurationForGroup, quotable, quoteIn } from "../configuration/drafts.js";
import { AppError } from "../errors.js";
import type { ActorContext } from "../identity/actor.js";
import { approvalCheck, createOrderRequest } from "../organizations/approvals.js";
import { requireMember } from "../organizations/members.js";
import type { OrganizationDeps } from "../organizations/team.js";
import { recordAudit } from "../platform/audit.js";
import { canSee, changeable, loadCollection } from "./collections.js";
import { inOrder, rows } from "./dashboard.js";

/*
 * The Order Draft (T12-03b; PRD-05 B2B-FR-054–055; OPS-FR-090; TECH-01 §4–5;
 * Pen 133). A reviewed collection (READY_TO_ORDER) becomes a draft: a saved
 * copy of the totals by size, personalisation and location, and of every
 * included participant's answers. Reopening the collection marks it STALE;
 * after closing again a new draft is made. Submitting turns it into one
 * design and an order request (when the organization's approval rule applies)
 * or a quote request with HolyPearls. Nothing is made until a quote is
 * accepted.
 */

type Db = Database | Transaction;
type DraftRow = typeof schema.orderDrafts.$inferSelect;

interface DraftSnapshot {
  schema: "order-draft/v1";
  pieces: number;
  sizes: { size: string; count: number }[];
  withNames: number;
  delivery: { name: string; count: number }[];
  included: { participantId: string; name: string; size: string | null; personalization: string | null; quantity: number; branch: string | null; origin: string }[];
  excluded: { participantId: string; name: string; reason: string }[];
}

async function draftView(db: Db, row: DraftRow): Promise<OrderDraft> {
  const snapshot = row.snapshot as DraftSnapshot;
  const [quote] = row.quoteId ? await db.select({ reference: schema.quotes.reference }).from(schema.quotes).where(eq(schema.quotes.id, row.quoteId)) : [];
  return {
    id: row.id,
    status: row.status,
    pieces: snapshot.pieces,
    sizes: snapshot.sizes,
    withNames: snapshot.withNames,
    delivery: snapshot.delivery,
    includedCount: snapshot.included.length,
    excludedCount: snapshot.excluded.length,
    createdAt: row.createdAt.toISOString(),
    submittedAt: row.submittedAt?.toISOString() ?? null,
    route: row.orderRequestId ? "APPROVAL" : row.quoteId ? "QUOTE" : null,
    orderRequestId: row.orderRequestId,
    quoteReference: quote?.reference ?? null,
    version: row.version,
  };
}

export async function orderDraftState(db: Database, actor: ActorContext, organizationId: string, collectionId: string): Promise<OrderDraftState> {
  const member = await requireMember(db, actor, organizationId);
  const collection = await loadCollection(db, organizationId, collectionId);
  if (!canSee(member, collection)) throw new AppError("NOT_FOUND");
  const drafts = await db.select().from(schema.orderDrafts).where(eq(schema.orderDrafts.collectionId, collectionId)).orderBy(desc(schema.orderDrafts.createdAt));
  const current = drafts.find((draft) => draft.status !== "STALE");
  return { current: current ? await draftView(db, current) : null, stale: drafts.filter((draft) => draft.status === "STALE").length };
}

/** Make the draft from a READY_TO_ORDER collection (B2B-FR-054): only the people in the order, all of whom have answered. */
export async function createOrderDraft(deps: OrganizationDeps, actor: ActorContext, organizationId: string, collectionId: string, version: number): Promise<OrderDraftState> {
  const db = deps.db;
  const { member } = await changeable(db, actor, organizationId, collectionId);
  await db.transaction(async (tx) => {
    const collection = await loadCollection(tx, organizationId, collectionId, { lock: true });
    if (collection.version !== version) throw new AppError("VERSION_CONFLICT", { context: { currentVersion: collection.version } });
    if (collection.status !== "READY_TO_ORDER") throw new AppError("RULE_FAILED", { message: "Fix or leave out the rows that need attention first.", context: { reason: "NOT_READY", status: collection.status } });
    const list = await rows(tx, collectionId);
    const locations = await tx.select({ id: schema.locations.id, name: schema.locations.name }).from(schema.locations).where(eq(schema.locations.organizationId, organizationId));
    const nameOf = (id: string | null) => (id ? (locations.find((location) => location.id === id)?.name ?? null) : null);
    const included = list
      .filter(({ participant }) => inOrder(participant) && participant.status === "SUBMITTED")
      .map(({ participant, answers }) => ({
        participantId: participant.id,
        name: participant.name,
        size: answers.size,
        personalization: answers.personalization,
        quantity: answers.quantity ?? 1,
        branch: collection.deliveryMode === "CENTRAL" ? nameOf(collection.centralLocationId) : nameOf(answers.branchLocationId),
        origin: participant.origin,
      }));
    const excluded = list.filter(({ participant }) => !inOrder(participant)).map(({ participant }) => ({ participantId: participant.id, name: participant.name, reason: participant.status === "REMOVED" ? "Removed" : "Left out during review" }));
    const deliveryNames = [...new Set(included.map((person) => person.branch ?? ""))];
    const snapshot: DraftSnapshot = {
      schema: "order-draft/v1",
      pieces: included.reduce((sum, person) => sum + person.quantity, 0),
      sizes: GARMENT_SIZES.map((size) => ({ size, count: included.filter((person) => person.size === size).reduce((sum, person) => sum + person.quantity, 0) })).filter((item) => item.count > 0),
      withNames: included.filter((person) => person.personalization).length,
      delivery: deliveryNames.map((name) => ({ name, count: included.filter((person) => (person.branch ?? "") === name).reduce((sum, person) => sum + person.quantity, 0) })),
      included,
      excluded,
    };
    const [draft] = await tx.insert(schema.orderDrafts).values({ collectionId, snapshot, createdByUserId: member.userId }).returning();
    await tx.update(schema.groupCollections).set({ status: "ORDER_DRAFT_CREATED", version: collection.version + 1, updatedAt: actor.now }).where(eq(schema.groupCollections.id, collectionId));
    await recordAudit(tx, actor, { action: "collection.order_draft_created", summary: `Order Draft made: ${snapshot.pieces} pieces (${collection.title})`, recordType: "GROUP_COLLECTION", recordId: collectionId, after: { orderDraftId: draft!.id, pieces: snapshot.pieces, excluded: excluded.length } });
  });
  return orderDraftState(db, actor, organizationId, collectionId);
}

/**
 * Submit (Pen 133 "Submitting sends an order request (or quote request) to
 * HolyPearls. Closing doesn't start production."): one design for the whole
 * group, then the organization's approval rule decides the route.
 */
export async function submitOrderDraft(deps: OrganizationDeps, actor: ActorContext, organizationId: string, collectionId: string, version: number): Promise<OrderDraftState> {
  const db = deps.db;
  if (actor.type !== "user") throw new AppError("NOT_SIGNED_IN");
  const { member, row: collection } = await changeable(db, actor, organizationId, collectionId);
  const [draft] = await db.select().from(schema.orderDrafts).where(and(eq(schema.orderDrafts.collectionId, collectionId), eq(schema.orderDrafts.status, "CURRENT")));
  if (!draft) throw new AppError("RULE_FAILED", { message: "Make the Order Draft first.", context: { reason: "NO_DRAFT" } });
  if (draft.version !== version) throw new AppError("VERSION_CONFLICT", { context: { currentVersion: draft.version } });
  const snapshot = draft.snapshot as DraftSnapshot;
  const design = await configurationForGroup(db, actor, {
    sourceConfigurationId: collection.sourceConfigurationId,
    quantity: snapshot.pieces,
    sizes: snapshot.sizes.map((item) => ({ size: item.size, quantity: item.count })),
    people: snapshot.included.flatMap((person) => Array.from({ length: person.quantity }, () => ({ name: person.personalization, size: person.size }))),
    controls: collection.templateId ? { templateId: collection.templateId, organizationId, locationId: collection.locationId, name: collection.title, editable: [] } : null,
  });
  const estimate = design.price?.totalMinor ? BigInt(design.price.totalMinor) : null;
  const approval = await approvalCheck(db, member, estimate, actor.session.name);
  const access = { actor, deviceKey: null };
  const checked = approval.needed ? null : await quotable(db, access, design.id);
  if (checked && "reference" in checked) throw new AppError("CONFLICT");
  await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(schema.orderDrafts).where(eq(schema.orderDrafts.id, draft.id)).for("update");
    if (locked!.status !== "CURRENT" || locked!.version !== version) throw new AppError("VERSION_CONFLICT", { context: { currentVersion: locked!.version } });
    let orderRequestId: string | null = null;
    let quoteId: string | null = null;
    if (approval.needed) {
      const request = await createOrderRequest(deps, tx, actor, member, {
        locationId: collection.locationId,
        title: `${collection.title} · ${snapshot.pieces} pieces`,
        designs: [design],
        estimateMinor: estimate,
        currency: design.price?.currency ?? "NGN",
        policyNote: approval.note,
        templateName: null,
      });
      orderRequestId = request.id;
    } else {
      const reference = await quoteIn(tx, deps, access, checked!, {
        email: actor.session.email,
        name: actor.session.name,
        note: `Group collection ${collection.title}: ${snapshot.pieces} pieces from ${snapshot.included.length} people.`,
        placedFor: { organizationId, locationId: collection.locationId },
      });
      const [quote] = await tx.select({ id: schema.quotes.id }).from(schema.quotes).where(eq(schema.quotes.reference, reference));
      quoteId = quote!.id;
    }
    await tx
      .update(schema.orderDrafts)
      .set({ status: "SUBMITTED", configurationId: design.id, orderRequestId, quoteId, submittedAt: actor.now, version: draft.version + 1, updatedAt: actor.now })
      .where(eq(schema.orderDrafts.id, draft.id));
    await recordAudit(tx, actor, {
      action: "collection.order_draft_submitted",
      summary: `Order Draft sent ${orderRequestId ? "for approval" : "to HolyPearls for a quote"}: ${collection.title}`,
      recordType: "GROUP_COLLECTION",
      recordId: collectionId,
      after: { orderDraftId: draft.id, configurationId: design.id, orderRequestId, quoteId },
    });
  });
  return orderDraftState(db, actor, organizationId, collectionId);
}

/** Where a draft came from, for HolyPearls staff (OPS-FR-090; Pen 133 · u3BRd). Read only: staff don't edit participants. */
export async function orderDraftOrigin(db: Database, draftId: string): Promise<OrderDraftOrigin> {
  const [found] = await db
    .select({ draft: schema.orderDrafts, title: schema.groupCollections.title, organizationName: schema.organizations.name })
    .from(schema.orderDrafts)
    .innerJoin(schema.groupCollections, eq(schema.groupCollections.id, schema.orderDrafts.collectionId))
    .innerJoin(schema.organizations, eq(schema.organizations.id, schema.groupCollections.organizationId))
    .where(eq(schema.orderDrafts.id, draftId));
  if (!found) throw new AppError("NOT_FOUND");
  const snapshot = found.draft.snapshot as DraftSnapshot;
  const imports = [...new Set(snapshot.included.map((person) => person.origin).filter((origin) => origin !== "LINK"))];
  const [quote] = found.draft.quoteId ? await db.select({ reference: schema.quotes.reference }).from(schema.quotes).where(eq(schema.quotes.id, found.draft.quoteId)) : [];
  return {
    id: found.draft.id,
    status: found.draft.status,
    collectionTitle: found.title,
    organizationName: found.organizationName,
    pieces: snapshot.pieces,
    fromLink: snapshot.included.filter((person) => person.origin === "LINK").length,
    fromImports: imports.map((origin) => ({ name: origin.replace(/^IMPORT:/, ""), count: snapshot.included.filter((person) => person.origin === origin).length })),
    excluded: snapshot.excluded.map(({ name, reason }) => ({ name, reason })),
    quoteReference: quote?.reference ?? null,
  };
}

/** The draft a quote came from, if any, so staff can open its origin from the quote. */
export async function orderDraftForQuote(db: Db, quoteId: string) {
  const [row] = await db.select({ id: schema.orderDrafts.id }).from(schema.orderDrafts).where(eq(schema.orderDrafts.quoteId, quoteId));
  return row?.id ?? null;
}

