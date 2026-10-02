import type { AdminProof, CustomerProof, ProofDetails, ProofVersion } from "@holypearls/contracts";
import { and, asc, type Database, desc, eq, inArray, schema, sql } from "@holypearls/db";
import { AppError } from "../errors.js";
import type { ActorContext } from "../identity/actor.js";
import { createGuestLink, customerForActor, requireRecentEmailCode } from "../identity/customers.js";
import { loadOrderFor, type OrderAccess, type OrderEmailDeps } from "../orders/orders.js";
import { recordAudit } from "../platform/audit.js";
import { releaseForFile, releaseReadyItems } from "../production/production.js";
import { queueEmail } from "../platform/notifications.js";

/*
 * Proofs (T06-01; FUL-FR-001–004, 006, OPS-FR-050–051, TECH-01 §4, TECH-04
 * §10). One proof per order item, made with the order; whether it's needed
 * comes from the product rule. Staff publish permanent versions; the customer
 * approves (tick + email code) or asks for changes. Approval never moves the
 * item into production: it queues the item once its other prerequisites are
 * met too (T07-01).
 */

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type ProofRow = typeof schema.proofs.$inferSelect;
type VersionRow = typeof schema.proofVersions.$inferSelect;

const EMPTY_DETAILS: ProofDetails = { placement: "", dimensions: "", colourReference: "", quantity: "", notes: "" };
const ACKNOWLEDGEMENT = "I have reviewed the artwork, spelling, placement and specifications shown.";

/**
 * Makes the proofs for a new order's items, from each product's rule
 * (OPS-FR-018). An exact reorder skips the proof only where the rule allows
 * it (FUL-FR-061); a reorder with changes needs one as usual. Safe to repeat.
 */
export async function createProofsForOrder(tx: Tx | Database, orderId: string) {
  const items = await tx
    .select({ id: schema.orderItems.id, rule: schema.productRules.proof, exactReorder: schema.configurations.reorderExact, skippable: schema.productRules.proofSkippableOnReorder })
    .from(schema.orderItems)
    .leftJoin(schema.configurations, eq(schema.configurations.id, schema.orderItems.configurationId))
    .leftJoin(schema.productRules, eq(schema.productRules.productId, schema.configurations.productId))
    .where(eq(schema.orderItems.orderId, orderId));
  if (!items.length) return;
  await tx
    .insert(schema.proofs)
    .values(
      items.map((item) => {
        const skip = item.rule === "NOT_REQUIRED" || (item.exactReorder === true && item.skippable === true);
        return { orderItemId: item.id, requirement: item.exactReorder && item.skippable ? "SKIPPED_ON_REORDER" : (item.rule ?? "REQUIRED"), status: skip ? ("NOT_REQUIRED" as const) : ("PREPARING" as const) };
      }),
    )
    .onConflictDoNothing({ target: schema.proofs.orderItemId });
}

/* ------------------------------------------------------------------ */
/* Views                                                               */
/* ------------------------------------------------------------------ */

async function versionViews(db: Database | Tx, versions: VersionRow[], includeComments: boolean): Promise<ProofVersion[]> {
  if (!versions.length) return [];
  const ids = versions.map((version) => version.id);
  const fileIds = versions.flatMap((version) => (version.views as { fileId: string }[]).map((view) => view.fileId));
  const [files, renditions, decisions, comments, staff] = await Promise.all([
    fileIds.length ? db.select().from(schema.files).where(inArray(schema.files.id, fileIds)) : Promise.resolve([]),
    fileIds.length ? db.select({ fileId: schema.fileRenditions.fileId, kind: schema.fileRenditions.kind }).from(schema.fileRenditions).where(inArray(schema.fileRenditions.fileId, fileIds)) : Promise.resolve([]),
    db.select().from(schema.proofDecisions).where(inArray(schema.proofDecisions.proofVersionId, ids)),
    includeComments
      ? db
          .select({ comment: schema.proofComments, staffName: schema.staffProfiles.displayName, customerName: schema.customers.name })
          .from(schema.proofComments)
          .leftJoin(schema.staffProfiles, eq(schema.staffProfiles.id, schema.proofComments.staffProfileId))
          .leftJoin(schema.customers, eq(schema.customers.id, schema.proofComments.customerId))
          .where(inArray(schema.proofComments.proofVersionId, ids))
          .orderBy(asc(schema.proofComments.createdAt))
      : Promise.resolve([]),
    db.select({ id: schema.staffProfiles.id, name: schema.staffProfiles.displayName }).from(schema.staffProfiles),
  ]);
  return versions.map((version) => {
    const decision = decisions.find((item) => item.proofVersionId === version.id);
    return {
      id: version.id,
      number: version.number,
      status: version.status,
      views: (version.views as { label: string; fileId: string }[]).map((view) => {
        const file = files.find((item) => item.id === view.fileId);
        return { ...view, fileName: file?.safeName ?? "File", fileStatus: file?.status ?? "MISSING", pages: renditions.filter((item) => item.fileId === view.fileId && item.kind === "PAGE").length || 1 };
      }),
      details: { ...EMPTY_DETAILS, ...(version.details as Partial<ProofDetails>) },
      publishedAt: version.publishedAt?.toISOString() ?? null,
      publishedBy: version.publishedByStaffId ? (staff.find((item) => item.id === version.publishedByStaffId)?.name ?? "HolyPearls studio") : null,
      decision: decision ? { decision: decision.decision, by: decision.decidedBy, at: decision.createdAt.toISOString(), note: decision.note } : null,
      comments: comments
        .filter(({ comment }) => comment.proofVersionId === version.id)
        .map(({ comment, customerName }) => ({
          id: comment.id,
          kind: comment.kind,
          author: comment.staffProfileId ? "HolyPearls proofing" : (customerName ?? "You"),
          fromStaff: Boolean(comment.staffProfileId),
          body: comment.body,
          createdAt: comment.createdAt.toISOString(),
          pin: comment.pinX !== null && comment.pinY !== null ? { x: Number(comment.pinX), y: Number(comment.pinY), view: comment.pinView ?? 0, number: comment.pinNumber ?? 0 } : null,
          parentId: comment.parentId,
        })),
      version: version.version,
    };
  });
}

async function itemOf(db: Database | Tx, proof: ProofRow) {
  const [item] = await db.select().from(schema.orderItems).where(eq(schema.orderItems.id, proof.orderItemId));
  const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, item!.orderId));
  const [count] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.orderItems).where(eq(schema.orderItems.orderId, order!.id));
  return { item: item!, order: order!, of: count?.n ?? 1 };
}

/* ------------------------------------------------------------------ */
/* Customer (Pen 26, 49, 50)                                           */
/* ------------------------------------------------------------------ */

/** The proof, if the person can open its order (account, browser or link); anyone else gets 404. */
async function loadCustomerProof(db: Database, access: OrderAccess, orderId: string, proofId: string) {
  const order = await loadOrderFor(db, access, orderId);
  const [proof] = await db
    .select({ proof: schema.proofs })
    .from(schema.proofs)
    .innerJoin(schema.orderItems, eq(schema.orderItems.id, schema.proofs.orderItemId))
    .where(and(eq(schema.proofs.id, proofId), eq(schema.orderItems.orderId, order.id)));
  if (!proof) throw new AppError("NOT_FOUND");
  return proof.proof;
}

export async function getCustomerProof(db: Database, access: OrderAccess, orderId: string, proofId: string): Promise<CustomerProof> {
  const proof = await loadCustomerProof(db, access, orderId, proofId);
  const { item, order, of } = await itemOf(db, proof);
  const versions = await db
    .select()
    .from(schema.proofVersions)
    .where(and(eq(schema.proofVersions.proofId, proof.id), inArray(schema.proofVersions.status, ["PUBLISHED", "APPROVED", "CHANGES_REQUESTED", "SUPERSEDED"])))
    .orderBy(desc(schema.proofVersions.number));
  const views = await versionViews(db, versions, true);
  const current = views[0] ?? null;
  return {
    id: proof.id,
    status: proof.status,
    order: { id: order.id, number: order.number },
    item: { position: item.position, of, name: item.productName, quantity: item.quantity, summary: item.summary },
    current: current ? (({ version: _v, ...rest }) => (void _v, rest))(current) : null,
    history: views.map(({ version: _v, comments: _c, ...rest }) => (void _v, void _c, rest)),
    canDecide: proof.status === "AWAITING_APPROVAL" && current?.status === "PUBLISHED",
  };
}

async function decidable(tx: Tx, proofId: string, versionNumber: number) {
  const [proof] = await tx.select().from(schema.proofs).where(eq(schema.proofs.id, proofId)).for("update");
  const [version] = await tx.select().from(schema.proofVersions).where(and(eq(schema.proofVersions.proofId, proofId), eq(schema.proofVersions.number, versionNumber)));
  if (!proof || !version) throw new AppError("NOT_FOUND");
  return { proof, version };
}

const deciderName = async (db: Database | Tx, actor: ActorContext) => {
  const customer = await customerForActor(db as Database, actor);
  return { customer, name: customer?.name || customer?.email || "Customer" };
};

/**
 * Approve for production (FUL-FR-003–004): the customer ticked the
 * acknowledgement and checked an email code recently. The version becomes
 * APPROVED and locks the artwork used for production (OPS-FR-053). Pressing
 * twice returns the same result; an old version can't be approved.
 */
export async function approveProof(db: Database, access: OrderAccess, orderId: string, proofId: string, versionNumber: number) {
  const { actor } = access;
  await loadCustomerProof(db, access, orderId, proofId);
  if (actor.type === "anonymous") throw new AppError("RULE_FAILED", { message: "Open this proof from the link in your email to approve it.", context: { reason: "OPEN_FROM_EMAIL" } });
  await requireRecentEmailCode(db, actor);
  await db.transaction(async (tx) => {
    const { proof, version } = await decidable(tx, proofId, versionNumber);
    if (version.status === "APPROVED") return;
    if (proof.status !== "AWAITING_APPROVAL" || version.status !== "PUBLISHED") {
      throw new AppError("RULE_FAILED", { message: "This version can't be approved. Open the latest proof.", context: { reason: "NOT_CURRENT_VERSION" } });
    }
    const { customer, name } = await deciderName(tx, actor);
    await tx.insert(schema.proofDecisions).values({
      proofVersionId: version.id,
      decision: "APPROVED",
      customerId: customer?.id ?? null,
      actorType: actor.type === "user" ? "USER" : "GUEST",
      decidedBy: name,
      acknowledgement: ACKNOWLEDGEMENT,
      emailVerifiedAt: actor.type === "guest" ? actor.guest.emailVerifiedAt : actor.now,
    });
    await tx.update(schema.proofVersions).set({ status: "APPROVED", updatedAt: new Date() }).where(eq(schema.proofVersions.id, version.id));
    await tx.update(schema.proofs).set({ status: "APPROVED", version: sql`${schema.proofs.version} + 1`, updatedAt: new Date() }).where(eq(schema.proofs.id, proofId));
    // Approval can be the last prerequisite: the item is queued in this transaction (T07-01).
    const [owner] = await tx.select({ orderId: schema.orderItems.orderId }).from(schema.orderItems).where(eq(schema.orderItems.id, proof.orderItemId));
    await releaseReadyItems(tx, owner!.orderId);
    await recordAudit(tx, actor, { action: "proof.approved", summary: `Proof V${version.number} approved for production`, recordType: "PROOF", recordId: proofId, after: { version: version.number } });
  });
  return getCustomerProof(db, access, orderId, proofId);
}

/** Request changes (FUL-FR-003): the version becomes CHANGES_REQUESTED with the note; staff prepare the next one. */
export async function requestProofChanges(db: Database, access: OrderAccess, orderId: string, proofId: string, input: { versionNumber: number; note: string }) {
  const { actor } = access;
  await loadCustomerProof(db, access, orderId, proofId);
  await db.transaction(async (tx) => {
    const { proof, version } = await decidable(tx, proofId, input.versionNumber);
    if (proof.status !== "AWAITING_APPROVAL" || version.status !== "PUBLISHED") {
      throw new AppError("RULE_FAILED", { message: "This version can't be changed now. Open the latest proof.", context: { reason: "NOT_CURRENT_VERSION" } });
    }
    const { customer, name } = await deciderName(tx, actor);
    await tx.insert(schema.proofDecisions).values({ proofVersionId: version.id, decision: "CHANGES_REQUESTED", customerId: customer?.id ?? null, actorType: actor.type === "user" ? "USER" : "GUEST", decidedBy: name, note: input.note });
    await tx.insert(schema.proofComments).values({ proofVersionId: version.id, kind: "CHANGE_REQUEST", body: input.note, customerId: customer?.id ?? null });
    await tx.update(schema.proofVersions).set({ status: "CHANGES_REQUESTED", updatedAt: new Date() }).where(eq(schema.proofVersions.id, version.id));
    await tx.update(schema.proofs).set({ status: "CHANGES_REQUESTED", version: sql`${schema.proofs.version} + 1`, updatedAt: new Date() }).where(eq(schema.proofs.id, proofId));
    await recordAudit(tx, actor, { action: "proof.changes_requested", summary: `Changes requested on proof V${version.number}`, recordType: "PROOF", recordId: proofId });
  });
  return getCustomerProof(db, access, orderId, proofId);
}

/** Ask a question (FUL-FR-003): a comment on the version; the proof stays undecided. */
export async function askProofQuestion(db: Database, access: OrderAccess, orderId: string, proofId: string, input: { versionNumber: number; body: string }) {
  await loadCustomerProof(db, access, orderId, proofId);
  const [version] = await db.select().from(schema.proofVersions).where(and(eq(schema.proofVersions.proofId, proofId), eq(schema.proofVersions.number, input.versionNumber)));
  if (!version || version.status === "DRAFT") throw new AppError("NOT_FOUND");
  const customer = await customerForActor(db, access.actor);
  await db.insert(schema.proofComments).values({ proofVersionId: version.id, kind: "QUESTION", body: input.body, customerId: customer?.id ?? null });
  return getCustomerProof(db, access, orderId, proofId);
}

/**
 * A comment on the whole proof, or a pin (FUL-FR-005, TECH-04 §11): pins are
 * relative positions (0–1) on a view, numbered per version so the meaning is
 * in the text list too. Only on the current version; older ones are read-only.
 */
export async function addProofComment(db: Database, access: OrderAccess, orderId: string, proofId: string, input: { versionNumber: number; body: string; pin?: { x: number; y: number; view: number } | null }) {
  await loadCustomerProof(db, access, orderId, proofId);
  const [latest] = await db
    .select()
    .from(schema.proofVersions)
    .where(and(eq(schema.proofVersions.proofId, proofId), inArray(schema.proofVersions.status, ["PUBLISHED", "APPROVED", "CHANGES_REQUESTED", "SUPERSEDED"])))
    .orderBy(desc(schema.proofVersions.number))
    .limit(1);
  if (!latest) throw new AppError("NOT_FOUND");
  if (latest.number !== input.versionNumber) throw new AppError("RULE_FAILED", { message: `These comments belong to V${input.versionNumber}, which was replaced. Comment on V${latest.number}.`, context: { reason: "OLDER_VERSION" } });
  const customer = await customerForActor(db, access.actor);
  await db.transaction(async (tx) => {
    let pinNumber: number | null = null;
    if (input.pin) {
      await tx.select({ id: schema.proofVersions.id }).from(schema.proofVersions).where(eq(schema.proofVersions.id, latest.id)).for("update");
      const [count] = await tx.select({ n: sql<number>`coalesce(max(${schema.proofComments.pinNumber}), 0)::int` }).from(schema.proofComments).where(eq(schema.proofComments.proofVersionId, latest.id));
      pinNumber = (count?.n ?? 0) + 1;
    }
    await tx.insert(schema.proofComments).values({
      proofVersionId: latest.id,
      kind: "COMMENT",
      body: input.body,
      customerId: customer?.id ?? null,
      pinX: input.pin ? input.pin.x.toFixed(5) : null,
      pinY: input.pin ? input.pin.y.toFixed(5) : null,
      pinView: input.pin?.view ?? null,
      pinNumber,
    });
  });
  return getCustomerProof(db, access, orderId, proofId);
}

/** The proofs on an order, for the order page. */
export async function proofsForOrder(db: Database | Tx, orderId: string) {
  const rows = await db
    .select({ id: schema.proofs.id, status: schema.proofs.status, position: schema.orderItems.position, latest: sql<number | null>`(select max(number) from proof_versions pv where pv.proof_id = ${schema.proofs.id} and pv.status <> 'DRAFT')` })
    .from(schema.proofs)
    .innerJoin(schema.orderItems, eq(schema.orderItems.id, schema.proofs.orderItemId))
    .where(eq(schema.orderItems.orderId, orderId))
    .orderBy(asc(schema.orderItems.position));
  return rows.map((row) => ({ id: row.id, itemPosition: row.position, status: row.status, versionNumber: row.latest }));
}

/* ------------------------------------------------------------------ */
/* Staff (Pen 112; PROOF_MANAGE)                                       */
/* ------------------------------------------------------------------ */

const OPEN_STATUSES = ["PREPARING", "CHANGES_REQUESTED", "REVISION_IN_PROGRESS", "AWAITING_APPROVAL"] as const;

/** Proofs to prepare and files needing review (OPS-FR-050). Oldest first, 100 at most. */
export async function proofQueue(db: Database, view: string | undefined) {
  const statuses = view === "approved" ? (["APPROVED"] as const) : OPEN_STATUSES;
  const proofs = await db
    .select({ proof: schema.proofs, item: schema.orderItems, order: { id: schema.orders.id, number: schema.orders.number } })
    .from(schema.proofs)
    .innerJoin(schema.orderItems, eq(schema.orderItems.id, schema.proofs.orderItemId))
    .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
    .where(inArray(schema.proofs.status, [...statuses]))
    .orderBy(asc(schema.proofs.updatedAt))
    .limit(100);
  const latest = proofs.length
    ? await db
        .select({ proofId: schema.proofVersions.proofId, number: sql<number>`max(${schema.proofVersions.number})::int` })
        .from(schema.proofVersions)
        .where(inArray(schema.proofVersions.proofId, proofs.map(({ proof }) => proof.id)))
        .groupBy(schema.proofVersions.proofId)
    : [];
  const files = await db
    .select()
    .from(schema.files)
    .where(and(inArray(schema.files.status, ["NEEDS_REVIEW", "PROCESSING"]), inArray(schema.files.purpose, ["ARTWORK", "PROJECT_ATTACHMENT", "PROOF"])))
    .orderBy(asc(schema.files.createdAt))
    .limit(100);
  return {
    proofs: proofs.map(({ proof, item, order }) => ({
      id: proof.id,
      status: proof.status,
      orderId: order.id,
      orderNumber: order.number,
      itemPosition: item.position,
      itemName: item.productName,
      quantity: item.quantity,
      latestVersion: latest.find((row) => row.proofId === proof.id)?.number ?? null,
      updatedAt: proof.updatedAt.toISOString(),
    })),
    files: files.map((file) => ({ id: file.id, name: file.safeName, status: file.status, purpose: file.purpose, owner: file.ownerType ? `${file.ownerType.toLowerCase()}` : "not attached", reason: file.reason, uploadedAt: file.createdAt.toISOString() })),
  };
}

export async function getAdminProof(db: Database, id: string): Promise<AdminProof> {
  const [proof] = await db.select().from(schema.proofs).where(eq(schema.proofs.id, id));
  if (!proof) throw new AppError("NOT_FOUND");
  const { item, order } = await itemOf(db, proof);
  const versions = await db.select().from(schema.proofVersions).where(eq(schema.proofVersions.proofId, id)).orderBy(desc(schema.proofVersions.number));
  const sourceFiles = item.configurationId
    ? await db
        .select({ id: schema.files.id, name: schema.files.safeName, status: schema.files.status })
        .from(schema.configurationFiles)
        .innerJoin(schema.files, eq(schema.files.id, schema.configurationFiles.fileId))
        .where(eq(schema.configurationFiles.configurationId, item.configurationId))
    : [];
  return {
    id: proof.id,
    status: proof.status,
    required: proof.requirement as AdminProof["required"],
    order: { id: order.id, number: order.number },
    item: { position: item.position, name: item.productName, quantity: item.quantity, summary: item.summary, status: item.status },
    customerFiles: sourceFiles,
    versions: await versionViews(db, versions, true),
  };
}

const staffId = (actor: ActorContext) => (actor.type === "user" ? (actor.staff?.staffProfileId ?? null) : null);

/** New version: copies the latest version's views and details into a DRAFT (OPS-FR-051). One draft at a time. */
export async function createProofDraft(db: Database, actor: ActorContext, id: string) {
  await db.transaction(async (tx) => {
    const [proof] = await tx.select().from(schema.proofs).where(eq(schema.proofs.id, id)).for("update");
    if (!proof) throw new AppError("NOT_FOUND");
    if (proof.status === "NOT_REQUIRED" || proof.status === "APPROVED") throw new AppError("CONFLICT", { message: proof.status === "APPROVED" ? "This proof is approved. Changes after approval go through a change request." : "This item doesn't need a proof.", context: { reason: proof.status } });
    const versions = await tx.select().from(schema.proofVersions).where(eq(schema.proofVersions.proofId, id)).orderBy(desc(schema.proofVersions.number));
    if (versions.some((version) => version.status === "DRAFT")) return;
    const latest = versions[0];
    await tx.insert(schema.proofVersions).values({ proofId: id, number: (latest?.number ?? 0) + 1, views: latest?.views ?? [], details: latest?.details ?? EMPTY_DETAILS, createdByStaffId: staffId(actor) });
    if (proof.status === "CHANGES_REQUESTED") await tx.update(schema.proofs).set({ status: "REVISION_IN_PROGRESS", version: sql`${schema.proofs.version} + 1`, updatedAt: new Date() }).where(eq(schema.proofs.id, id));
  });
  return getAdminProof(db, id);
}

async function lockDraft(tx: Tx, id: string, expected: number) {
  const [draft] = await tx.select().from(schema.proofVersions).where(and(eq(schema.proofVersions.proofId, id), eq(schema.proofVersions.status, "DRAFT"))).for("update");
  if (!draft) throw new AppError("CONFLICT", { message: "There's no draft to change. Published versions can't change.", context: { reason: "NO_DRAFT" } });
  if (draft.version !== expected) throw new AppError("VERSION_CONFLICT", { context: { latest: (await versionViews(tx, [draft], false))[0] } });
  return draft;
}

/** Saves the draft's views and production details. Files must be proof files uploaded by staff. */
export async function saveProofDraft(db: Database, actor: ActorContext, id: string, input: { version: number; views: { label: string; fileId: string }[]; details: ProofDetails }) {
  if (input.views.length) {
    const files = await db.select({ id: schema.files.id, purpose: schema.files.purpose }).from(schema.files).where(inArray(schema.files.id, input.views.map((view) => view.fileId)));
    if (files.length !== new Set(input.views.map((view) => view.fileId)).size || files.some((file) => file.purpose !== "PROOF")) {
      throw new AppError("VALIDATION_FAILED", { fieldErrors: { views: "Upload proof files here (SVG, PDF, AI or PNG)." } });
    }
  }
  await db.transaction(async (tx) => {
    const draft = await lockDraft(tx, id, input.version);
    await tx.update(schema.proofVersions).set({ views: input.views, details: input.details, version: sql`${schema.proofVersions.version} + 1`, updatedAt: new Date() }).where(eq(schema.proofVersions.id, draft.id));
    for (const view of input.views) {
      await tx.update(schema.files).set({ ownerType: "PROOF_VERSION", ownerId: draft.id, attachedAt: new Date() }).where(and(eq(schema.files.id, view.fileId), sql`${schema.files.ownerId} is null`));
    }
    void actor;
  });
  return getAdminProof(db, id);
}

/**
 * Publish (OPS-FR-051): the draft becomes PUBLISHED and can never change; an
 * earlier version still waiting is SUPERSEDED; the proof is
 * AWAITING_APPROVAL; the customer gets the proof's link. Audited.
 */
export async function publishProof(deps: OrderEmailDeps, actor: ActorContext, id: string, expected: number) {
  await deps.db.transaction(async (tx) => {
    const [proof] = await tx.select().from(schema.proofs).where(eq(schema.proofs.id, id)).for("update");
    if (!proof) throw new AppError("NOT_FOUND");
    const draft = await lockDraft(tx, id, expected);
    const views = draft.views as { fileId: string }[];
    if (!views.length) throw new AppError("VALIDATION_FAILED", { fieldErrors: { views: "Add at least one view with its file before publishing." } });
    const files = await tx.select({ status: schema.files.status, name: schema.files.safeName }).from(schema.files).where(inArray(schema.files.id, views.map((view) => view.fileId)));
    const notReady = files.find((file) => file.status !== "READY");
    if (notReady) throw new AppError("RULE_FAILED", { message: `${notReady.name} isn't ready yet (${notReady.status}). Wait for it to finish checking.`, context: { reason: "FILE_NOT_READY" } });
    await tx.update(schema.proofVersions).set({ status: "SUPERSEDED", updatedAt: new Date() }).where(and(eq(schema.proofVersions.proofId, id), eq(schema.proofVersions.status, "PUBLISHED")));
    await tx.update(schema.proofVersions).set({ status: "PUBLISHED", publishedAt: actor.now, publishedByStaffId: staffId(actor), updatedAt: new Date() }).where(eq(schema.proofVersions.id, draft.id));
    await tx.update(schema.proofs).set({ status: "AWAITING_APPROVAL", version: sql`${schema.proofs.version} + 1`, updatedAt: new Date() }).where(eq(schema.proofs.id, id));
    const { item, order } = await itemOf(tx, proof);
    const contact = order.contact as { email: string; name?: string };
    // The order's link: the order page lists each item's proof (the proof lives under its order).
    const link = await createGuestLink(tx, deps.webOrigin, { purpose: "ORDER", targetType: "ORDER", targetId: order.id, customerId: order.customerId, now: actor.now });
    await queueEmail(deps, tx, {
      template: "proof_ready",
      to: contact.email,
      customerId: order.customerId,
      data: { orderNumber: order.number, item: item.productName, version: draft.number, url: link.url },
      record: { type: "ORDER", id: order.id, label: `${order.number} proof V${draft.number}` },
      linkLabel: `Opens order ${order.number}`,
      requestId: actor.requestId,
    });
    await recordAudit(tx, actor, { action: "proof.published", summary: `Published proof V${draft.number} for ${order.number} item ${item.position}`, recordType: "PROOF", recordId: id, recordLabel: order.number, permission: "PROOF_MANAGE" });
  });
  return getAdminProof(deps.db, id);
}

/** Staff reply on a version, optionally to one comment or pin (OPS-FR-052). Replies never change the proof status. */
export async function replyToProof(db: Database, actor: ActorContext, id: string, input: { versionNumber: number; body: string; parentId?: string | null }) {
  const [version] = await db.select().from(schema.proofVersions).where(and(eq(schema.proofVersions.proofId, id), eq(schema.proofVersions.number, input.versionNumber)));
  if (!version) throw new AppError("NOT_FOUND");
  if (input.parentId) {
    const [parent] = await db.select({ id: schema.proofComments.id }).from(schema.proofComments).where(and(eq(schema.proofComments.id, input.parentId), eq(schema.proofComments.proofVersionId, version.id)));
    if (!parent) throw new AppError("VALIDATION_FAILED", { fieldErrors: { parentId: "Reply to a comment on this version." } });
  }
  await db.insert(schema.proofComments).values({ proofVersionId: version.id, kind: "REPLY", body: input.body, staffProfileId: staffId(actor), parentId: input.parentId ?? null });
  return getAdminProof(db, id);
}

/** Artwork review (OPS-FR-050): staff mark a file READY or REJECTED (a note is required to reject). Audited. */
export async function decideFile(db: Database, actor: ActorContext, fileId: string, input: { decision: "READY" | "REJECTED"; note?: string }) {
  if (input.decision === "REJECTED" && !input.note) throw new AppError("VALIDATION_FAILED", { fieldErrors: { note: "Say why the file is rejected; the customer sees it." } });
  await db.transaction(async (tx) => {
    const [file] = await tx.update(schema.files).set({ status: input.decision, reason: input.note ?? null }).where(and(eq(schema.files.id, fileId), inArray(schema.files.status, ["NEEDS_REVIEW", "PROCESSING"]))).returning();
    if (!file) throw new AppError("CONFLICT", { message: "This file was already reviewed.", context: { reason: "ALREADY_REVIEWED" } });
    if (input.decision === "READY") await releaseForFile(tx, fileId);
    await recordAudit(tx, actor, { action: input.decision === "READY" ? "file.marked_ready" : "file.rejected", summary: `${file.safeName}: ${input.decision}${input.note ? ` (${input.note})` : ""}`, recordType: "FILE", recordId: fileId, recordLabel: file.safeName, permission: "PROOF_MANAGE" });
  });
  return { ok: true as const };
}
