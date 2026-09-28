import type { AnswerConflict, Configuration } from "@holypearls/contracts";
import { and, asc, type Database, eq, inArray, schema, sql } from "@holypearls/db";
import { createHash } from "node:crypto";
import { AppError } from "../errors.js";
import type { ActorContext } from "../identity/actor.js";
import { createGuestLink, ensureCustomer, maskEmail } from "../identity/customers.js";
import { type NotificationDeps, queueEmail } from "../platform/notifications.js";
import { priceProduct, pricingInputs, productOptions } from "./pricing.js";

/*
 * Configuration drafts (T03-03, COM-FR-010–014).
 *
 * Who may open a draft: the account that owns it, the browser that started it
 * (its device key, sent as an HttpOnly cookie and stored hashed), or a guest
 * whose link session targets it. Anyone else gets 404, the same as a missing
 * draft (TECH-03 §12).
 */

type Row = typeof schema.configurations.$inferSelect;
const hash = (value: string) => createHash("sha256").update(value).digest("base64url");

export interface DraftAccess {
  actor: ActorContext;
  /** The browser's device key from its cookie, if any. */
  deviceKey: string | null;
}

export function canOpenDraft(access: DraftAccess, row: Row): boolean {
  const { actor, deviceKey } = access;
  if (actor.type === "user" && row.ownerUserId === actor.session.userId) return true;
  if (actor.type === "guest" && actor.guest.targetType === "CONFIGURATION" && actor.guest.targetId === row.id) return true;
  return Boolean(deviceKey && row.ownerDeviceHash && row.ownerDeviceHash === hash(deviceKey));
}

async function load(db: Database, access: DraftAccess, id: string): Promise<Row> {
  const [row] = await db.select().from(schema.configurations).where(eq(schema.configurations.id, id));
  if (!row || !canOpenDraft(access, row)) throw new AppError("NOT_FOUND");
  return row;
}

async function selections(db: Database, id: string) {
  const rows = await db
    .select()
    .from(schema.configurationSelections)
    .where(eq(schema.configurationSelections.configurationId, id))
    .orderBy(asc(schema.configurationSelections.position));
  return rows;
}

async function view(db: Database, row: Row): Promise<Configuration> {
  const [product] = await db.select({ slug: schema.products.slug, name: schema.products.name }).from(schema.products).where(eq(schema.products.id, row.productId));
  const chosen = await selections(db, row.id);
  const [price] = row.lastPriceResultId ? await db.select().from(schema.priceResults).where(eq(schema.priceResults.id, row.lastPriceResultId)) : [];
  const [customer] = row.customerId ? await db.select({ email: schema.customers.email }).from(schema.customers).where(eq(schema.customers.id, row.customerId)) : [];
  return {
    id: row.id,
    productSlug: product!.slug,
    productName: product!.name,
    status: row.status,
    choices: Object.fromEntries(chosen.map((item) => [item.optionKey, item.valueKey])),
    quantity: row.quantity,
    rush: row.rush,
    artwork: row.artwork,
    step: row.step,
    version: row.version,
    price: price ? { ...(price.result as Configuration["price"] & object), id: price.id } : null,
    emailedTo: customer ? maskEmail(customer.email) : null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Which later answers a change removes (COM-FR-011). The answers the customer
 * just changed win; an existing answer that a "not allowed" rule now forbids,
 * or a value the product no longer offers, is listed so the customer can
 * confirm before it goes.
 */
export function conflictsAfterChange(
  current: Record<string, string>,
  changed: Record<string, string | null>,
  options: { key: string; values: { key: string }[] }[],
  rules: { ifOption: string; ifValue: string; thenOption: string; thenValues: string[]; effect: string; message: string }[],
): { next: Record<string, string>; conflicts: AnswerConflict[]; invalidChange: AnswerConflict | null } {
  const next: Record<string, string> = { ...current };
  for (const [option, value] of Object.entries(changed)) {
    if (value === null) delete next[option];
    else next[option] = value;
  }
  const conflicts: AnswerConflict[] = [];
  let invalidChange: AnswerConflict | null = null;
  for (const [option, value] of Object.entries(next)) {
    const definition = options.find((item) => item.key === option);
    if (!definition || !definition.values.some((item) => item.key === value)) {
      const conflict = { option, value, message: `That ${option} isn't available any more.` };
      if (option in changed) invalidChange ??= conflict;
      else conflicts.push(conflict);
    }
  }
  for (const rule of rules) {
    if (rule.effect !== "NOT_ALLOWED" || next[rule.ifOption] !== rule.ifValue) continue;
    const other = next[rule.thenOption];
    if (other === undefined || !rule.thenValues.includes(other)) continue;
    // The side the customer didn't just change is the one that goes.
    if (rule.thenOption in changed && !(rule.ifOption in changed)) invalidChange ??= { option: rule.thenOption, value: other, message: rule.message };
    else if (!conflicts.some((item) => item.option === rule.thenOption)) conflicts.push({ option: rule.thenOption, value: other, message: rule.message });
  }
  for (const conflict of conflicts) delete next[conflict.option];
  return { next, conflicts, invalidChange };
}

async function writeSelections(tx: Parameters<Parameters<Database["transaction"]>[0]>[0], id: string, before: Record<string, string>, next: Record<string, string>, order: string[]) {
  const removed = Object.keys(before).filter((option) => !(option in next));
  if (removed.length) {
    await tx
      .delete(schema.configurationSelections)
      .where(and(eq(schema.configurationSelections.configurationId, id), inArray(schema.configurationSelections.optionKey, removed)));
  }
  for (const [option, value] of Object.entries(next)) {
    if (before[option] === value) continue;
    await tx
      .insert(schema.configurationSelections)
      .values({ configurationId: id, optionKey: option, valueKey: value, position: Math.max(0, order.indexOf(option)) })
      .onConflictDoUpdate({ target: [schema.configurationSelections.configurationId, schema.configurationSelections.optionKey], set: { valueKey: value } });
  }
}

/** Starts a draft for a published product, owned by the account or by this browser. */
export async function createDraft(
  db: Database,
  access: DraftAccess,
  input: { productSlug: string; choices?: Record<string, string>; quantity?: number },
): Promise<{ draft: Configuration; newDeviceKey: string | null }> {
  const [product] = await db
    .select({ id: schema.products.id, buyingMode: schema.products.buyingMode })
    .from(schema.products)
    .where(and(eq(schema.products.slug, input.productSlug), eq(schema.products.status, "PUBLISHED")));
  if (!product) throw new AppError("NOT_FOUND");
  if (product.buyingMode === "CONSULTATIVE_PROJECT") {
    throw new AppError("RULE_FAILED", { message: "This product is planned with our team. Start a project instead.", context: { reason: "CONSULTATION_PRODUCT" } });
  }
  const { actor } = access;
  let deviceKey = access.deviceKey;
  let newDeviceKey: string | null = null;
  if (actor.type !== "user" && actor.type !== "guest" && !deviceKey) {
    deviceKey = crypto.randomUUID() + crypto.randomUUID();
    newDeviceKey = deviceKey;
  }
  const options = await productOptions(db, product.id);
  const rules = (await pricingInputs(db, product.id, { choices: {}, quantity: 1, rush: "STANDARD", sample: false }, actor.now)).compatibility;
  const { next, conflicts, invalidChange } = conflictsAfterChange({}, input.choices ?? {}, options, rules);
  if (invalidChange || conflicts.length) {
    throw new AppError("VALIDATION_FAILED", { fieldErrors: { choices: (invalidChange ?? conflicts[0])!.message } });
  }
  const id = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(schema.configurations)
      .values({
        productId: product.id,
        ownerUserId: actor.type === "user" ? actor.session.userId : null,
        ownerDeviceHash: actor.type === "user" || !deviceKey ? null : hash(deviceKey),
        customerId: actor.type === "guest" ? actor.guest.customerId : null,
        quantity: input.quantity ?? null,
      })
      .returning({ id: schema.configurations.id });
    await writeSelections(tx, row!.id, {}, next, options.map((option) => option.key));
    return row!.id;
  });
  const priced = await reprice(db, id, actor.now);
  return { draft: await view(db, priced), newDeviceKey };
}

/** Prices the draft's current answers and remembers the saved result (TECH-01 price_results). */
async function reprice(db: Database, id: string, at: Date): Promise<Row> {
  const [row] = await db.select().from(schema.configurations).where(eq(schema.configurations.id, id));
  const chosen = Object.fromEntries((await selections(db, id)).map((item) => [item.optionKey, item.valueKey]));
  if (!row!.quantity) return row!;
  const result = await priceProduct(db, row!.productId, { choices: chosen, quantity: row!.quantity, rush: row!.rush, sample: false }, at);
  const [updated] = await db.update(schema.configurations).set({ lastPriceResultId: result.id }).where(eq(schema.configurations.id, id)).returning();
  return updated!;
}

export async function getDraft(db: Database, access: DraftAccess, id: string) {
  return view(db, await load(db, access, id));
}

/**
 * Autosave (COM-FR-012). Versioned: an older version is refused with the
 * latest draft (TECH-02 §5). A change that removes later answers is refused
 * with the list unless the customer confirmed it (COM-FR-011).
 */
export async function updateDraft(
  db: Database,
  access: DraftAccess,
  id: string,
  patch: {
    version: number;
    choices?: Record<string, string | null>;
    quantity?: number | null;
    rush?: "STANDARD" | "RUSH" | "PRIORITY";
    artwork?: "UPLOAD" | "DESIGN_HELP" | "LATER" | null;
    step?: string;
    confirmRemovals: boolean;
  },
) {
  const row = await load(db, access, id);
  if (row.status !== "DRAFT") throw new AppError("CONFLICT", { message: "This design is no longer a draft.", context: { reason: "NOT_DRAFT" } });
  if (row.version !== patch.version) throw new AppError("VERSION_CONFLICT", { context: { latest: await view(db, row) } });

  const options = await productOptions(db, row.productId);
  const rules = (await pricingInputs(db, row.productId, { choices: {}, quantity: 1, rush: "STANDARD", sample: false }, access.actor.now)).compatibility;
  const before = Object.fromEntries((await selections(db, id)).map((item) => [item.optionKey, item.valueKey]));
  const { next, conflicts, invalidChange } = conflictsAfterChange(before, patch.choices ?? {}, options, rules);
  if (invalidChange) throw new AppError("VALIDATION_FAILED", { fieldErrors: { [`choices.${invalidChange.option}`]: invalidChange.message } });
  if (conflicts.length && !patch.confirmRemovals) {
    throw new AppError("RULE_FAILED", {
      message: "This change removes answers you gave later. Review them before we remove them.",
      context: { reason: "ANSWERS_CONFLICT", conflicts },
    });
  }

  const saved = await db.transaction(async (tx) => {
    const rows = await tx
      .update(schema.configurations)
      .set({
        ...(patch.quantity !== undefined && { quantity: patch.quantity }),
        ...(patch.rush && { rush: patch.rush }),
        ...(patch.artwork !== undefined && { artwork: patch.artwork }),
        ...(patch.step && { step: patch.step }),
        version: sql`${schema.configurations.version} + 1`,
      })
      .where(and(eq(schema.configurations.id, id), eq(schema.configurations.version, patch.version)))
      .returning({ id: schema.configurations.id });
    if (!rows.length) return false;
    await writeSelections(tx, id, before, next, options.map((option) => option.key));
    return true;
  });
  if (!saved) throw new AppError("VERSION_CONFLICT", { context: { latest: await view(db, await load(db, access, id)) } });
  return { draft: await view(db, await reprice(db, id, access.actor.now)), removed: conflicts };
}

/**
 * Emails a link to this draft (COM-FR-012), so a guest can come back on any
 * device. The link opens a guest session scoped to this draft.
 */
export async function emailDraftLink(deps: NotificationDeps & { webOrigin: string }, access: DraftAccess, id: string, email: string) {
  const row = await load(deps.db, access, id);
  const [product] = await deps.db.select({ name: schema.products.name }).from(schema.products).where(eq(schema.products.id, row.productId));
  await deps.db.transaction(async (tx) => {
    const customer = await ensureCustomer(tx, { email, userId: access.actor.type === "user" ? access.actor.session.userId : null });
    await tx.update(schema.configurations).set({ customerId: customer.id }).where(eq(schema.configurations.id, id));
    const link = await createGuestLink(tx, deps.webOrigin, { purpose: "CONFIGURATION", targetType: "CONFIGURATION", targetId: id, customerId: customer.id, now: access.actor.now });
    await queueEmail(deps, tx, {
      template: "guest_link",
      to: email,
      customerId: customer.id,
      data: { url: link.url, what: `saved ${product!.name.toLowerCase()} design` },
      record: { type: "CONFIGURATION", id, label: product!.name },
      linkLabel: "Opens the saved design",
      requestId: access.actor.requestId,
    });
  });
  return view(deps.db, await load(deps.db, access, id));
}
