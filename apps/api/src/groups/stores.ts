import {
  type Allowance,
  type AllowancePeriod,
  type CreateStore,
  displayMoney,
  GARMENT_SIZES,
  type ParticipantField,
  type Store,
  type StoreItem,
  type StoreList,
  type StoreOrderResult,
  type StorePick,
  type StoreProcurement,
  type StoreStatus,
  type UpdateAllowance,
  type UpdateStore,
} from "@holypearls/contracts";
import { and, type Database, desc, eq, inArray, schema, type Transaction } from "@holypearls/db";
import { configurationForGroup, configurationFromTemplate, previewTemplatePrice } from "../configuration/drafts.js";
import { AppError } from "../errors.js";
import type { ActorContext } from "../identity/actor.js";
import { type Member, requireMember } from "../organizations/members.js";
import { needsPermission } from "../organizations/policies.js";
import type { OrganizationDeps } from "../organizations/team.js";
import { releasedRequests } from "../organizations/approvals.js";
import { approvalPreview, type PlacedLine, placeTemplateLines, templateLine } from "../organizations/template-orders.js";
import { templatesFor } from "../organizations/templates.js";
import { recordAudit } from "../platform/audit.js";
import { enforce } from "../platform/policy.js";
import { availability } from "./collections.js";
import { colourChoices, submitFromStore } from "./participants.js";

/*
 * Company stores (T12-06; PRD-05 B2B-FR-080–083; TECH-01 §4; Pen 32, 77,
 * 78; Journeys 9–10). A private, never-indexed mini-catalogue of the
 * organization's approved templates, set up by people who manage stores.
 * Procurement stores let buyers order several items for a location; the
 * order follows the template-order route (approval, checkout or quote).
 * Self-order stores let each employee pick one item with their own size,
 * name and branch. The store's routing, which employees never see or choose,
 * sends the pick either to an individual order (like a template order) or
 * into the item's group collection as a sent participant. Allowances arrive
 * in T12-06b.
 */

type Db = Database | Transaction;
type Row = typeof schema.companyStores.$inferSelect;
type CollectionRow = typeof schema.groupCollections.$inferSelect;
const RECORD_TYPE = "COMPANY_STORE";
/** Fields that describe what the company set rather than what someone chooses. */
const DESCRIBING = /^(option:|garment:|logo)/;

const manages = (member: Member) => member.permissions.has("MANAGE_STORES");
const shortDay = (date: Date) => date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Lagos" });

async function loadStore(db: Db, organizationId: string, id: string, options: { lock?: boolean } = {}) {
  const query = db.select().from(schema.companyStores).where(and(eq(schema.companyStores.id, id), eq(schema.companyStores.organizationId, organizationId)));
  const [row] = options.lock ? await query.for("update") : await query;
  if (!row) throw new AppError("NOT_FOUND");
  return row;
}

/** Members see open stores (paused ones say so); drafts and archived stores only people who manage stores. */
function canSee(member: Member, row: Row) {
  return manages(member) || row.status === "ACTIVE" || row.status === "PAUSED";
}

async function itemsOf(db: Db, storeIds: readonly string[]) {
  if (!storeIds.length) return [];
  return db.select().from(schema.companyStoreItems).where(inArray(schema.companyStoreItems.storeId, [...storeIds])).orderBy(schema.companyStoreItems.position);
}

async function organizationLocations(db: Db, organizationId: string) {
  return db.select({ id: schema.locations.id, name: schema.locations.name }).from(schema.locations).where(eq(schema.locations.organizationId, organizationId)).orderBy(schema.locations.name);
}

/** Why a collection can't take picks now, or null. */
function collectionClosed(collection: CollectionRow | undefined, now: Date) {
  if (!collection || collection.status === "CANCELLED") return "This item isn't taking choices now.";
  if (collection.status === "PAUSED") return "The team order is paused. Try again later.";
  if (collection.status !== "OPEN" || (collection.deadline && collection.deadline <= now)) return "The team order has closed. If you still need one, ask your organiser.";
  return null;
}

async function storeView(deps: Pick<OrganizationDeps, "db">, member: Member, row: Row, now: Date): Promise<Store> {
  const db = deps.db;
  const rows = await itemsOf(db, [row.id]);
  const found = new Map((await templatesFor(db, member, rows.map((item) => item.templateId))).map((entry) => [entry.template.id, entry]));
  const collectionIds = rows.flatMap((item) => (item.collectionId ? [item.collectionId] : []));
  const collections = new Map((collectionIds.length ? await db.select().from(schema.groupCollections).where(inArray(schema.groupCollections.id, collectionIds)) : []).map((collection) => [collection.id, collection]));
  const locations = await organizationLocations(db, member.organizationId);
  const sources = found.size
    ? await db
        .select({ id: schema.configurations.id, quantity: schema.configurations.quantity })
        .from(schema.configurations)
        .where(inArray(schema.configurations.id, [...found.values()].map((entry) => entry.sourceConfigurationId)))
    : [];
  const yours = locations.filter((location) => member.allLocations || member.locationIds.has(location.id));
  const selfOrder = row.mode === "SELF_ORDER";
  const toCollection = selfOrder && row.routing === "COLLECTION";
  // Allowances apply to an employee's own picks; a collection's picks have no price until it's quoted.
  const allowance = selfOrder && !toCollection ? await allowanceFor(db, row.id, member, now) : null;

  const items: StoreItem[] = [];
  for (const item of rows) {
    const entry = found.get(item.templateId);
    if (!entry) continue; // Not for this person's locations (frame 78 A "only approved products for their branch").
    const { template } = entry;
    const usual = sources.find((source) => source.id === entry.sourceConfigurationId)?.quantity ?? 1;
    // An employee's own pick is one piece; everything else is priced at the template's usual quantity.
    const quantity = selfOrder && !toCollection ? 1 : usual;
    const price = await previewTemplatePrice(db, entry.sourceConfigurationId, { choices: {}, quantity }, now).catch(() => null);
    const direct = price?.state === "PRICE_READY" && price.valid;
    const allowed = yours.filter((location) => template.allLocations || template.locations.some((place) => place.id === location.id));
    const collection = item.collectionId ? collections.get(item.collectionId) : undefined;
    const offered = availability(template.fields);
    const quantityLocked = template.fields.some((field) => field.key === "quantity" && field.control === "LOCKED");
    const unavailable =
      template.status !== "APPROVED"
        ? "Temporarily unavailable. Your organiser has been told."
        : toCollection
          ? collectionClosed(collection, now)
          : selfOrder && quantityLocked && usual !== 1
            ? "Ordered in a fixed quantity by your company, so it isn't available one at a time."
            : !allowed.length
              ? "None of your locations can order this item."
              : null;
    const fields: ParticipantField[] = !selfOrder
      ? []
      : toCollection
        ? ((collection?.fields ?? []) as ParticipantField[])
        : (["SIZE", "PERSONALIZATION"] as const).filter((field) => offered.find((entry) => entry.field === field)?.available);
    const branches = !selfOrder ? [] : toCollection ? (collection?.deliveryMode === "BRANCHES" ? locations.filter((location) => collection.branchLocationIds.includes(location.id)) : []) : allowed;
    items.push({
      templateId: template.id,
      name: template.name,
      productName: template.productName,
      image: template.image,
      locked: template.fields
        .filter((field) => field.control === "LOCKED" && DESCRIBING.test(field.key) && field.value)
        .map((field) => field.value)
        .slice(0, 4)
        .join(" · "),
      unitMinor: direct ? price.perUnitMinor : null,
      currency: price?.currency ?? "NGN",
      unavailable,
      fields,
      sizes: fields.includes("SIZE") ? [...GARMENT_SIZES] : [],
      sizeUnsureAllowed: toCollection && collection?.unsureSizeRule === "ALLOW_UNSURE",
      colours: toCollection && collection && fields.includes("COLOUR") ? await colourChoices(db, collection) : [],
      branches,
      action: !selfOrder ? "Add" : toCollection ? `Add to ${member.organizationName} team order` : allowance ? "Place order" : "Request this item",
      note: !selfOrder
        ? ""
        : toCollection
          ? `Joins ${collection?.title ?? "the team order"}${collection?.deadline ? `, which closes ${shortDay(collection.deadline)}` : ""} · not a separate purchase`
          : allowance
            ? `Paid by ${member.organizationName} from your ${allowance.policy.name.toLowerCase()}`
            : "Your own order, for your branch",
      covered: Boolean(allowance && direct && price.totalMinor && BigInt(price.totalMinor) <= allowance.limit),
      pickTotalMinor: allowance && direct ? (price.totalMinor ?? null) : null,
    });
  }
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    mode: row.mode,
    itemCount: items.length,
    updatedAt: row.updatedAt.toISOString(),
    organizationName: member.organizationName,
    items,
    modeNote: !selfOrder
      ? `Everything here uses ${member.organizationName}'s approved templates. Colour, logo and placement are locked.`
      : toCollection
        ? "Your choices are added to your team's order. Only your size, name and branch are yours to choose."
        : "You're ordering for yourself. Only your size, name and branch are yours to choose.",
    locations: selfOrder ? [] : yours,
    approval: await approvalPreview(db, member),
    allowance: allowance?.view ?? null,
    blocked:
      row.status === "DRAFT"
        ? "This store isn't open yet. Activate it to let people order."
        : row.status === "PAUSED"
          ? "This store is paused. Try again later."
          : row.status === "ARCHIVED"
            ? "This store is archived."
            : !selfOrder && !member.permissions.has("CREATE_REQUESTS")
              ? "Your role can't place orders here. Ask your workspace Admin."
              : null,
    setup: manages(member)
      ? {
          routing: row.routing,
          items: rows.map((item) => ({ templateId: item.templateId, collectionId: item.collectionId })),
          allowance: await policyOf(db, row.id).then((policy) => ({
            kind: policy?.kind ?? "NONE",
            name: policy?.name ?? "Uniform allowance",
            amountMinor: policy?.amountMinor?.toString() ?? null,
            period: policy?.period ?? null,
            renewsOn: policy?.renewsOn ?? null,
          })),
        }
      : null,
    canManage: manages(member),
    version: row.version,
  };
}

/* ——— Allowances (T12-06b; PRD-05 B2B-FR-084; Pen 32, 78 B–C) ——— */

const PERIOD_MONTHS: Record<AllowancePeriod, number> = { MONTH: 1, QUARTER: 3, YEAR: 12 };
const LAGOS_OFFSET_MS = 3_600_000;
const pad = (value: number) => String(value).padStart(2, "0");

/**
 * The allowance period `now` falls in, for a renewal day "MM-DD" (Lagos
 * time): its first day, and the moment the next one starts. A yearly
 * allowance renewing "01-01" runs 1 Jan to 31 Dec; quarterly ones step three
 * months from the renewal month; monthly ones renew on that day each month.
 */
export function allowancePeriod(period: AllowancePeriod, renewsOn: string, now: Date) {
  const lagos = new Date(now.getTime() + LAGOS_OFFSET_MS);
  const [anchorMonth, day] = renewsOn.split("-").map(Number) as [number, number];
  const step = PERIOD_MONTHS[period];
  const current = lagos.getUTCFullYear() * 12 + lagos.getUTCMonth();
  let start = current;
  for (let back = 0; back <= 12; back++) {
    const month = current - back;
    if (((((month % 12) - (anchorMonth - 1)) % step) + step) % step !== 0) continue;
    if (back === 0 && lagos.getUTCDate() < day) continue;
    start = month;
    break;
  }
  const date = (month: number) => `${Math.floor(month / 12)}-${pad((month % 12) + 1)}-${pad(day)}`;
  const next = start + step;
  return { start: date(start), next: new Date(Date.UTC(Math.floor(next / 12), next % 12, day) - LAGOS_OFFSET_MS) };
}

async function policyOf(db: Db, storeId: string) {
  const [policy] = await db.select().from(schema.allowancePolicies).where(eq(schema.allowancePolicies.storeId, storeId));
  return policy ?? null;
}

/**
 * This member's allowance in a store, or null when there's no limit. A per
 * period allowance counts what their picks committed this period; a pick
 * whose approval was rejected or cancelled gives its amount back.
 */
async function allowanceFor(db: Db, storeId: string, member: Member, now: Date) {
  const policy = await policyOf(db, storeId);
  if (!policy || policy.kind === "NONE" || policy.amountMinor === null) return null;
  const base = { kind: policy.kind, name: policy.name, amountMinor: policy.amountMinor.toString(), currency: policy.currency, period: policy.period, renewsOn: policy.renewsOn };
  if (policy.kind === "PER_ORDER") {
    const view: Allowance = { ...base, usedMinor: null, remainingMinor: null, renewsAt: null };
    return { policy, view, limit: policy.amountMinor, periodStart: null };
  }
  const { start, next } = allowancePeriod(policy.period!, policy.renewsOn!, now);
  const entries = await db
    .select()
    .from(schema.allowanceLedger)
    .where(and(eq(schema.allowanceLedger.storeId, storeId), eq(schema.allowanceLedger.membershipId, member.membershipId), eq(schema.allowanceLedger.periodStart, start)));
  const released = await releasedRequests(db, entries.flatMap((entry) => (entry.orderRequestId ? [entry.orderRequestId] : [])));
  const used = entries.filter((entry) => !entry.orderRequestId || !released.has(entry.orderRequestId)).reduce((sum, entry) => sum + entry.amountMinor, 0n);
  const remaining = used >= policy.amountMinor ? 0n : policy.amountMinor - used;
  const view: Allowance = { ...base, usedMinor: used.toString(), remainingMinor: remaining.toString(), renewsAt: next.toISOString() };
  return { policy, view, limit: remaining, periodStart: start };
}

/** The allowance rule (B2B-FR-084) for a self-order store: none, per order, or per period renewing on a day. People who manage stores only. */
export async function updateAllowance(deps: Pick<OrganizationDeps, "db">, actor: ActorContext, organizationId: string, id: string, input: UpdateAllowance): Promise<Store> {
  const db = deps.db;
  const member = await requireMember(db, actor, organizationId);
  enforce(needsPermission(member, "MANAGE_STORES"));
  const row = await db.transaction(async (tx) => {
    const store = await loadStore(tx, organizationId, id, { lock: true });
    if (store.version !== input.version) throw new AppError("VERSION_CONFLICT", { context: { currentVersion: store.version } });
    if (store.status === "ARCHIVED") throw new AppError("RULE_FAILED", { message: "This store is archived.", context: { reason: "STORE_ARCHIVED" } });
    const before = await policyOf(tx, id);
    const values = {
      kind: input.kind,
      name: input.name,
      amountMinor: input.kind === "NONE" ? null : BigInt(input.amountMinor!),
      period: input.kind === "PER_PERIOD" ? input.period : null,
      renewsOn: input.kind === "PER_PERIOD" ? input.renewsOn : null,
      updatedByUserId: member.userId,
      updatedAt: actor.now,
    };
    await tx.insert(schema.allowancePolicies).values({ storeId: id, ...values }).onConflictDoUpdate({ target: schema.allowancePolicies.storeId, set: values });
    const [updated] = await tx.update(schema.companyStores).set({ version: store.version + 1, updatedAt: actor.now }).where(eq(schema.companyStores.id, id)).returning();
    await recordAudit(tx, actor, {
      action: "store.allowance_updated",
      summary: `Allowance for ${store.name}: ${input.kind === "NONE" ? "no limit" : `${displayMoney(input.amountMinor!, "NGN")} ${input.kind === "PER_ORDER" ? "per order" : `per ${input.period!.toLowerCase()}`}`}`,
      recordType: RECORD_TYPE,
      recordId: id,
      before: before ? { kind: before.kind, amountMinor: before.amountMinor?.toString() ?? null, period: before.period, renewsOn: before.renewsOn } : null,
      after: { kind: input.kind, amountMinor: values.amountMinor?.toString() ?? null, period: values.period, renewsOn: values.renewsOn },
    });
    return updated!;
  });
  return storeView(deps, member, row, actor.now);
}

export async function listStores(db: Database, actor: ActorContext, organizationId: string): Promise<StoreList> {
  const member = await requireMember(db, actor, organizationId);
  const rows = (await db.select().from(schema.companyStores).where(eq(schema.companyStores.organizationId, organizationId)).orderBy(desc(schema.companyStores.updatedAt)).limit(100)).filter(
    (row) => canSee(member, row) && row.status !== "ARCHIVED",
  );
  const items = await itemsOf(db, rows.map((row) => row.id));
  return {
    stores: rows.map((row) => ({ id: row.id, name: row.name, status: row.status, mode: row.mode, itemCount: items.filter((item) => item.storeId === row.id).length, updatedAt: row.updatedAt.toISOString() })),
    canManage: manages(member),
  };
}

export async function getStore(deps: Pick<OrganizationDeps, "db">, actor: ActorContext, organizationId: string, id: string): Promise<Store> {
  const member = await requireMember(deps.db, actor, organizationId);
  const row = await loadStore(deps.db, organizationId, id);
  if (!canSee(member, row)) throw new AppError("NOT_FOUND");
  return storeView(deps, member, row, actor.now);
}

/** Start a store (B2B-FR-080): a DRAFT with a name and a mode; items and routing come next. */
export async function createStore(deps: Pick<OrganizationDeps, "db">, actor: ActorContext, organizationId: string, input: CreateStore): Promise<Store> {
  const db = deps.db;
  const member = await requireMember(db, actor, organizationId);
  enforce(needsPermission(member, "MANAGE_STORES"));
  const row = await db.transaction(async (tx) => {
    const [created] = await tx.insert(schema.companyStores).values({ organizationId, name: input.name, mode: input.mode, createdByUserId: member.userId }).returning();
    await recordAudit(tx, actor, { action: "store.created", summary: `Company store created: ${input.name}`, recordType: RECORD_TYPE, recordId: created!.id, after: { name: input.name, mode: input.mode } });
    return created!;
  });
  return storeView(deps, member, row, actor.now);
}

/**
 * Name, mode, routing and items (B2B-FR-080–082). Items are the
 * organization's approved templates; with COLLECTION routing each item names
 * the group collection made from that template that its picks join.
 * Procurement stores always order directly.
 */
export async function updateStore(deps: Pick<OrganizationDeps, "db">, actor: ActorContext, organizationId: string, id: string, input: UpdateStore): Promise<Store> {
  const db = deps.db;
  const member = await requireMember(db, actor, organizationId);
  enforce(needsPermission(member, "MANAGE_STORES"));
  const current = await loadStore(db, organizationId, id);
  if (current.status === "ARCHIVED") throw new AppError("RULE_FAILED", { message: "This store is archived.", context: { reason: "STORE_ARCHIVED" } });
  const refuse = (field: string, message: string): never => {
    throw new AppError("VALIDATION_FAILED", { fieldErrors: { [field]: message } });
  };
  if (input.mode === "PROCUREMENT" && input.routing === "COLLECTION") refuse("routing", "Procurement orders go straight to an order. Use self-order to send picks to a group collection.");
  const ids = input.items.map((item) => item.templateId);
  if (new Set(ids).size !== ids.length) refuse("items", "Each template can be in the store once.");
  const templates = new Map((await templatesFor(db, member, ids)).map((entry) => [entry.template.id, entry.template]));
  const collectionIds = input.items.flatMap((item) => (item.collectionId ? [item.collectionId] : []));
  const collections = collectionIds.length
    ? await db.select().from(schema.groupCollections).where(and(inArray(schema.groupCollections.id, collectionIds), eq(schema.groupCollections.organizationId, organizationId)))
    : [];
  // An item already in the store may stay while its template is under review (it shows as unavailable); new ones must be approved.
  const kept = new Set((await itemsOf(db, [id])).map((item) => item.templateId));
  input.items.forEach((item, index) => {
    const template = templates.get(item.templateId);
    if (!template) return refuse(`items.${index}.templateId`, "Choose one of your organization's templates.");
    if (template.status === "ARCHIVED" || (template.status !== "APPROVED" && !kept.has(item.templateId))) refuse(`items.${index}.templateId`, "Only approved templates can go in a store.");
    if (input.routing !== "COLLECTION") return;
    const collection = collections.find((row) => row.id === item.collectionId);
    if (!collection) return refuse(`items.${index}.collectionId`, "Choose the group collection this item's picks join.");
    if (collection.templateId !== item.templateId) refuse(`items.${index}.collectionId`, "Choose a group collection made from this template.");
    if (collection.status === "CANCELLED") refuse(`items.${index}.collectionId`, "That collection was cancelled.");
  });
  const row = await db.transaction(async (tx) => {
    const locked = await loadStore(tx, organizationId, id, { lock: true });
    if (locked.version !== input.version) throw new AppError("VERSION_CONFLICT", { context: { currentVersion: locked.version } });
    const [updated] = await tx
      .update(schema.companyStores)
      .set({ name: input.name, mode: input.mode, routing: input.routing, version: locked.version + 1, updatedAt: actor.now })
      .where(eq(schema.companyStores.id, id))
      .returning();
    await tx.delete(schema.companyStoreItems).where(eq(schema.companyStoreItems.storeId, id));
    if (input.items.length) {
      await tx
        .insert(schema.companyStoreItems)
        .values(input.items.map((item, position) => ({ storeId: id, templateId: item.templateId, position, collectionId: input.routing === "COLLECTION" ? item.collectionId : null })));
    }
    await recordAudit(tx, actor, {
      action: "store.updated",
      summary: `Company store updated: ${input.name}`,
      recordType: RECORD_TYPE,
      recordId: id,
      before: { name: locked.name, mode: locked.mode, routing: locked.routing },
      after: { name: input.name, mode: input.mode, routing: input.routing, items: input.items.length },
    });
    return updated!;
  });
  return storeView(deps, member, row, actor.now);
}

const TRANSITIONS: Record<"activate" | "pause" | "archive", { from: StoreStatus[]; to: StoreStatus; verb: string }> = {
  activate: { from: ["DRAFT", "PAUSED"], to: "ACTIVE", verb: "opened" },
  pause: { from: ["ACTIVE"], to: "PAUSED", verb: "paused" },
  archive: { from: ["DRAFT", "ACTIVE", "PAUSED"], to: "ARCHIVED", verb: "archived" },
};

/** DRAFT → ACTIVE ⇄ PAUSED → ARCHIVED (TECH-01 §4). Opening needs at least one item, and each collection item its collection. */
export async function changeStore(deps: Pick<OrganizationDeps, "db">, actor: ActorContext, organizationId: string, id: string, action: keyof typeof TRANSITIONS, version: number): Promise<Store> {
  const db = deps.db;
  const member = await requireMember(db, actor, organizationId);
  enforce(needsPermission(member, "MANAGE_STORES"));
  const { from, to, verb } = TRANSITIONS[action];
  const row = await db.transaction(async (tx) => {
    const current = await loadStore(tx, organizationId, id, { lock: true });
    if (current.version !== version) throw new AppError("VERSION_CONFLICT", { context: { currentVersion: current.version } });
    if (!from.includes(current.status)) throw new AppError("RULE_FAILED", { message: `This store is ${current.status.toLowerCase()}, so it can't be ${verb}.`, context: { reason: "WRONG_STATUS", status: current.status } });
    if (to === "ACTIVE") {
      const items = await itemsOf(tx, [id]);
      if (!items.length) throw new AppError("RULE_FAILED", { message: "Add at least one approved template before opening the store.", context: { reason: "NO_ITEMS" } });
      if (current.mode === "SELF_ORDER" && current.routing === "COLLECTION" && items.some((item) => !item.collectionId)) {
        throw new AppError("RULE_FAILED", { message: "Choose the group collection for every item first.", context: { reason: "COLLECTION_MISSING" } });
      }
    }
    const [updated] = await tx.update(schema.companyStores).set({ status: to, version: current.version + 1, updatedAt: actor.now }).where(eq(schema.companyStores.id, id)).returning();
    await recordAudit(tx, actor, { action: `store.${action}d`, summary: `Company store ${verb}: ${current.name}`, recordType: RECORD_TYPE, recordId: id, before: { status: current.status }, after: { status: to } });
    return updated!;
  });
  return storeView(deps, member, row, actor.now);
}

/** An open store in the right mode, holding these templates. */
async function orderable(db: Database, actor: ActorContext, organizationId: string, id: string, mode: Row["mode"], templateIds: readonly string[]) {
  const member = await requireMember(db, actor, organizationId);
  const store = await loadStore(db, organizationId, id);
  if (!canSee(member, store)) throw new AppError("NOT_FOUND");
  // Buyers order for a location; any member picks for themselves in a self-order store (owner, 2026-10-19).
  if (mode === "PROCUREMENT") enforce(needsPermission(member, "CREATE_REQUESTS"));
  if (store.status !== "ACTIVE") throw new AppError("RULE_FAILED", { message: store.status === "PAUSED" ? "This store is paused. Try again later." : "This store isn't open.", context: { reason: "STORE_NOT_OPEN", status: store.status } });
  if (store.mode !== mode) throw new AppError("RULE_FAILED", { message: "This store doesn't take that kind of order.", context: { reason: "WRONG_MODE" } });
  const items = await itemsOf(db, [id]);
  for (const templateId of templateIds) if (!items.some((item) => item.templateId === templateId)) throw new AppError("NOT_FOUND");
  return { member, store, items };
}

const MESSAGES: Record<StoreOrderResult["route"], string> = {
  APPROVAL: "Sent for approval. Nothing is ordered until an approver says yes.",
  CHECKOUT: "Added to your cart at today's price.",
  QUOTE: "Sent to HolyPearls for a quote.",
  COLLECTION: "",
};

/**
 * A procurement order (B2B-FR-081; Pen 77): several items for one location,
 * each with only the choices its template allows (B2B-FR-083). Every line is
 * checked before anything is made, then they follow the template-order route
 * together: one order request over the organization's rule, otherwise the
 * cart or one quote request.
 */
export async function orderFromStore(deps: OrganizationDeps, actor: ActorContext, organizationId: string, id: string, input: StoreProcurement): Promise<StoreOrderResult> {
  const db = deps.db;
  const templateIds = input.lines.map((line) => line.templateId);
  if (new Set(templateIds).size !== templateIds.length) throw new AppError("VALIDATION_FAILED", { fieldErrors: { lines: "Each item once, with its full quantity." } });
  const { member, store } = await orderable(db, actor, organizationId, id, "PROCUREMENT", templateIds);
  const checked = [];
  for (const line of input.lines) checked.push({ line, ...(await templateLine(db, actor, organizationId, line.templateId, { locationId: input.locationId, choices: {}, quantity: line.quantity })) });
  const lines: PlacedLine[] = [];
  for (const { line, template, sourceConfigurationId, controls } of checked) {
    lines.push({ template, draft: await configurationFromTemplate(db, actor, { sourceConfigurationId, choices: {}, quantity: line.quantity, controls }), choices: {}, quantity: line.quantity });
  }
  const placed = await placeTemplateLines(deps, actor, member, {
    organizationId,
    locationId: input.locationId,
    lines,
    title: `${store.name}: ${lines.map((line) => `${line.template.name} × ${line.quantity.toLocaleString("en-NG")}`).join(", ")}`,
    note: `Ordered from ${store.name}.`,
    origin: { storeId: store.id, storeName: store.name, mode: store.mode },
  });
  return { route: placed.route, next: placed.next, reference: placed.reference, message: MESSAGES[placed.route] };
}

/**
 * An employee's pick (B2B-FR-081–083; Pen 32, 78; Journeys 9–10). The same
 * screen and request either way; the store's routing decides the record:
 * INDIVIDUAL makes the employee's own order for their branch (template-order
 * route), COLLECTION adds them, sent, to the item's group collection, which
 * creates no order until the organizer reviews it.
 */
export async function pickFromStore(deps: OrganizationDeps, actor: ActorContext, organizationId: string, id: string, input: StorePick): Promise<StoreOrderResult> {
  if (actor.type !== "user") throw new AppError("NOT_SIGNED_IN");
  const db = deps.db;
  const { member, store, items } = await orderable(db, actor, organizationId, id, "SELF_ORDER", [input.templateId]);
  const view = (await storeView(deps, member, store, actor.now)).items.find((item) => item.templateId === input.templateId);
  if (!view) throw new AppError("NOT_FOUND");
  if (view.unavailable) throw new AppError("RULE_FAILED", { message: view.unavailable, context: { reason: "ITEM_UNAVAILABLE" } });
  const { answers } = input;

  if (store.routing === "COLLECTION") {
    const collectionId = items.find((item) => item.templateId === input.templateId)!.collectionId!;
    const { participantId, collection } = await submitFromStore(deps, actor, collectionId, { answers, storeName: store.name });
    await recordAudit(db, actor, { action: "store.picked", summary: `Picked ${view.name} in ${store.name}`, recordType: RECORD_TYPE, recordId: store.id, after: { templateId: input.templateId, participantId, collectionId } });
    return { route: "COLLECTION", next: `/collections/submissions/${participantId}`, reference: null, message: `Added to ${collection.title}. You'll get a copy by email.` };
  }

  // Individual: only the fields the template leaves open, and a branch that's theirs (B2B-FR-083).
  const refuse = (field: string, message: string): never => {
    throw new AppError("VALIDATION_FAILED", { fieldErrors: { [`answers.${field}`]: message } });
  };
  if (answers.sizeUnsure || answers.quantity !== null || answers.colour) refuse(answers.sizeUnsure ? "size" : answers.colour ? "colour" : "quantity", "This item doesn't offer that choice.");
  if (view.fields.includes("SIZE") ? !answers.size || !view.sizes.includes(answers.size) : answers.size) refuse("size", view.fields.includes("SIZE") ? "Choose your size." : "This item has no sizes.");
  if (answers.personalization && !view.fields.includes("PERSONALIZATION")) refuse("personalization", "Names aren't offered on this item.");
  if (!answers.branchLocationId || !view.branches.some((branch) => branch.id === answers.branchLocationId)) refuse("branchLocationId", "Choose your branch.");
  const { template, sourceConfigurationId, controls } = await templateLine(db, actor, organizationId, input.templateId, { locationId: answers.branchLocationId!, choices: {}, quantity: 1 }, { anyMember: true });
  const draft = await configurationForGroup(db, actor, {
    sourceConfigurationId,
    quantity: 1,
    sizes: answers.size ? [{ size: answers.size, quantity: 1 }] : [],
    people: [{ name: answers.personalization, size: answers.size }],
    controls,
  });

  // The allowance (B2B-FR-084): within it the organization pays; over it, or with no price yet, an approver decides (Pen 78 C).
  const estimate = draft.price?.totalMinor ? BigInt(draft.price.totalMinor) : null;
  const money = (minor: bigint) => displayMoney(minor, draft.price?.currency ?? "NGN");
  // Check and reserve together: the store's allowance row is locked, so two picks at once can't both spend the same balance.
  // ponytail: one lock per store serializes all its picks; lock per member if picks ever queue behind each other.
  const { allowance, overNote, entryId } = await db.transaction(async (tx) => {
    await tx.select({ storeId: schema.allowancePolicies.storeId }).from(schema.allowancePolicies).where(eq(schema.allowancePolicies.storeId, store.id)).for("update");
    const found = await allowanceFor(tx, store.id, member, actor.now);
    const label = found?.policy.name.toLowerCase() ?? "";
    const note = !found
      ? null
      : estimate === null
        ? `This item has no price yet, so ${actor.session.name}'s ${label} can't cover it without approval.`
        : estimate > found.limit
          ? found.policy.kind === "PER_ORDER"
            ? `This order is ${money(estimate - found.limit)} over the ${money(found.limit)} per-order ${label}.`
            : `This order is ${money(estimate - found.limit)} over ${actor.session.name}'s ${label} (${money(found.limit)} left).`
          : null;
    const [entry] = found?.periodStart
      ? await tx
          .insert(schema.allowanceLedger)
          .values({ storeId: store.id, membershipId: member.membershipId, periodStart: found.periodStart, amountMinor: estimate ?? 0n, configurationId: draft.id })
          .returning({ id: schema.allowanceLedger.id })
      : [];
    return { allowance: found, overNote: note, entryId: entry?.id ?? null };
  });
  const label = allowance?.policy.name.toLowerCase() ?? "";
  const placed = await placeTemplateLines(deps, actor, member, {
    organizationId,
    locationId: answers.branchLocationId!,
    lines: [{ template, draft, choices: {}, quantity: 1 }],
    title: `${template.name} for ${actor.session.name}`,
    note: `Ordered by ${actor.session.name} from ${store.name}${allowance ? `, from their ${label}` : ""}.`,
    origin: { storeId: store.id, storeName: store.name, mode: store.mode },
    ...(allowance ? { allowance: { overNote } } : {}),
  }).catch(async (error: unknown) => {
    // Nothing was placed, so the reservation goes.
    if (entryId) await db.delete(schema.allowanceLedger).where(eq(schema.allowanceLedger.id, entryId));
    throw error;
  });
  if (entryId && placed.orderRequestId) await db.update(schema.allowanceLedger).set({ orderRequestId: placed.orderRequestId }).where(eq(schema.allowanceLedger.id, entryId));
  const message =
    overNote && estimate !== null
      ? `This order is ${money(estimate - allowance!.limit)} over your allowance, so it went to your manager to approve.`
      : overNote
        ? "This item has no price yet, so it went to your manager to approve."
        : allowance
          ? `Paid from your ${label}. HolyPearls will confirm the price with ${member.organizationName}.`
          : MESSAGES[placed.route];
  return { route: placed.route, next: placed.next, reference: placed.reference, message };
}
