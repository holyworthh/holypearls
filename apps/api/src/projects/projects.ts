import {
  type AccountDraft,
  type AccountQuote,
  checkAnswers,
  type Project,
  type ProjectAnswers,
  type ProjectItem,
  type ProjectRecommendation,
  type ProjectType,
  projectAnswersSchema,
  PROJECT_TYPE_INFO,
  type PublicProductCard,
  type RuleCondition,
  type RuleQuantity,
} from "@holypearls/contracts";
import { and, asc, type Database, desc, eq, inArray, isNull, schema, sql } from "@holypearls/db";
import { cardsBySlugs } from "../catalogue/storefront.js";
import { AppError } from "../errors.js";
import { findFileForActor } from "../files/files.js";
import type { ActorContext } from "../identity/actor.js";
import { createGuestLink, customersForContact, maskEmail, sha256, startGuestSession } from "../identity/customers.js";
import { type NotificationDeps, queueEmail } from "../platform/notifications.js";
import { deadlineState, openItems, reconcile, type RuleInput, type SuggestionRow } from "./recommend.js";

/*
 * Start a Project drafts (T05-01; PROJ-FR-001–007). Owners only: the account,
 * the browser that started it (hashed device key, as configuration drafts),
 * or a guest who opened its emailed link. Anyone else gets 404 (TECH-03 §12).
 * Every change checks the version it started from (TECH-02 §5) and works the
 * suggestions out again, keeping the customer's own choices (PROJ-FR-004).
 */

type Row = typeof schema.projects.$inferSelect;
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface ProjectAccess {
  actor: ActorContext;
  deviceKey: string | null;
}

export function canOpenProject(access: ProjectAccess, row: Pick<Row, "id" | "ownerUserId" | "ownerDeviceHash">): boolean {
  const { actor, deviceKey } = access;
  if (actor.type === "user" && row.ownerUserId === actor.session.userId) return true;
  if (actor.type === "guest" && actor.guest.targetType === "PROJECT" && actor.guest.targetId === row.id) return true;
  return Boolean(deviceKey && row.ownerDeviceHash && row.ownerDeviceHash === sha256(deviceKey));
}

/** Projects a customer started as a guest join the account once its email is verified (TECH-03 §6). */
export async function linkCustomerProjects(db: Database, customerIds: string[], userId: string) {
  if (!customerIds.length) return;
  await db.update(schema.projects).set({ ownerUserId: userId }).where(and(inArray(schema.projects.customerId, customerIds), isNull(schema.projects.ownerUserId)));
}

/** The account's projects for its overview: drafts to resume, and the ones sent to HolyPearls (Pen frame 92). */
export async function accountProjects(db: Database, userId: string, limit = 10): Promise<{ drafts: AccountDraft[]; sent: AccountQuote[] }> {
  const rows = await db.select().from(schema.projects).where(eq(schema.projects.ownerUserId, userId)).orderBy(desc(schema.projects.lastActivityAt)).limit(limit);
  const counts = rows.length
    ? await db
        .select({ projectId: schema.projectItems.projectId, n: sql<number>`count(*)::int` })
        .from(schema.projectItems)
        .where(inArray(schema.projectItems.projectId, rows.map((row) => row.id)))
        .groupBy(schema.projectItems.projectId)
    : [];
  const items = new Map(counts.map((count) => [count.projectId, count.n]));
  const title = (row: Row) => row.title || PROJECT_TYPE_INFO[row.type].label;
  return {
    drafts: rows
      .filter((row) => row.status === "DRAFT")
      .map((row) => {
        const n = items.get(row.id) ?? 0;
        return { kind: "PROJECT" as const, id: row.id, title: title(row), detail: `${n} product${n === 1 ? "" : "s"}`, status: row.status, savedAt: row.lastActivityAt.toISOString(), href: `/start/${row.id}` };
      }),
    sent: rows
      .filter((row) => row.status !== "DRAFT")
      .map((row) => ({ kind: "PROJECT" as const, id: row.id, reference: row.reference ?? "", version: null, title: title(row), status: row.status, validUntil: null, href: `/start/${row.id}` })),
  };
}

export async function loadProject(db: Database | Tx, access: ProjectAccess, id: string): Promise<Row> {
  const [row] = await db.select().from(schema.projects).where(eq(schema.projects.id, id));
  if (!row || !canOpenProject(access, row)) throw new AppError("NOT_FOUND");
  return row;
}

const notDraft = () => new AppError("CONFLICT", { message: "This project has been sent to HolyPearls and can't change here.", context: { reason: "NOT_DRAFT" } });

/* ------------------------------------------------------------------ */
/* Reading                                                             */
/* ------------------------------------------------------------------ */

/** Public product cards by product id (unpublished products are left out). */
export async function cardsById(db: Database | Tx, ids: string[]): Promise<Map<string, PublicProductCard>> {
  if (!ids.length) return new Map();
  const slugs = await db.select({ id: schema.products.id, slug: schema.products.slug }).from(schema.products).where(inArray(schema.products.id, ids));
  const cards = new Map((await cardsBySlugs(db as Database, slugs.map((row) => row.slug))).map((card) => [card.slug, card]));
  return new Map(slugs.flatMap((row) => (cards.has(row.slug) ? [[row.id, cards.get(row.slug)!] as const] : [])));
}

const brief = (card: PublicProductCard | undefined) => (card ? { slug: card.slug, name: card.name, price: card.price, priceState: card.priceState, image: card.image } : null);

export async function projectView(db: Database | Tx, row: Row, now: Date): Promise<Project> {
  const [recs, items, files] = await Promise.all([
    db.select().from(schema.projectRecommendations).where(eq(schema.projectRecommendations.projectId, row.id)),
    db.select().from(schema.projectItems).where(eq(schema.projectItems.projectId, row.id)).orderBy(asc(schema.projectItems.position)),
    db
      .select({ link: schema.projectFiles, file: schema.files })
      .from(schema.projectFiles)
      .innerJoin(schema.files, eq(schema.files.id, schema.projectFiles.fileId))
      .where(eq(schema.projectFiles.projectId, row.id))
      .orderBy(asc(schema.projectFiles.createdAt)),
  ]);
  const productIds = [...new Set([...recs, ...items].map((item) => item.productId).filter((id): id is string => Boolean(id)))];
  const cards = await cardsById(db, productIds);
  const groupOrder = { RECOMMENDED: 0, USEFUL: 1, OPTIONAL: 2 } as const;
  const recommendations: ProjectRecommendation[] = recs
    .sort((a, b) => groupOrder[a.group] - groupOrder[b.group] || a.position - b.position)
    .map((rec) => ({
      key: rec.ruleKey,
      group: rec.group,
      name: rec.name,
      reason: rec.reason,
      product: brief(rec.productId ? cards.get(rec.productId) : undefined),
      suggestedQuantity: rec.suggestedQuantity,
      customerQuantity: rec.customerQuantity,
      state: rec.state,
      stillSuggested: rec.stillSuggested,
    }));
  const itemViews: ProjectItem[] = items.map((item) => ({
    id: item.id,
    kind: item.kind,
    name: item.name,
    description: item.description,
    product: brief(item.productId ? cards.get(item.productId) : undefined),
    quantity: item.quantity,
    quantityNote: item.quantityNote,
    files: files.filter(({ link }) => link.itemId === item.id).map(({ file }) => ({ id: file.id, name: file.safeName, status: file.status })),
  }));
  const answers = projectAnswersSchema.parse(row.answers);
  const lines = [
    ...recs.map((rec) => ({ included: rec.state === "INCLUDED", quantity: rec.customerQuantity ?? rec.suggestedQuantity })),
    ...items.map((item) => ({ included: true, quantity: item.quantity })),
  ];
  const [link] = await db
    .select({ id: schema.guestLinks.id })
    .from(schema.guestLinks)
    .where(and(eq(schema.guestLinks.targetType, "PROJECT"), eq(schema.guestLinks.targetId, row.id)))
    .limit(1);
  const [quote] = await db
    .select({ id: schema.quotes.id, reference: schema.quotes.reference, status: schema.quotes.status })
    .from(schema.quotes)
    .where(eq(schema.quotes.projectId, row.id));
  const contact = row.contact as { email: string } | null;
  return {
    id: row.id,
    reference: row.reference,
    type: row.type,
    title: row.title,
    status: row.status,
    step: row.step,
    answers,
    recommendations,
    items: itemViews,
    files: files.map(({ link, file }) => ({ id: file.id, fileId: file.id, name: file.safeName, status: file.status, itemId: link.itemId })),
    openItems: openItems(answers, lines),
    deadline: deadlineState(answers, now),
    priceState: "QUOTE_REQUIRED",
    linkEmailed: Boolean(link),
    submittedAt: row.submittedAt?.toISOString() ?? null,
    sentTo: contact ? maskEmail(contact.email) : null,
    quote: quote ?? null,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getProject(db: Database, access: ProjectAccess, id: string) {
  return projectView(db, await loadProject(db, access, id), access.actor.now);
}

/** The newest draft this person or browser was working on, for "Continue your … project". */
export async function currentProject(db: Database, access: ProjectAccess) {
  const { actor, deviceKey } = access;
  const owner =
    actor.type === "user"
      ? eq(schema.projects.ownerUserId, actor.session.userId)
      : actor.type === "guest" && actor.guest.targetType === "PROJECT"
        ? eq(schema.projects.id, actor.guest.targetId)
        : deviceKey
          ? eq(schema.projects.ownerDeviceHash, sha256(deviceKey))
          : null;
  if (!owner) return null;
  const [row] = await db
    .select({ id: schema.projects.id, type: schema.projects.type, title: schema.projects.title, step: schema.projects.step, updatedAt: schema.projects.lastActivityAt })
    .from(schema.projects)
    .where(and(owner, eq(schema.projects.status, "DRAFT")))
    .orderBy(desc(schema.projects.lastActivityAt))
    .limit(1);
  return row ? { ...row, updatedAt: row.updatedAt.toISOString() } : null;
}

/** Signing in makes the browser's project drafts the account's, so they open on any device (as configuration drafts, review P1-04). */
export async function claimDeviceProjects(db: Database, access: ProjectAccess): Promise<void> {
  if (access.actor.type !== "user" || !access.deviceKey) return;
  await db
    .update(schema.projects)
    .set({ ownerUserId: access.actor.session.userId, ownerDeviceHash: null })
    .where(eq(schema.projects.ownerDeviceHash, sha256(access.deviceKey)));
}

/* ------------------------------------------------------------------ */
/* Suggestions                                                         */
/* ------------------------------------------------------------------ */

export async function rulesFor(db: Database | Tx, type: ProjectType): Promise<RuleInput[]> {
  const rows = await db.select().from(schema.recommendationRules).where(eq(schema.recommendationRules.projectType, type));
  return rows.map((rule) => ({
    id: rule.id,
    group: rule.group,
    itemName: rule.itemName,
    productId: rule.productId,
    condition: rule.condition as RuleCondition,
    quantity: rule.quantity as RuleQuantity,
    reason: rule.reason,
    position: rule.position,
    active: rule.active,
  }));
}

/** Works the suggestions out again from the current brief and rules, keeping the customer's choices. */
async function refreshSuggestions(tx: Tx, row: Row) {
  const existing = await tx.select().from(schema.projectRecommendations).where(eq(schema.projectRecommendations.projectId, row.id));
  const rows: SuggestionRow[] = existing.map((rec) => ({
    ruleKey: rec.ruleKey,
    group: rec.group,
    name: rec.name,
    reason: rec.reason,
    productId: rec.productId,
    suggestedQuantity: rec.suggestedQuantity,
    customerQuantity: rec.customerQuantity,
    state: rec.state,
    customerOverridden: rec.customerOverridden,
    stillSuggested: rec.stillSuggested,
    position: rec.position,
  }));
  const { keep, drop } = reconcile(await rulesFor(tx, row.type), projectAnswersSchema.parse(row.answers), rows);
  if (drop.length) {
    await tx.delete(schema.projectRecommendations).where(and(eq(schema.projectRecommendations.projectId, row.id), inArray(schema.projectRecommendations.ruleKey, drop)));
  }
  for (const rec of keep) {
    const values = { ...rec, projectId: row.id, updatedAt: new Date() };
    await tx
      .insert(schema.projectRecommendations)
      .values(values)
      .onConflictDoUpdate({
        target: [schema.projectRecommendations.projectId, schema.projectRecommendations.ruleKey],
        set: {
          group: rec.group,
          name: rec.name,
          reason: rec.reason,
          productId: rec.productId,
          suggestedQuantity: rec.suggestedQuantity,
          customerQuantity: rec.customerQuantity,
          state: rec.state,
          stillSuggested: rec.stillSuggested,
          position: rec.position,
          updatedAt: new Date(),
        },
      });
  }
}

/**
 * Every change goes through here: only a draft at the version the customer
 * started from changes; anything else is 409 with the latest project.
 */
async function change(db: Database, access: ProjectAccess, id: string, version: number, apply: (tx: Tx, row: Row) => Promise<{ refresh?: boolean } | void>) {
  const before = await loadProject(db, access, id);
  if (before.status !== "DRAFT") throw notDraft();
  const saved = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(schema.projects)
      .set({ version: sql`${schema.projects.version} + 1`, lastActivityAt: access.actor.now, updatedAt: new Date() })
      .where(and(eq(schema.projects.id, id), eq(schema.projects.version, version), eq(schema.projects.status, "DRAFT")))
      .returning();
    if (!row) return null;
    const result = await apply(tx, row);
    const [after] = await tx.select().from(schema.projects).where(eq(schema.projects.id, id));
    if (result?.refresh) await refreshSuggestions(tx, after!);
    return after!;
  });
  if (!saved) {
    const latest = await loadProject(db, access, id);
    if (latest.status !== "DRAFT") throw notDraft();
    throw new AppError("VERSION_CONFLICT", { context: { latest: await projectView(db, latest, access.actor.now) } });
  }
  return projectView(db, saved, access.actor.now);
}

/* ------------------------------------------------------------------ */
/* Writing                                                             */
/* ------------------------------------------------------------------ */

/** Starts a project from a goal (PROJ-FR-001), owned by the account or by this browser. */
export async function createProject(
  db: Database,
  access: ProjectAccess,
  input: { type: ProjectType; title?: string; description?: string },
): Promise<{ project: Project; newDeviceKey: string | null }> {
  const { actor } = access;
  let deviceKey = access.deviceKey;
  let newDeviceKey: string | null = null;
  if (actor.type !== "user" && actor.type !== "guest" && !deviceKey) {
    deviceKey = crypto.randomUUID() + crypto.randomUUID();
    newDeviceKey = deviceKey;
  }
  const answers: ProjectAnswers = input.description ? { [input.type === "SOMETHING_ELSE" ? "description" : "brandNote"]: input.description } : {};
  const errors = checkAnswers(input.type, answers);
  if (Object.keys(errors).length) throw new AppError("VALIDATION_FAILED", { fieldErrors: errors });
  const row = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(schema.projects)
      .values({
        type: input.type,
        title: input.title || null,
        answers,
        ownerUserId: actor.type === "user" ? actor.session.userId : null,
        ownerDeviceHash: actor.type === "user" || !deviceKey ? null : sha256(deviceKey),
        customerId: actor.type === "guest" ? actor.guest.customerId : null,
        lastActivityAt: actor.now,
      })
      .returning();
    await refreshSuggestions(tx, created!);
    return created!;
  });
  return { project: await projectView(db, row, actor.now), newDeviceKey };
}

/** Autosave of answers, title and step. Answers are merged; null clears one. */
export async function updateProject(
  db: Database,
  access: ProjectAccess,
  id: string,
  input: { version: number; step?: Row["step"]; title?: string | null; answers?: ProjectAnswers },
) {
  return change(db, access, id, input.version, async (tx, row) => {
    const set: Partial<typeof schema.projects.$inferInsert> = {};
    if (input.step) set.step = input.step;
    if (input.title !== undefined) set.title = input.title || null;
    let refresh = false;
    if (input.answers && Object.keys(input.answers).length) {
      const errors = checkAnswers(row.type, input.answers);
      if (Object.keys(errors).length) throw new AppError("VALIDATION_FAILED", { fieldErrors: errors });
      const merged: ProjectAnswers = { ...projectAnswersSchema.parse(row.answers) };
      for (const [key, value] of Object.entries(input.answers)) {
        if (value === null || value === "" || (Array.isArray(value) && !value.length)) delete merged[key];
        else merged[key] = value;
      }
      set.answers = merged;
      refresh = true;
    }
    if (Object.keys(set).length) await tx.update(schema.projects).set(set).where(eq(schema.projects.id, id));
    // A staff rule change shows up the next time the customer saves.
    return { refresh: refresh || !input.step };
  });
}

/** Add, remove or change the quantity of a suggestion. From then on it is the customer's (PROJ-FR-004). */
export async function updateRecommendation(db: Database, access: ProjectAccess, id: string, key: string, input: { version: number; state?: "INCLUDED" | "REMOVED"; quantity?: number | null }) {
  return change(db, access, id, input.version, async (tx) => {
    const set: Partial<typeof schema.projectRecommendations.$inferInsert> = { customerOverridden: true, updatedAt: new Date() };
    if (input.state) set.state = input.state;
    if (input.quantity !== undefined) {
      set.customerQuantity = input.quantity;
      // Changing the quantity of an offered item adds it.
      if (!input.state) set.state = "INCLUDED";
    }
    const updated = await tx
      .update(schema.projectRecommendations)
      .set(set)
      .where(and(eq(schema.projectRecommendations.projectId, id), eq(schema.projectRecommendations.ruleKey, key)))
      .returning({ id: schema.projectRecommendations.id });
    if (!updated.length) throw new AppError("NOT_FOUND");
  });
}

/** A catalogue product or a custom item (PROJ-FR-005), loosely described (PROJ-FR-006). */
export async function addProjectItem(
  db: Database,
  access: ProjectAccess,
  id: string,
  input: { version: number; productSlug?: string; name?: string; description?: string; quantity?: number | null; quantityNote?: string },
) {
  let product: { id: string; name: string } | undefined;
  if (input.productSlug) {
    [product] = await db
      .select({ id: schema.products.id, name: schema.products.name })
      .from(schema.products)
      .where(and(eq(schema.products.slug, input.productSlug), eq(schema.products.status, "PUBLISHED")));
    if (!product) throw new AppError("VALIDATION_FAILED", { fieldErrors: { productSlug: "Choose a product from the list." } });
  } else if (!input.name) {
    throw new AppError("VALIDATION_FAILED", { fieldErrors: { name: "Describe the item." } });
  }
  return change(db, access, id, input.version, async (tx) => {
    const [count] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.projectItems).where(eq(schema.projectItems.projectId, id));
    if ((count?.n ?? 0) >= 50) throw new AppError("RULE_FAILED", { message: "A project can hold 50 items. Ask us about anything more.", context: { reason: "TOO_MANY_ITEMS" } });
    await tx.insert(schema.projectItems).values({
      projectId: id,
      kind: product ? "CATALOGUE" : "CUSTOM",
      productId: product?.id ?? null,
      name: input.name || product!.name,
      description: input.description || null,
      quantity: input.quantity ?? null,
      quantityNote: input.quantityNote || null,
      position: count?.n ?? 0,
    });
  });
}

export async function updateProjectItem(
  db: Database,
  access: ProjectAccess,
  id: string,
  itemId: string,
  input: { version: number; name?: string; description?: string | null; quantity?: number | null; quantityNote?: string | null },
) {
  return change(db, access, id, input.version, async (tx) => {
    const { version: _version, ...fields } = input;
    void _version;
    const updated = await tx
      .update(schema.projectItems)
      .set({ ...fields, updatedAt: new Date() })
      .where(and(eq(schema.projectItems.id, itemId), eq(schema.projectItems.projectId, id)))
      .returning({ id: schema.projectItems.id });
    if (!updated.length) throw new AppError("NOT_FOUND");
  });
}

export async function removeProjectItem(db: Database, access: ProjectAccess, id: string, itemId: string, version: number) {
  return change(db, access, id, version, async (tx) => {
    const removed = await tx
      .delete(schema.projectItems)
      .where(and(eq(schema.projectItems.id, itemId), eq(schema.projectItems.projectId, id)))
      .returning({ id: schema.projectItems.id });
    if (!removed.length) throw new AppError("NOT_FOUND");
  });
}

/** Brand files and custom items' reference files (Stage 3.1D §9). Never required for suggestions. */
export async function attachProjectFile(db: Database, access: ProjectAccess, id: string, input: { fileId: string; itemId?: string }) {
  const row = await loadProject(db, access, id);
  if (row.status !== "DRAFT") throw notDraft();
  const file = await findFileForActor(db, access.actor, input.fileId).catch(() => null);
  if (!file) throw new AppError("NOT_FOUND");
  if (file.purpose !== "PROJECT_ATTACHMENT" && file.purpose !== "ARTWORK") throw new AppError("VALIDATION_FAILED", { fieldErrors: { fileId: "Upload this file to the project." } });
  if (file.status === "REJECTED") throw new AppError("RULE_FAILED", { message: file.reason ?? "We can't use this file.", context: { reason: "FILE_REJECTED" } });
  if (input.itemId) {
    const [item] = await db.select({ id: schema.projectItems.id }).from(schema.projectItems).where(and(eq(schema.projectItems.id, input.itemId), eq(schema.projectItems.projectId, id)));
    if (!item) throw new AppError("NOT_FOUND");
  }
  await db.transaction(async (tx) => {
    await tx.insert(schema.projectFiles).values({ projectId: id, fileId: file.id, itemId: input.itemId ?? null }).onConflictDoUpdate({ target: [schema.projectFiles.projectId, schema.projectFiles.fileId], set: { itemId: input.itemId ?? null } });
    await tx.update(schema.files).set({ ownerType: "PROJECT", ownerId: id, attachedAt: new Date() }).where(eq(schema.files.id, file.id));
    await tx.update(schema.projects).set({ version: sql`${schema.projects.version} + 1`, lastActivityAt: access.actor.now }).where(eq(schema.projects.id, id));
  });
  return getProject(db, access, id);
}

export async function removeProjectFile(db: Database, access: ProjectAccess, id: string, fileId: string) {
  const row = await loadProject(db, access, id);
  if (row.status !== "DRAFT") throw notDraft();
  await db.transaction(async (tx) => {
    const removed = await tx.delete(schema.projectFiles).where(and(eq(schema.projectFiles.projectId, id), eq(schema.projectFiles.fileId, fileId))).returning();
    if (!removed.length) throw new AppError("NOT_FOUND");
    // Unattached files are removed by the file clean-up after 7 days.
    await tx.update(schema.files).set({ ownerType: null, ownerId: null, attachedAt: null }).where(and(eq(schema.files.id, fileId), eq(schema.files.ownerType, "PROJECT")));
    await tx.update(schema.projects).set({ version: sql`${schema.projects.version} + 1`, lastActivityAt: access.actor.now }).where(eq(schema.projects.id, id));
  });
  return getProject(db, access, id);
}

/**
 * Emails a link to continue on any device (PROJ-FR-007). A visitor without an
 * account also gets a guest session for this project, so they can upload
 * files (uploads need a session, TECH-04).
 */
export async function emailProjectLink(deps: NotificationDeps & { webOrigin: string }, access: ProjectAccess, id: string, email: string) {
  const row = await loadProject(deps.db, access, id);
  if (row.status !== "DRAFT") throw notDraft();
  const opened: { session: { token: string; expiresAt: Date } | null } = { session: null };
  const label = row.title || "your project";
  await deps.db.transaction(async (tx) => {
    const { owner, recipient } = await customersForContact(tx, access.actor, { email });
    await tx.update(schema.projects).set({ customerId: owner.id }).where(eq(schema.projects.id, id));
    const link = await createGuestLink(tx, deps.webOrigin, { purpose: "PROJECT", targetType: "PROJECT", targetId: id, customerId: recipient.id, now: access.actor.now });
    if (access.actor.type === "anonymous") {
      const [linkRow] = await tx.select().from(schema.guestLinks).where(eq(schema.guestLinks.id, link.id));
      opened.session = await startGuestSession(tx, linkRow!, access.actor.now);
    }
    await queueEmail(deps, tx, {
      template: "guest_link",
      to: email,
      customerId: recipient.id,
      data: { url: link.url, what: "saved project" },
      record: { type: "PROJECT", id, label },
      linkLabel: "Opens the saved project",
      requestId: access.actor.requestId,
    });
  });
  return { project: await getProject(deps.db, access, id), session: opened.session };
}

/* ------------------------------------------------------------------ */
/* Submitting (T05-03; PROJ-FR-010–011)                                */
/* ------------------------------------------------------------------ */

async function nextProjectReference(tx: Tx, now: Date) {
  const result = await tx.execute<{ n: string }>(sql`select nextval('project_reference_seq')::text as n`);
  return `HP-P-${now.getUTCFullYear()}-${String(result.rows[0]!.n).padStart(4, "0")}`;
}

async function nextQuoteReference(tx: Tx, now: Date) {
  const result = await tx.execute<{ n: string }>(sql`select nextval('quote_number_seq')::text as n`);
  return `HP-Q-${now.getUTCFullYear()}-${String(result.rows[0]!.n).padStart(4, "0")}`;
}

/**
 * Request Project Quote (PROJ-FR-010–011, Pen 124). In one transaction, under
 * the project's row lock: the project gets its HP-P reference and becomes
 * SUBMITTED with a frozen copy of the brief (TECH-01 §5); a quote starts in
 * PENDING_REVIEW; the customer gets a secure link. Pressing twice returns
 * the same project and reference (the route is also idempotent, TECH-02 §4).
 * No account needed.
 */
export async function submitProject(
  deps: NotificationDeps & { webOrigin: string },
  access: ProjectAccess,
  id: string,
  input: { version: number; email?: string; name?: string },
) {
  const { actor } = access;
  const before = await loadProject(deps.db, access, id);
  if (before.status !== "DRAFT") return getProject(deps.db, access, id);
  const email = input.email ?? (actor.type === "user" ? actor.session.email : null);
  if (!email) throw new AppError("VALIDATION_FAILED", { fieldErrors: { email: "Add an email so we can send your quote." } });
  const view = await projectView(deps.db, before, actor.now);
  const hasScope = view.items.length > 0 || view.recommendations.some((rec) => rec.state === "INCLUDED") || typeof view.answers.description === "string";
  if (!hasScope) throw new AppError("RULE_FAILED", { message: "Add at least one item, or describe what you need, before asking for a quote.", context: { reason: "NOTHING_TO_QUOTE" } });

  await deps.db.transaction(async (tx) => {
    const [locked] = await tx.select().from(schema.projects).where(eq(schema.projects.id, id)).for("update");
    if (!locked || locked.status !== "DRAFT") return;
    if (locked.version !== input.version) throw new AppError("VERSION_CONFLICT", { context: { latest: await projectView(tx, locked, actor.now) } });
    const fresh = await projectView(tx, locked, actor.now);
    const { owner, recipient } = await customersForContact(tx, actor, { email, name: input.name ?? null });
    const reference = await nextProjectReference(tx, actor.now);
    const contact = { name: input.name ?? (actor.type === "user" ? actor.session.name || null : null), email };
    const { version: _version, linkEmailed: _linked, quote: _quote, sentTo: _sentTo, ...brief } = fresh;
    void _version;
    void _linked;
    void _quote;
    void _sentTo;
    const snapshot = { schema: "project-brief/v1", ...brief, reference, status: "SUBMITTED", submittedAt: actor.now.toISOString() };
    await tx
      .update(schema.projects)
      .set({
        reference,
        status: "SUBMITTED",
        submittedAt: actor.now,
        submittedSnapshot: snapshot,
        contact,
        customerId: owner.id,
        version: sql`${schema.projects.version} + 1`,
        lastActivityAt: actor.now,
      })
      .where(eq(schema.projects.id, id));
    await tx.insert(schema.quotes).values({
      reference: await nextQuoteReference(tx, actor.now),
      customerId: owner.id,
      projectId: id,
      requestSnapshot: snapshot,
      contact: { ...contact, note: null, phone: null },
    });
    const link = await createGuestLink(tx, deps.webOrigin, { purpose: "PROJECT", targetType: "PROJECT", targetId: id, customerId: recipient.id, now: actor.now });
    await queueEmail(deps, tx, {
      template: "project_submitted",
      to: email,
      customerId: recipient.id,
      data: { reference, title: locked.title || "your project", url: link.url },
      record: { type: "PROJECT", id, label: reference },
      linkLabel: "Opens the submitted project",
      requestId: actor.requestId,
    });
  });
  return getProject(deps.db, access, id);
}
