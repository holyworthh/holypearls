import { quoteGuestIncludesSource } from "../quotes/customer.js";
import type { SQL } from "@holypearls/db";
import type { AccountDraft, AnswerConflict, Configuration } from "@holypearls/contracts";
import { and, asc, type Database, desc, eq, inArray, isNull, schema, sql } from "@holypearls/db";
import { AppError } from "../errors.js";
import type { ActorContext } from "../identity/actor.js";
import { createGuestLink, customersForContact, ensureAccountCustomer, maskEmail, sha256, startGuestSession } from "../identity/customers.js";
import { type NotificationDeps, queueEmail } from "../platform/notifications.js";
import { findFileForActor } from "../files/files.js";
import { configurationOrderAccess } from "../orders/orders.js";
import { canSeeOrganizationRecord, organizationAccessWhere } from "../organizations/scope.js";
import { cancelCheckoutPayments, checkoutsWithActivePayment, paymentInProgress } from "../payments/payments.js";
import type { StorageAdapter } from "@holypearls/storage";
import { type CalculationInput } from "./calculate.js";
import { insertConfigurationCopy } from "./copies.js";
import { type Capabilities, garmentChoices, unavailableGarmentChoices } from "./capabilities.js";
import { installationSetup } from "../sales/installation.js";
import { areaSqM, type FamilyDetails, familyAdjustments, timingAdjustments, timingFor } from "./families.js";
import { installationAdjustments } from "./installation.js";
import { checkPersonalizationCsv, type Placement, placementConflicts, resolutionCheck } from "./garment.js";
import { placementBlocks } from "../catalogue/garment-data.js";
import { currentPriceRule, currentTaxSetting } from "../catalogue/rules.js";
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

export interface DraftAccess {
  actor: ActorContext;
  /** The browser's device key from its cookie, if any. */
  deviceKey: string | null;
}

/**
 * A design in the cart changed or left it: an open checkout holding the old
 * copy is closed, so the customer can never pay for something other than
 * what they now have (TECH-05 §1). The next "Check out" starts afresh.
 */
export async function closeCheckoutsWith(db: Database | Tx, configurationId: string) {
  const holding = and(eq(schema.checkouts.status, "OPEN"), sql`${configurationId}::uuid = any(${schema.checkouts.configurationIds})`);
  const open = await db.select({ id: schema.checkouts.id }).from(schema.checkouts).where(holding);
  // A design being paid for can't change until the payment finishes (T04-03).
  if ((await checkoutsWithActivePayment(db, open.map((row) => row.id))).length) throw paymentInProgress();
  const closed = await db.update(schema.checkouts).set({ status: "ABANDONED" }).where(holding).returning({ id: schema.checkouts.id });
  await cancelCheckoutPayments(db, closed.map((row) => row.id));
}

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Every change to what would be made goes through here (review P1-05):
 * choices, sizes, placements, artwork added or removed, the low-resolution
 * decision and personalisation. It raises the version and the change time
 * (the cart refreshes its copy from that), and closes an open checkout that
 * holds the design's older copy. With `expectedVersion` it only changes a
 * design still at that version, and says whether it did.
 */
export async function touchOrderableConfiguration(tx: Tx, id: string, options: { expectedVersion?: number } = {}): Promise<boolean> {
  const rows = await tx
    .update(schema.configurations)
    // Any change to what is made turns an exact reorder into a reorder with changes (FUL-FR-061–062).
    .set({ version: sql`${schema.configurations.version} + 1`, reorderExact: false, updatedAt: new Date() })
    .where(options.expectedVersion === undefined ? eq(schema.configurations.id, id) : and(eq(schema.configurations.id, id), eq(schema.configurations.version, options.expectedVersion)))
    .returning({ status: schema.configurations.status });
  if (!rows.length) return false;
  if (rows[0]!.status === "IN_CART") await closeCheckoutsWith(tx, id);
  return true;
}

export function canOpenDraft(access: DraftAccess, row: Row): boolean {
  const { actor, deviceKey } = access;
  if (actor.type === "user" && row.ownerUserId === actor.session.userId) return true;
  if (actor.type === "guest" && actor.guest.targetType === "CONFIGURATION" && actor.guest.targetId === row.id) return true;
  return Boolean(deviceKey && row.ownerDeviceHash && row.ownerDeviceHash === sha256(deviceKey));
}

export async function canSeeConfigurationFile(db: Database, actor: ActorContext, id: string) {
  const [row] = await db.select().from(schema.configurations).where(eq(schema.configurations.id, id));
  if (!row) return false;
  if (await quoteGuestIncludesSource(db, actor, { configurationId: id })) return true;
  if (actor.type === "user" && actor.staff && (["QUOTE_MANAGE", "PROOF_MANAGE", "PRODUCTION_MANAGE", "CUSTOMER_SUPPORT"] as const).some(permission => actor.staff!.permissions.has(permission))) return true;
  const orderAccess = await configurationOrderAccess(db, actor, id);
  if (orderAccess !== null) return orderAccess;
  if (row.controls && actor.type !== "guest" && !(await canSeeOrganizationRecord(db, actor, { ...row.controls, ownerUserId: row.ownerUserId }))) return false;
  return canOpenDraft({ actor, deviceKey: null }, row);
}

/** Designs a customer started as a guest join the account once its email is verified (TECH-03 §6). */
export async function linkCustomerDrafts(db: Database, customerIds: string[], userId: string) {
  if (!customerIds.length) return;
  await db
    .update(schema.configurations)
    .set({ ownerUserId: userId })
    .where(and(inArray(schema.configurations.customerId, customerIds), isNull(schema.configurations.ownerUserId)));
}

/** The account's designs to resume, newest first (Pen frame 92). */
export async function accountDrafts(db: Database, userId: string, now: Date, limit = 5): Promise<AccountDraft[]> {
  const rows = await db
    .select()
    .from(schema.configurations)
    .where(and(eq(schema.configurations.ownerUserId, userId), eq(schema.configurations.status, "DRAFT"), organizationAccessWhere({
      organizationId: sql`(${schema.configurations.controls}->>'organizationId')::uuid`, locationId: sql`(${schema.configurations.controls}->>'locationId')::uuid`, ownerUserId: schema.configurations.ownerUserId,
    }, userId)))
    .orderBy(desc(schema.configurations.updatedAt))
    .limit(limit);
  return Promise.all(
    rows.map(async (row) => {
      const view = await draftView(db, row, now);
      return {
        kind: "CONFIGURATION" as const,
        id: row.id,
        title: view.productName,
        detail: view.quantity ? `${view.quantity.toLocaleString("en-NG")} units` : "Quantity not chosen yet",
        status: view.price?.state ?? "DRAFT",
        savedAt: row.updatedAt.toISOString(),
        href: `/configure/drafts/${row.id}`,
      };
    }),
  );
}

export async function loadDraft(db: Database, access: DraftAccess, id: string): Promise<Row> {
  const [row] = await db.select().from(schema.configurations).where(eq(schema.configurations.id, id));
  if (!row || !canOpenDraft(access, row)) throw new AppError("NOT_FOUND");
  if (row.controls && access.actor.type !== "guest" && !(await canSeeOrganizationRecord(db, access.actor, { ...row.controls, ownerUserId: row.ownerUserId }))) throw new AppError("NOT_FOUND");
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

const GARMENT_FAMILIES = new Set(["GARMENT"]);

async function placementsOf(db: Database, id: string): Promise<Placement[]> {
  const rows = await db.select().from(schema.configurationPlacements).where(eq(schema.configurationPlacements.configurationId, id));
  const order = ["LEFT_CHEST", "RIGHT_CHEST", "CENTRE_CHEST", "FULL_FRONT", "UPPER_BACK", "FULL_BACK", "LEFT_SLEEVE", "RIGHT_SLEEVE", "CUSTOM"];
  return rows
    .map(({ position, size, method, note }) => ({ position, size, method, note }))
    .sort((a, b) => order.indexOf(a.position) - order.indexOf(b.position));
}

async function sizesOf(db: Database, id: string) {
  const rows = await db.select().from(schema.configurationSizes).where(eq(schema.configurationSizes.configurationId, id));
  const order = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"];
  return rows.map(({ size, quantity }) => ({ size, quantity })).sort((a, b) => order.indexOf(a.size) - order.indexOf(b.size));
}

async function filesOf(db: Database, id: string, placements: Placement[]) {
  const rows = await db
    .select({ link: schema.configurationFiles, file: schema.files })
    .from(schema.configurationFiles)
    .innerJoin(schema.files, eq(schema.files.id, schema.configurationFiles.fileId))
    .where(eq(schema.configurationFiles.configurationId, id))
    .orderBy(asc(schema.configurationFiles.createdAt));
  return rows.map(({ link, file }) => {
    const meta = (file.metadata ?? {}) as { width?: number };
    const check = file.status === "READY" && (link.role === "ARTWORK" || link.role === "LOGO") ? resolutionCheck({ type: file.detectedType ?? file.declaredType, width: meta.width ?? null }, placements) : { ok: true as const };
    return {
      id: link.id,
      fileId: file.id,
      role: link.role,
      name: file.safeName,
      status: file.status,
      lowResolution: check.ok ? null : { neededPixels: check.neededPixels, actualPixels: check.actualPixels, message: check.message },
      lowResolutionAction: link.lowResolutionAction,
    };
  });
}

export async function draftView(db: Database, row: Row, now: Date): Promise<Configuration> {
  const [product] = await db
    .select({ slug: schema.products.slug, name: schema.products.name, family: schema.products.family, routes: schema.products.routes, decorations: schema.products.decorations })
    .from(schema.products)
    .where(eq(schema.products.id, row.productId));
  const [rules] = await db.select().from(schema.productRules).where(eq(schema.productRules.productId, row.productId));
  const placements = await placementsOf(db, row.id);
  const [quote] = await db
    .select({ reference: schema.quotes.reference, status: schema.quotes.status })
    .from(schema.quotes)
    .where(sql`${row.id}::uuid = any(${schema.quotes.configurationIds})`)
    .orderBy(desc(schema.quotes.createdAt))
    .limit(1);
  const personalization = await db
    .select()
    .from(schema.configurationPersonalizationRows)
    .where(eq(schema.configurationPersonalizationRows.configurationId, row.id))
    .orderBy(asc(schema.configurationPersonalizationRows.row));
  const chosen = await selections(db, row.id);
  const [price] = row.lastPriceResultId ? await db.select().from(schema.priceResults).where(eq(schema.priceResults.id, row.lastPriceResultId)) : [];
  const [customer] = row.customerId ? await db.select({ email: schema.customers.email }).from(schema.customers).where(eq(schema.customers.id, row.customerId)) : [];
  return {
    id: row.id,
    productSlug: product!.slug,
    productName: product!.name,
    family: product!.family,
    status: row.status,
    choices: Object.fromEntries(chosen.map((item) => [item.optionKey, item.valueKey])),
    quantity: row.quantity,
    rush: row.rush,
    artwork: row.artwork,
    step: row.step,
    version: row.version,
    price: price ? { ...(price.result as Configuration["price"] & object), id: price.id } : null,
    priceUpdate: row.previousTotalMinor !== null && price?.totalMinor != null ? { wasMinor: row.previousTotalMinor.toString(), nowMinor: price.totalMinor.toString(), currency: price.currency ?? "NGN" } : null,
    emailedTo: customer ? maskEmail(customer.email) : null,
    fromTemplate: row.controls ? { templateId: row.controls.templateId, organizationId: row.controls.organizationId, name: row.controls.name, editable: row.controls.editable } : null,
    garment: GARMENT_FAMILIES.has(product!.family)
      ? {
          sourcing: row.sourcing,
          decoration: row.decoration,
          details: row.details as NonNullable<Configuration["garment"]>["details"],
          sizesUnknown: row.sizesUnknown,
          sizes: await sizesOf(db, row.id),
          placements,
          conflicts: placementConflicts(placements, row.decoration, await placementBlocks(db)),
          personalization: {
            count: personalization.length,
            preview: personalization.slice(0, 5).map(({ row: number, name, number: shirt, department, size }) => ({ row: number, name, number: shirt, department, size })),
          },
          unavailable: unavailableGarmentChoices(product!, { sourcing: row.sourcing, decoration: row.decoration, placements }),
        }
      : null,
    files: await filesOf(db, row.id, placements),
    details: row.details as Configuration["details"],
    timing: timingFor(rules ?? null, row.rush, row.details as FamilyDetails, now),
    quote: quote ?? null,
    artworkLaterAllowed: rules?.artworkLater ?? true,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Price-state changes from garment, family and delivery answers (COM-FR-022–024, 045–047, 060, 072). */
async function adjustments(db: Database, row: Row, now: Date): Promise<NonNullable<CalculationInput["adjustments"]>> {
  const [product] = await db
    .select({ name: schema.products.name, family: schema.products.family, routes: schema.products.routes, decorations: schema.products.decorations })
    .from(schema.products)
    .where(eq(schema.products.id, row.productId));
  const [rules] = await db.select().from(schema.productRules).where(eq(schema.productRules.productId, row.productId));
  const details = row.details as FamilyDetails;
  const install =
    (product!.family === "LARGE_FORMAT" || product!.family === "WALL_ART") && details.service === "INSTALLATION"
      ? await installationSetup(db).then(({ areas, rules: installRules }) =>
          installationAdjustments(areas, installRules, {
            productId: row.productId,
            productName: product!.name,
            quantity: row.quantity ?? 1,
            state: details.installState,
            areaSqM: details.sizeMode === "CUSTOM" ? areaSqM(details.widthCm, details.heightCm) : null,
            date: details.installDate,
            now,
          }),
        )
      : [];
  const list: NonNullable<CalculationInput["adjustments"]> = [...familyAdjustments(product!.family, details), ...install, ...timingAdjustments(timingFor(rules ?? null, row.rush, details, now))];
  if (row.sourcing === "CUSTOMER_SUPPLIED") list.push({ state: "ESTIMATE_READY", code: "FINAL_AFTER_INSPECTION", message: "Your garments: the price is final after we inspect them." });
  if (row.sourcing === "MAKE_FROM_SCRATCH") list.push({ state: "QUOTE_REQUIRED", code: "MADE_TO_ORDER", message: "Made from scratch: we confirm the pattern, fabric and a sample first, then send a quote." });
  if (row.sourcing === "HELP_ME_CHOOSE") list.push({ state: "QUOTE_REQUIRED", code: "RECOMMENDATION", message: "We'll recommend the right garment and send a quote." });
  if (row.decoration === "RECOMMEND") list.push({ state: "ESTIMATE_READY", code: "RECOMMENDATION", message: "We'll recommend embroidery or print when we review your artwork." });
  const placements = await placementsOf(db, row.id);
  // A saved answer the product no longer offers blocks the quote until it's replaced; the answer itself is kept.
  if (GARMENT_FAMILIES.has(product!.family)) {
    for (const choice of unavailableGarmentChoices(product!, { sourcing: row.sourcing, decoration: row.decoration, placements })) {
      list.push({ state: "QUOTE_REQUIRED", code: "CHOICE_UNAVAILABLE", message: choice.message, blocking: true });
    }
  }
  if (placements.length > 1) list.push({ state: "ESTIMATE_READY", code: "EXTRA_PLACEMENTS", message: `${placements.length} placements: extra positions are confirmed in the final price.` });
  if (row.sizesUnknown) list.push({ state: "ESTIMATE_READY", code: "SIZES_UNKNOWN", message: "Sizes can be added later; the estimate uses your total quantity." });
  return list;
}

/**
 * Refuses a route, decoration or placement method the product doesn't offer
 * (COM-FR-020, 024). The product's stored capabilities are the rule; see
 * capabilities.ts. Only answers being changed are checked, so a saved answer
 * staff later removed never stops other answers from saving.
 */
export function checkGarmentPatch(
  product: Capabilities,
  patch: { sourcing?: Row["sourcing"]; decoration?: Row["decoration"]; placements?: Placement[] },
) {
  const allowed = garmentChoices(product);
  if (patch.sourcing && !allowed.sourcing.includes(patch.sourcing)) {
    throw new AppError("VALIDATION_FAILED", { fieldErrors: { sourcing: "This production route is not available for this product." } });
  }
  if (patch.decoration && !allowed.decoration.includes(patch.decoration)) {
    throw new AppError("VALIDATION_FAILED", { fieldErrors: { decoration: "This decoration method is not available for this product." } });
  }
  const placement = patch.placements?.find((item) => item.method && !allowed.decoration.includes(item.method));
  if (placement) {
    throw new AppError("VALIDATION_FAILED", { fieldErrors: { [`placements.${placement.position}`]: "This decoration method is not available for this product." } });
  }
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

/**
 * A design made from a company template (T11-01c; PRD-05 B2B-FR-031): only
 * the fields the template marks editable can change. Anything else is
 * refused, whichever screen or API call tries it.
 */
export function refuseLockedChange(row: Row, keys: readonly string[]) {
  if (!row.controls) return;
  const locked = keys.find((key) => !row.controls!.editable.includes(key));
  if (locked) {
    throw new AppError("RULE_FAILED", {
      message: `This is set by your company's template (${row.controls.name}) and can't be changed on this order.`,
      context: { reason: "LOCKED_FIELD", field: locked },
    });
  }
}

/** The template field keys a draft patch would change. */
function changedKeys(patch: Parameters<typeof updateDraft>[3]) {
  const keys = Object.keys(patch.choices ?? {}).map((key) => `option:${key}`);
  if (patch.quantity !== undefined) keys.push("quantity");
  if (patch.sizes || patch.sizesUnknown !== undefined) keys.push("sizes");
  for (const key of ["rush", "artwork", "sourcing", "decoration", "details", "placements"] as const) if (patch[key] !== undefined) keys.push(key);
  return keys;
}

/**
 * A new design from a template's saved configuration (T11-01c): the same
 * answers, files and placements, with the buyer's changes to editable fields
 * applied, owned by the buyer and marked with the template's controls.
 */
export async function configurationFromTemplate(
  db: Database,
  actor: ActorContext,
  input: { sourceConfigurationId: string; choices: Record<string, string>; quantity: number; controls: NonNullable<Row["controls"]> },
): Promise<Configuration> {
  if (actor.type !== "user") throw new AppError("NOT_SIGNED_IN");
  const [original] = await db.select().from(schema.configurations).where(eq(schema.configurations.id, input.sourceConfigurationId));
  if (!original) throw new AppError("NOT_FOUND");
  const options = await productOptions(db, original.productId);
  const rules = (await pricingInputs(db, original.productId, { choices: {}, quantity: 1, rush: "STANDARD", sample: false }, actor.now)).compatibility;
  const before = Object.fromEntries((await selections(db, original.id)).map((item) => [item.optionKey, item.valueKey]));
  const { next, conflicts, invalidChange } = conflictsAfterChange(before, input.choices, options, rules);
  if (invalidChange || conflicts.length) throw new AppError("VALIDATION_FAILED", { fieldErrors: { [`choices.${(invalidChange ?? conflicts[0])!.option}`]: (invalidChange ?? conflicts[0])!.message } });
  const id = await db.transaction(async (tx) => {
    const copy = await insertConfigurationCopy(tx, original, { ownerUserId: actor.session.userId, ownerDeviceHash: null, customerId: null, quantity: input.quantity, controls: input.controls });
    await writeSelections(tx, copy, before, next, options.map((option) => option.key));
    // Sizes from the original no longer add up to a new quantity: the buyer gives them per order.
    if (input.quantity !== original.quantity) await tx.delete(schema.configurationSizes).where(eq(schema.configurationSizes.configurationId, copy));
    return copy;
  });
  return draftView(db, await reprice(db, id, actor.now), actor.now);
}

/** Today's price for a template's configuration with the buyer's choices, without saving a design (frame 131 price panel). */
export async function previewTemplatePrice(db: Database, sourceConfigurationId: string, input: { choices: Record<string, string>; quantity: number }, at: Date) {
  const [original] = await db.select().from(schema.configurations).where(eq(schema.configurations.id, sourceConfigurationId));
  if (!original) throw new AppError("NOT_FOUND");
  const chosen = { ...Object.fromEntries((await selections(db, original.id)).map((item) => [item.optionKey, item.valueKey])), ...input.choices };
  const extra = (await adjustments(db, { ...original, sizesUnknown: false }, at)).filter((adjustment) => adjustment.code !== "SIZES_UNKNOWN");
  return priceProduct(db, original.productId, { choices: chosen, quantity: input.quantity, rush: "STANDARD", sample: false, adjustments: extra }, at);
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
        ownerDeviceHash: actor.type === "user" || !deviceKey ? null : sha256(deviceKey),
        customerId: actor.type === "guest" ? actor.guest.customerId : null,
        quantity: input.quantity ?? null,
      })
      .returning({ id: schema.configurations.id });
    await writeSelections(tx, row!.id, {}, next, options.map((option) => option.key));
    return row!.id;
  });
  const priced = await reprice(db, id, actor.now);
  return { draft: await draftView(db, priced, access.actor.now), newDeviceKey };
}

/** Prices the draft's current answers and remembers the saved result (TECH-01 price_results). */
export async function reprice(db: Database, id: string, at: Date): Promise<Row> {
  const [row] = await db.select().from(schema.configurations).where(eq(schema.configurations.id, id));
  const chosen = Object.fromEntries((await selections(db, id)).map((item) => [item.optionKey, item.valueKey]));
  const sizes = await sizesOf(db, id);
  const sized = sizes.reduce((sum, item) => sum + item.quantity, 0);
  const quantity = !row!.sizesUnknown && sized > 0 ? sized : row!.quantity;
  if (!quantity) return row!;
  const result = await priceProduct(db, row!.productId, { choices: chosen, quantity, rush: row!.rush, sample: false, adjustments: await adjustments(db, row!, at) }, at);
  const [updated] = await db.update(schema.configurations).set({ lastPriceResultId: result.id }).where(eq(schema.configurations.id, id)).returning();
  return updated!;
}

export async function getDraft(db: Database, access: DraftAccess, id: string) {
  const row = await loadDraft(db, access, id);
  return draftView(db, row.status === "DRAFT" ? await repriceIfRulesChanged(db, row, access.actor.now) : row, access.actor.now);
}

/**
 * OPS-FR-130: a draft opened after its price, product rules or VAT changed is
 * repriced, and keeps the total it had so the customer sees "Price updated ·
 * was … now …" until they change something. Accepted quotes and orders keep
 * their saved copies and are never repriced.
 */
async function repriceIfRulesChanged(db: Database, row: Row, at: Date): Promise<Row> {
  if (!row.lastPriceResultId) return row;
  const [last] = await db.select().from(schema.priceResults).where(eq(schema.priceResults.id, row.lastPriceResultId));
  if (!last) return row;
  const [rule, tax, [rules]] = await Promise.all([
    currentPriceRule(db, row.productId, at),
    currentTaxSetting(db, at),
    db.select({ version: schema.productRules.version }).from(schema.productRules).where(eq(schema.productRules.productId, row.productId)),
  ]);
  if (last.priceRuleId === (rule?.id ?? null) && last.taxSettingId === (tax?.id ?? null) && last.productRulesVersion === (rules?.version ?? null)) return row;
  const updated = await reprice(db, row.id, at);
  const [now] = updated.lastPriceResultId ? await db.select({ totalMinor: schema.priceResults.totalMinor }).from(schema.priceResults).where(eq(schema.priceResults.id, updated.lastPriceResultId)) : [];
  // The first total the customer saw is kept across several changes until they change the design.
  if (row.previousTotalMinor === null && last.totalMinor !== null && now?.totalMinor !== last.totalMinor) {
    const [noted] = await db.update(schema.configurations).set({ previousTotalMinor: last.totalMinor }).where(eq(schema.configurations.id, row.id)).returning();
    return noted!;
  }
  return updated;
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
    artwork?: "UPLOAD" | "LOGO" | "REFERENCE" | "DESIGN_HELP" | "LATER" | null;
    step?: string;
    sourcing?: Row["sourcing"];
    decoration?: Row["decoration"];
    details?: Record<string, unknown>;
    sizesUnknown?: boolean;
    sizes?: { size: string; quantity: number }[];
    placements?: Placement[];
    confirmRemovals: boolean;
  },
) {
  const row = await loadDraft(db, access, id);
  // A design in the cart stays editable; the cart picks up the change (T04-01 "edit returns to configuration").
  if (row.status !== "DRAFT" && row.status !== "IN_CART") throw new AppError("CONFLICT", { message: "This design is no longer a draft.", context: { reason: "NOT_DRAFT" } });
  if (row.version !== patch.version) throw new AppError("VERSION_CONFLICT", { context: { latest: await draftView(db, row, access.actor.now) } });
  refuseLockedChange(row, changedKeys(patch));
  if (patch.sourcing || patch.decoration || patch.placements) {
    const [capabilities] = await db.select({ routes: schema.products.routes, decorations: schema.products.decorations }).from(schema.products).where(eq(schema.products.id, row.productId));
    checkGarmentPatch(capabilities!, patch);
  }

  if (patch.artwork === "LATER") {
    const [rules] = await db.select({ artworkLater: schema.productRules.artworkLater }).from(schema.productRules).where(eq(schema.productRules.productId, row.productId));
    if (rules && !rules.artworkLater) {
      throw new AppError("VALIDATION_FAILED", { fieldErrors: { artwork: "Artwork is needed before we can make this product; sending it later isn't available." } });
    }
  }
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
    // Moving between steps changes nothing that would be made, so it doesn't close a checkout.
    const changesWhatIsMade = Object.keys(patch).some((key) => key !== "version" && key !== "step" && key !== "confirmRemovals");
    if (changesWhatIsMade && !(await touchOrderableConfiguration(tx, id, { expectedVersion: patch.version }))) return false;
    const rows = await tx
      .update(schema.configurations)
      .set({
        ...(patch.quantity !== undefined && { quantity: patch.quantity }),
        ...(patch.rush && { rush: patch.rush }),
        ...(patch.artwork !== undefined && { artwork: patch.artwork }),
        ...(patch.step && { step: patch.step }),
        ...(patch.sourcing !== undefined && { sourcing: patch.sourcing }),
        ...(patch.decoration !== undefined && { decoration: patch.decoration }),
        ...(patch.details && { details: { ...(row.details as object), ...patch.details } }),
        ...(patch.sizesUnknown !== undefined && { sizesUnknown: patch.sizesUnknown }),
        ...(!changesWhatIsMade && { version: sql`${schema.configurations.version} + 1` }),
        // The customer has seen the new price once they change the design (OPS-FR-130).
        ...(changesWhatIsMade && { previousTotalMinor: null }),
        updatedAt: new Date(),
      })
      .where(and(eq(schema.configurations.id, id), eq(schema.configurations.version, changesWhatIsMade ? patch.version + 1 : patch.version)))
      .returning({ id: schema.configurations.id });
    if (!rows.length) return false;
    await writeSelections(tx, id, before, next, options.map((option) => option.key));
    if (patch.sizes) {
      await tx.delete(schema.configurationSizes).where(eq(schema.configurationSizes.configurationId, id));
      const kept = patch.sizes.filter((item) => item.quantity > 0);
      if (kept.length) await tx.insert(schema.configurationSizes).values(kept.map((item) => ({ configurationId: id, ...item })));
    }
    if (patch.placements) {
      // Conflicts are shown with fixes, never refused, so the customer can fix one without losing others (COM-FR-026).
      await tx.delete(schema.configurationPlacements).where(eq(schema.configurationPlacements.configurationId, id));
      if (patch.placements.length) await tx.insert(schema.configurationPlacements).values(patch.placements.map((placement) => ({ configurationId: id, ...placement })));
    }
    return true;
  });
  if (!saved) throw new AppError("VERSION_CONFLICT", { context: { latest: await draftView(db, await loadDraft(db, access, id), access.actor.now) } });
  return { draft: await draftView(db, await reprice(db, id, access.actor.now), access.actor.now), removed: conflicts };
}

/**
 * Emails a link to this draft (COM-FR-012), so a guest can come back on any
 * device. The link opens a guest session scoped to this draft.
 */
export async function emailDraftLink(deps: NotificationDeps & { webOrigin: string }, access: DraftAccess, id: string, email: string) {
  const row = await loadDraft(deps.db, access, id);
  const [product] = await deps.db.select({ name: schema.products.name }).from(schema.products).where(eq(schema.products.id, row.productId));
  const opened: { session: { token: string; expiresAt: Date } | null } = { session: null };
  await deps.db.transaction(async (tx) => {
    // The link goes to whoever was typed in; the design stays its owner's (review P1-03).
    const { owner, recipient: customer } = await customersForContact(tx, access.actor, { email });
    await tx.update(schema.configurations).set({ customerId: owner.id }).where(eq(schema.configurations.id, id));
    const link = await createGuestLink(tx, deps.webOrigin, { purpose: "CONFIGURATION", targetType: "CONFIGURATION", targetId: id, customerId: customer.id, now: access.actor.now });
    // A visitor without an account gets a guest session for this one draft, so they can upload artwork here (TECH-04 uploads need a session).
    if (access.actor.type === "anonymous") {
      const [linkRow] = await tx.select().from(schema.guestLinks).where(eq(schema.guestLinks.id, link.id));
      opened.session = await startGuestSession(tx, linkRow!, access.actor.now);
    }
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
  return { draft: await draftView(deps.db, await loadDraft(deps.db, access, id), access.actor.now), session: opened.session };
}

const ROLE_PURPOSES: Record<string, string[]> = {
  ARTWORK: ["ARTWORK"],
  LOGO: ["ARTWORK"],
  REFERENCE: ["ARTWORK", "PROJECT_ATTACHMENT"],
  GARMENT_PHOTO: ["ARTWORK", "PROJECT_ATTACHMENT"],
};

/** Attaches an uploaded file (the customer's own) to the draft (COM-FR-050, 023 garment photos). */
export async function attachDraftFile(db: Database, access: DraftAccess, id: string, input: { fileId: string; role: "ARTWORK" | "LOGO" | "REFERENCE" | "GARMENT_PHOTO" }) {
  const row = await loadDraft(db, access, id);
  refuseLockedChange(row, ["artwork"]);
  const file = await findFileForActor(db, access.actor, input.fileId).catch(() => null);
  // Browser-owned drafts: the file must come from the same upload flow; the files module already scopes by uploader.
  if (!file) throw new AppError("NOT_FOUND");
  if (!ROLE_PURPOSES[input.role]!.includes(file.purpose)) throw new AppError("VALIDATION_FAILED", { fieldErrors: { fileId: "Upload this file as artwork." } });
  if (file.status === "REJECTED") throw new AppError("RULE_FAILED", { message: file.reason ?? "We can't use this file.", context: { reason: "FILE_REJECTED" } });
  await db.transaction(async (tx) => {
    await tx.insert(schema.configurationFiles).values({ configurationId: id, fileId: file.id, role: input.role }).onConflictDoNothing();
    await tx.update(schema.files).set({ ownerType: "CONFIGURATION", ownerId: id, attachedAt: new Date() }).where(eq(schema.files.id, file.id));
    await touchOrderableConfiguration(tx, row.id);
  });
  return draftView(db, await loadDraft(db, access, id), access.actor.now);
}

/** Low resolution never blocks (COM-FR-051): the customer replaces, asks for clean-up, or asks for review. */
export async function setLowResolutionAction(db: Database, access: DraftAccess, id: string, linkId: string, action: "REPLACE" | "CLEANUP" | "REVIEW") {
  refuseLockedChange(await loadDraft(db, access, id), ["artwork"]);
  const found = await db.transaction(async (tx) => {
    const rows = await tx
      .update(schema.configurationFiles)
      .set({ lowResolutionAction: action })
      .where(and(eq(schema.configurationFiles.id, linkId), eq(schema.configurationFiles.configurationId, id)))
      .returning({ id: schema.configurationFiles.id });
    if (rows.length) await touchOrderableConfiguration(tx, id);
    return rows.length > 0;
  });
  if (!found) throw new AppError("NOT_FOUND");
  return draftView(db, await loadDraft(db, access, id), access.actor.now);
}

export async function removeDraftFile(db: Database, access: DraftAccess, id: string, linkId: string) {
  refuseLockedChange(await loadDraft(db, access, id), ["artwork"]);
  const found = await db.transaction(async (tx) => {
    const rows = await tx
      .delete(schema.configurationFiles)
      .where(and(eq(schema.configurationFiles.id, linkId), eq(schema.configurationFiles.configurationId, id)))
      .returning({ fileId: schema.configurationFiles.fileId });
    if (!rows.length) return false;
    await detachConfigurationFile(tx, rows[0]!.fileId, id);
    await touchOrderableConfiguration(tx, id);
    return true;
  });
  if (!found) throw new AppError("NOT_FOUND");
  return draftView(db, await loadDraft(db, access, id), access.actor.now);
}

/**
 * Imports per-item names, numbers, departments and sizes from a CSV upload
 * (COM-FR-029). Every row is checked; nothing is saved until the whole file is
 * clean, and each problem comes back with its line number.
 */
export async function importPersonalization(deps: { db: Database; storage: StorageAdapter }, access: DraftAccess, id: string, fileId: string) {
  refuseLockedChange(await loadDraft(deps.db, access, id), ["personalization"]);
  const file = await findFileForActor(deps.db, access.actor, fileId).catch(() => null);
  if (!file || file.purpose !== "CSV_IMPORT") throw new AppError("NOT_FOUND");
  if (file.status !== "READY") throw new AppError("RULE_FAILED", { message: "This file is still being checked. Try again in a moment.", context: { reason: file.status } });
  const text = (await deps.storage.read(file.storageKey)).toString("utf8");
  const result = checkPersonalizationCsv(text);
  if (result.errors.length) return { accepted: false, count: result.rows.length, errors: result.errors };
  await deps.db.transaction(async (tx) => {
    await tx.delete(schema.configurationPersonalizationRows).where(eq(schema.configurationPersonalizationRows.configurationId, id));
    for (let start = 0; start < result.rows.length; start += 500) {
      await tx.insert(schema.configurationPersonalizationRows).values(result.rows.slice(start, start + 500).map((row) => ({ configurationId: id, ...row })));
    }
    await tx.update(schema.files).set({ ownerType: "CONFIGURATION", ownerId: id, attachedAt: new Date() }).where(eq(schema.files.id, file.id));
    await touchOrderableConfiguration(tx, id);
  });
  return { accepted: true, count: result.rows.length, errors: [] };
}

async function nextQuoteReference(db: Pick<Database, "execute">, now: Date) {
  const result = await db.execute<{ n: string }>(sql`select nextval('quote_number_seq')::text as n`);
  return `HP-Q-${now.getUTCFullYear()}-${String(result.rows[0]!.n).padStart(4, "0")}`;
}

/**
 * Request Final Quote (COM-FR-061). Creates a quote in PENDING_REVIEW with a
 * copy of every answer and the price shown, and marks the design
 * QUOTE_REQUESTED so it can't change under the staff who price it. Nothing is
 * cleared: the saved copy is what staff see (TECH-01 §5). The customer gets a
 * link back to the design. Asking twice returns the same quote.
 */
export async function requestQuote(
  deps: NotificationDeps & { webOrigin: string },
  access: DraftAccess,
  id: string,
  input: { email: string; name: string; phone?: string; note?: string },
) {
  const checked = await quotable(deps.db, access, id);
  if ("reference" in checked) return checked;
  const reference = await deps.db.transaction((tx) => quoteIn(tx, deps, access, checked, input));
  return { reference, status: "PENDING_REVIEW" as const };
}

/** Checks a design can be quoted, before anything changes. A design already quoted returns its reference. */
export async function quotable(db: Database, access: DraftAccess, id: string) {
  const row = await loadDraft(db, access, id);
  const current = await draftView(db, row, access.actor.now);
  if (row.status === "QUOTE_REQUESTED" && current.quote) return { reference: current.quote.reference, status: "PENDING_REVIEW" as const };
  if (row.status !== "DRAFT" && row.status !== "IN_CART") throw new AppError("CONFLICT", { message: "This design is no longer a draft.", context: { reason: "NOT_DRAFT" } });
  const unavailable = current.garment?.unavailable[0];
  if (unavailable) throw new AppError("RULE_FAILED", { message: unavailable.message, context: { reason: "CHOICE_UNAVAILABLE", field: unavailable.field } });
  if (!current.price) throw new AppError("VALIDATION_FAILED", { fieldErrors: { quantity: "Choose a quantity before asking for a quote." } });
  const blocking = current.price.reasons.find((reason) => reason.blocking);
  if (blocking) throw new AppError("RULE_FAILED", { message: blocking.message, context: { reason: "BLOCKED_CONFIGURATION", code: blocking.code } });
  return { id, current };
}

/**
 * The quote request's changes, inside the caller's transaction, so several
 * designs can be quoted all together or not at all (review P2-02). Several
 * designs make ONE quote request with one reference and one email (owner,
 * 2026-10-05); staff then build a line from each.
 */
export async function quoteIn(
  tx: Tx,
  deps: NotificationDeps & { webOrigin: string },
  access: DraftAccess,
  checked: { id: string; current: Configuration } | { id: string; current: Configuration }[],
  input: {
    email: string;
    name: string;
    phone?: string;
    note?: string;
    placedFor?: { organizationId: string; locationId: string } | null;
    /** The account the quote belongs to when someone else sends it: the requester of an approved order request (T11-04). */
    owner?: { userId: string; email: string; name: string; emailVerified: boolean };
  },
) {
  const designs = Array.isArray(checked) ? checked : [checked];
  const ids = designs.map((design) => design.id);
  const now = access.actor.now;
  // The quote is the owner's; its link and email go to the contact typed in (review P1-03).
  const { owner: customer, recipient } = input.owner
    ? await (async () => {
        const own = await ensureAccountCustomer(tx, input.owner!, now);
        return { owner: own, recipient: own };
      })()
    : await customersForContact(tx, access.actor, { email: input.email, name: input.name, phone: input.phone ?? null });
  const moved = await tx
    .update(schema.configurations)
    .set({ status: "QUOTE_REQUESTED", customerId: customer.id, savedForLaterAt: null, version: sql`${schema.configurations.version} + 1` })
    .where(and(inArray(schema.configurations.id, ids), inArray(schema.configurations.status, ["DRAFT", "IN_CART", "AWAITING_APPROVAL"])))
    .returning({ id: schema.configurations.id });
  if (moved.length !== ids.length) throw new AppError("CONFLICT", { message: "This design is no longer a draft.", context: { reason: "NOT_DRAFT" } });
  // A quote item leaves the cart when its quote is requested (COM-FR-081).
  await tx.delete(schema.cartItems).where(inArray(schema.cartItems.configurationId, ids));
  for (const id of ids) await closeCheckoutsWith(tx, id);
  const ref = await nextQuoteReference(tx, now);
  const snapshots = designs.map(({ id, current }) => {
    const { emailedTo: _emailed, ...snapshot } = current;
    void _emailed;
    return { ...snapshot, id };
  });
  const requestSnapshot =
    snapshots.length === 1
      ? { ...snapshots[0], requestedAt: now.toISOString() }
      : { schema: "cart-quote/v1", productName: `${snapshots.length} items`, items: snapshots, requestedAt: now.toISOString() };
  await tx.insert(schema.quotes).values({
    reference: ref,
    customerId: customer.id,
    configurationId: ids[0]!,
    configurationIds: ids,
    requestSnapshot,
    contact: { name: input.name, email: input.email, phone: input.phone ?? null, note: input.note ?? null },
    // A template order's quote is for the template order's location (T11-01c), checked by the caller.
    organizationId: input.placedFor?.organizationId ?? null,
    locationId: input.placedFor?.locationId ?? null,
  });
  const link = await createGuestLink(tx, deps.webOrigin, { purpose: "CONFIGURATION", targetType: "CONFIGURATION", targetId: ids[0]!, customerId: recipient.id, now });
  await queueEmail(deps, tx, {
    template: "guest_link",
    to: input.email,
    customerId: recipient.id,
    data: { url: link.url, what: "quote request", reference: ref },
    record: { type: "CONFIGURATION", id: ids[0]!, label: `Quote request ${ref}` },
    linkLabel: snapshots.length === 1 ? "Opens the design the quote is for" : "Opens the first design the quote is for",
    requestId: access.actor.requestId,
  });
  return ref;
}

/*
 * Designs held for an organization's approval (T11-04; TECH-01 §4 order
 * request). While held, nobody changes them; a request for changes or a
 * cancellation gives them back as drafts.
 */

export async function holdForApproval(tx: Tx, ids: readonly string[]) {
  const held = await tx
    .update(schema.configurations)
    .set({ status: "AWAITING_APPROVAL", savedForLaterAt: null, version: sql`${schema.configurations.version} + 1` })
    .where(and(inArray(schema.configurations.id, [...ids]), inArray(schema.configurations.status, ["DRAFT", "IN_CART"])))
    .returning({ id: schema.configurations.id });
  if (held.length !== ids.length) throw new AppError("CONFLICT", { message: "This design is no longer a draft.", context: { reason: "NOT_DRAFT" } });
  await tx.delete(schema.cartItems).where(inArray(schema.cartItems.configurationId, [...ids]));
  for (const id of ids) await closeCheckoutsWith(tx, id);
}

export async function releaseFromApproval(tx: Tx, ids: readonly string[]) {
  await tx
    .update(schema.configurations)
    .set({ status: "DRAFT", version: sql`${schema.configurations.version} + 1` })
    .where(and(inArray(schema.configurations.id, [...ids]), eq(schema.configurations.status, "AWAITING_APPROVAL")));
}

/** Held designs checked for a quote, before anything changes (the approver isn't their owner, so no draft access applies). */
export async function heldQuotable(db: Database, ids: readonly string[], now: Date) {
  const rows = await db.select().from(schema.configurations).where(inArray(schema.configurations.id, [...ids]));
  if (rows.length !== ids.length || rows.some((row) => row.status !== "AWAITING_APPROVAL")) throw new AppError("CONFLICT", { message: "This request's designs changed. Reload to continue.", context: { reason: "NOT_HELD" } });
  const checked: { id: string; current: Configuration }[] = [];
  for (const row of rows) {
    const current = await draftView(db, await reprice(db, row.id, now), now);
    const unavailable = current.garment?.unavailable[0];
    if (unavailable) throw new AppError("RULE_FAILED", { message: unavailable.message, context: { reason: "CHOICE_UNAVAILABLE", field: unavailable.field } });
    const blocking = current.price?.reasons.find((reason) => reason.blocking);
    if (blocking) throw new AppError("RULE_FAILED", { message: blocking.message, context: { reason: "BLOCKED_CONFIGURATION", code: blocking.code } });
    checked.push({ id: row.id, current });
  }
  return checked;
}

/** Designs at today's price (an order request sent again after changes, T11-04). */
export async function currentDesigns(db: Database, ids: readonly string[], now: Date) {
  const designs: Configuration[] = [];
  for (const id of ids) designs.push(await draftView(db, await reprice(db, id, now), now));
  return designs;
}

/**
 * One design for a group collection's Order Draft (T12-03b): the collection's
 * source with the totals by size and a personalisation row per person, owned
 * by the organizer who submits it. Template controls still apply.
 */
export async function configurationForGroup(
  db: Database,
  actor: ActorContext,
  input: { sourceConfigurationId: string; quantity: number; sizes: { size: string; quantity: number }[]; people: { name: string | null; size: string | null }[]; controls: Row["controls"] },
): Promise<Configuration> {
  if (actor.type !== "user") throw new AppError("NOT_SIGNED_IN");
  const [original] = await db.select().from(schema.configurations).where(eq(schema.configurations.id, input.sourceConfigurationId));
  if (!original) throw new AppError("NOT_FOUND");
  const id = await db.transaction(async (tx) => {
    const copy = await insertConfigurationCopy(tx, original, { ownerUserId: actor.session.userId, ownerDeviceHash: null, customerId: null, quantity: input.quantity, sizesUnknown: false, controls: input.controls });
    // The group's own sizes and names replace whatever the source had.
    await tx.delete(schema.configurationSizes).where(eq(schema.configurationSizes.configurationId, copy));
    await tx.delete(schema.configurationPersonalizationRows).where(eq(schema.configurationPersonalizationRows.configurationId, copy));
    const sizes = input.sizes.filter((item) => item.quantity > 0);
    if (sizes.length) await tx.insert(schema.configurationSizes).values(sizes.map((item) => ({ configurationId: copy, ...item })));
    const people = input.people.filter((person) => person.name);
    if (people.length) await tx.insert(schema.configurationPersonalizationRows).values(people.map((person, index) => ({ configurationId: copy, row: index + 1, name: person.name, size: person.size })));
    return copy;
  });
  return draftView(db, await reprice(db, id, actor.now), actor.now);
}

/** Retained attachments and snapshots must survive upload cleanup. */
export function configurationRetainsFile(fileId: string | SQL) {
  return sql`exists (select 1 from configurations where artwork_file_id = ${fileId}::uuid)
    or exists (select 1 from configuration_files where file_id = ${fileId}::uuid)`;
}

/** Reassign ownership to a surviving copy before releasing a draft's artwork. */
export async function detachConfigurationFile(tx: Tx, fileId: string, configurationId: string) {
  await tx.select({ id: schema.files.id }).from(schema.files).where(eq(schema.files.id, fileId)).for("update");
  const [remaining] = await tx.select({ id: schema.configurationFiles.configurationId }).from(schema.configurationFiles).where(eq(schema.configurationFiles.fileId, fileId)).limit(1);
  await tx.update(schema.files).set({ ownerType: remaining ? "CONFIGURATION" : null, ownerId: remaining?.id ?? null, attachedAt: remaining ? new Date() : null })
    .where(and(eq(schema.files.id, fileId), eq(schema.files.ownerType, "CONFIGURATION"), eq(schema.files.ownerId, configurationId)));
}

/** Open designs a price change will touch: drafts (repriced on next open) and designs in carts (repriced at checkout). */
export async function openDesignCounts(db: Database, productIds: readonly string[]) {
  if (!productIds.length) return new Map<string, { drafts: number; carts: number }>();
  const rows = await db
    .select({ productId: schema.configurations.productId, status: schema.configurations.status, n: sql<number>`count(*)::int` })
    .from(schema.configurations)
    .where(and(inArray(schema.configurations.productId, [...productIds]), inArray(schema.configurations.status, ["DRAFT", "IN_CART"])))
    .groupBy(schema.configurations.productId, schema.configurations.status);
  const counts = new Map<string, { drafts: number; carts: number }>();
  for (const row of rows) {
    const entry = counts.get(row.productId) ?? { drafts: 0, carts: 0 };
    if (row.status === "DRAFT") entry.drafts += row.n;
    else entry.carts += row.n;
    counts.set(row.productId, entry);
  }
  return counts;
}
