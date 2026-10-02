import type { ReorderCheck } from "@holypearls/contracts";
import { and, type Database, eq, inArray, schema } from "@holypearls/db";
import { createHash, randomUUID } from "node:crypto";
import { AppError } from "../errors.js";
import { type DraftAccess, reprice } from "../configuration/drafts.js";
import { priceProduct, productOptions } from "../configuration/pricing.js";
import { loadOrderFor, type OrderAccess } from "../orders/orders.js";
import { recordAudit } from "../platform/audit.js";
import { addToCart } from "../sales/cart.js";

/*
 * Reorder (T08-01; FUL-FR-061–062, OPS-FR-018, TECH-01 §5). The ordered
 * configuration is frozen once ordered, so it's the copy we start from; the
 * order item's snapshot stays the record of what was made.
 *
 * - Exact reorder is offered only when the product, every chosen option, the
 *   artwork and the production method are still available unchanged. It makes
 *   a linked copy marked reorder_exact and puts it in the cart at today's
 *   price. The proof is skipped only when the product rule allows it
 *   (product_rules.proof_skippable_on_reorder); createProofsForOrder reads it.
 * - Reorder with changes makes a linked draft to edit; anything changed goes
 *   back through checks, pricing and a new proof.
 * - Any edit to an exact copy clears reorder_exact, so changing the artwork
 *   turns it into a reorder with changes (see drafts.ts).
 */

const hash = (value: string) => createHash("sha256").update(value).digest("base64url");

async function source(db: Database, access: OrderAccess, orderId: string, position: number) {
  const order = await loadOrderFor(db, access, orderId);
  const [item] = await db
    .select()
    .from(schema.orderItems)
    .where(and(eq(schema.orderItems.orderId, order.id), eq(schema.orderItems.position, position)));
  if (!item) throw new AppError("NOT_FOUND");
  const [configuration] = item.configurationId ? await db.select().from(schema.configurations).where(eq(schema.configurations.id, item.configurationId)) : [];
  return { order, item, configuration: configuration ?? null };
}

/** What can be reordered and how (Pen 128). Quote lines can't be reordered here; they start a new project. */
export async function reorderCheck(db: Database, access: OrderAccess, orderId: string, position: number): Promise<ReorderCheck> {
  const { order, item, configuration } = await source(db, access, orderId, position);
  const base = { orderId: order.id, orderNumber: order.number, position, productName: item.productName, quantity: item.quantity };
  if (!configuration) {
    return { ...base, rows: [], exact: { available: false, reason: "This item was made from a quote. Start a project to order it again." }, proof: "REQUIRED", priceMinor: null, withChanges: false };
  }
  const [product] = await db.select().from(schema.products).where(eq(schema.products.id, configuration.productId));
  const [rules] = await db.select({ skip: schema.productRules.proofSkippableOnReorder }).from(schema.productRules).where(eq(schema.productRules.productId, configuration.productId));
  const live = product?.status === "PUBLISHED";
  const options = live ? await productOptions(db, configuration.productId) : [];
  const chosen = await db.select().from(schema.configurationSelections).where(eq(schema.configurationSelections.configurationId, configuration.id));
  const missing = chosen.filter((choice) => !options.find((option) => option.key === choice.optionKey)?.values.some((value) => value.key === choice.valueKey));
  const files = await db
    .select({ status: schema.files.status })
    .from(schema.configurationFiles)
    .innerJoin(schema.files, eq(schema.files.id, schema.configurationFiles.fileId))
    .where(and(eq(schema.configurationFiles.configurationId, configuration.id), inArray(schema.configurationFiles.role, ["ARTWORK", "LOGO"])));
  const artworkSame = files.every((file) => file.status === "READY");
  const methodSame = !configuration.decoration || Boolean((product?.decorations as string[] | null)?.includes(configuration.decoration));
  let priceMinor: string | null = null;
  if (live && !missing.length) {
    try {
      const result = await priceProduct(db, configuration.productId, { choices: Object.fromEntries(chosen.map((choice) => [choice.optionKey, choice.valueKey])), quantity: item.quantity, rush: "STANDARD", sample: false }, access.actor.now);
      // Only a direct price counts: an estimate or a quote means it can't be bought again as is.
      priceMinor = result.state === "PRICE_READY" ? result.totalMinor : null;
    } catch {
      priceMinor = null;
    }
  }
  const optionLabel = (key: string) => options.find((option) => option.key === key)?.label ?? key;
  const rows = [
    { label: "Product and specification", same: live && !missing.length, note: !live ? "No longer sold" : missing.length ? `${missing.map((choice) => optionLabel(choice.optionKey)).join(", ")} no longer available` : null },
    { label: "Artwork", same: artworkSame, note: artworkSame ? null : "A file needs checking again" },
    { label: "Placement and finish", same: live && !missing.length, note: null },
    { label: "Production method", same: methodSame, note: methodSame ? null : "No longer offered" },
  ];
  const available = rows.every((row) => row.same) && priceMinor !== null;
  const reason = available ? null : !live ? `${item.productName} is no longer available. Use Reorder with changes to pick something similar.` : rows.find((row) => !row.same)?.note ? `${rows.find((row) => !row.same)!.note}. Use Reorder with changes.` : "We can't price this exactly as before. Use Reorder with changes.";
  return { ...base, rows, exact: { available, reason }, proof: rules?.skip ? "SKIPPED" : "REQUIRED", priceMinor, withChanges: live };
}

/** Copies the ordered configuration into a new draft linked to the order item. */
async function copyConfiguration(db: Database, access: DraftAccess, original: typeof schema.configurations.$inferSelect, itemId: string, exact: boolean) {
  const { actor } = access;
  let deviceKey = access.deviceKey;
  let newDeviceKey: string | null = null;
  if (actor.type !== "user" && !deviceKey) {
    deviceKey = randomUUID() + randomUUID();
    newDeviceKey = deviceKey;
  }
  const id = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(schema.configurations)
      .values({
        productId: original.productId,
        ownerUserId: actor.type === "user" ? actor.session.userId : null,
        ownerDeviceHash: actor.type === "user" ? null : hash(deviceKey!),
        customerId: actor.type === "guest" ? actor.guest.customerId : original.customerId,
        quantity: original.quantity,
        rush: "STANDARD",
        artwork: original.artwork,
        artworkFileId: original.artworkFileId,
        step: "review",
        sourcing: original.sourcing,
        decoration: original.decoration,
        details: original.details,
        sizesUnknown: original.sizesUnknown,
        reorderOfItemId: itemId,
        reorderExact: exact,
      })
      .returning({ id: schema.configurations.id });
    const copy = row!.id;
    // Same rows, new owner: drop each row's own id and point it at the copy.
    const strip = <T extends Record<string, unknown>>(rows: T[]) =>
      rows.map((row) => {
        const rest: Record<string, unknown> = { ...row };
        delete rest.id;
        return { ...rest, configurationId: copy };
      });
    const [selections, sizes, placements, people, files] = await Promise.all([
      tx.select().from(schema.configurationSelections).where(eq(schema.configurationSelections.configurationId, original.id)),
      tx.select().from(schema.configurationSizes).where(eq(schema.configurationSizes.configurationId, original.id)),
      tx.select().from(schema.configurationPlacements).where(eq(schema.configurationPlacements.configurationId, original.id)),
      tx.select().from(schema.configurationPersonalizationRows).where(eq(schema.configurationPersonalizationRows.configurationId, original.id)),
      tx.select().from(schema.configurationFiles).where(eq(schema.configurationFiles.configurationId, original.id)),
    ]);
    if (selections.length) await tx.insert(schema.configurationSelections).values(strip(selections) as (typeof schema.configurationSelections.$inferInsert)[]);
    if (sizes.length) await tx.insert(schema.configurationSizes).values(strip(sizes) as (typeof schema.configurationSizes.$inferInsert)[]);
    if (placements.length) await tx.insert(schema.configurationPlacements).values(strip(placements) as (typeof schema.configurationPlacements.$inferInsert)[]);
    if (people.length) await tx.insert(schema.configurationPersonalizationRows).values(strip(people) as (typeof schema.configurationPersonalizationRows.$inferInsert)[]);
    if (files.length) await tx.insert(schema.configurationFiles).values(strip(files) as (typeof schema.configurationFiles.$inferInsert)[]);
    await recordAudit(tx, actor, { action: exact ? "reorder.exact" : "reorder.with_changes", summary: `${exact ? "Exact reorder" : "Reorder with changes"} started from an order item`, recordType: "CONFIGURATION", recordId: copy, after: { reorderOfItemId: itemId } });
    return copy;
  });
  await reprice(db, id, actor.now);
  return { id, newDeviceKey, deviceKey };
}

/** EXACT puts the copy in the cart; WITH_CHANGES opens it to edit (FUL-FR-061–062). */
export async function reorder(db: Database, access: OrderAccess, orderId: string, position: number, mode: "EXACT" | "WITH_CHANGES") {
  const check = await reorderCheck(db, access, orderId, position);
  const { item, configuration } = await source(db, access, orderId, position);
  if (!configuration || !check.withChanges) throw new AppError("RULE_FAILED", { message: check.exact.reason ?? "This item can't be reordered online.", context: { reason: "NOT_REORDERABLE" } });
  if (mode === "EXACT" && !check.exact.available) throw new AppError("RULE_FAILED", { message: check.exact.reason ?? "Exact reorder isn't available.", context: { reason: "NOT_EXACT" } });
  const copy = await copyConfiguration(db, access, configuration, item.id, mode === "EXACT");
  const draftAccess = { actor: access.actor, deviceKey: copy.deviceKey };
  if (mode === "EXACT") await addToCart(db, draftAccess, copy.id);
  return { configurationId: copy.id, next: mode === "EXACT" ? "/cart" : `/configure/drafts/${copy.id}`, newDeviceKey: copy.newDeviceKey };
}
