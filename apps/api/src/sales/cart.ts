import type { Cart, CartItem, Configuration } from "@holypearls/contracts";
import { and, asc, type Database, desc, eq, inArray, isNotNull, schema, sql } from "@holypearls/db";
import { AppError } from "../errors.js";
import { sha256 } from "../identity/customers.js";
import type { NotificationDeps } from "../platform/notifications.js";
import { closeCheckoutsWith, type DraftAccess, draftView, loadDraft, quoteIn, quotable } from "../configuration/drafts.js";
import { configuratorFor, productOptions } from "../configuration/pricing.js";
import { checkoutTotals } from "./delivery.js";

/*
 * The cart (T04-01, COM-FR-080–081, Pen 41/42). It belongs to the signed-in
 * account, or before sign-in to the browser's device key (stored hashed, the
 * same key configuration drafts use). Signing in moves the browser's cart,
 * designs and checkout into the account (claim.ts).
 *
 * Each item keeps a copy of the design and its price as they were when added.
 * Editing the design in the configurator refreshes that copy (the item is
 * still the same design); checkout reprices everything anyway.
 */

type Db = Database;
export const deviceHash = sha256;

export type CartAccess = DraftAccess;

type Owner = { userId: string } | { deviceHash: string };

function ownerOf(access: CartAccess): Owner | null {
  if (access.actor.type === "user") return { userId: access.actor.session.userId };
  return access.deviceKey ? { deviceHash: deviceHash(access.deviceKey) } : null;
}

const ownerWhere = (owner: Owner) =>
  "userId" in owner ? eq(schema.carts.ownerUserId, owner.userId) : eq(schema.carts.ownerDeviceHash, owner.deviceHash);

async function findCart(db: Db, access: CartAccess, create: boolean) {
  const owner = ownerOf(access);
  if (!owner) {
    if (create) throw new AppError("RULE_FAILED", { message: "Your browser blocked the cookie we use to keep your cart. Allow cookies for this site and try again.", context: { reason: "NO_DEVICE" } });
    return null;
  }
  // Signing in brought the browser's cart along already (claimDeviceCommerce, in the controllers).
  let [cart] = await db.select().from(schema.carts).where(ownerWhere(owner));
  if (!cart && create) {
    [cart] = await db
      .insert(schema.carts)
      .values("userId" in owner ? { ownerUserId: owner.userId } : { ownerDeviceHash: owner.deviceHash })
      .onConflictDoNothing()
      .returning();
    [cart] = cart ? [cart] : await db.select().from(schema.carts).where(ownerWhere(owner));
  }
  return cart ?? null;
}

/** "Premium Matte 350gsm · double-sided", from the option value labels. */
export async function choiceSummary(db: Db, draft: Configuration, productId: string) {
  const options = await productOptions(db, productId);
  const labels = options.flatMap((option) => {
    const value = option.values.find((item) => item.key === draft.choices[option.key]);
    if (!value) return [];
    // "no finish" rather than a bare "None" (Pen 41).
    return [value.key === "none" ? `no ${option.label.toLowerCase()}` : value.label];
  });
  if (draft.garment?.placements.length) labels.push(...draft.garment.placements.map((placement) => placement.position.toLowerCase().replace(/_/g, " ")));
  return labels.join(" · ");
}

type Snapshot = Configuration & { summary: string; productId: string; takenAt: string; quantityOptions?: number[] };

async function snapshotOf(db: Db, row: typeof schema.configurations.$inferSelect, now: Date): Promise<Snapshot> {
  const draft = await draftView(db, row, now);
  // The product's standard quantities, for the cart's quantity menu (Pen 41).
  const presets = draft.garment ? [] : (await configuratorFor(db, row.productId, now)).quantityPresets.map((preset) => preset.quantity);
  return { ...draft, summary: await choiceSummary(db, draft, row.productId), productId: row.productId, takenAt: now.toISOString(), quantityOptions: presets };
}

const groupOf = (draft: Configuration): "READY" | "QUOTE" => (draft.price?.state === "PRICE_READY" && draft.price.valid ? "READY" : "QUOTE");

function refuseUnorderable(draft: Configuration) {
  const unavailable = draft.garment?.unavailable[0];
  if (unavailable) throw new AppError("RULE_FAILED", { message: unavailable.message, context: { reason: "CHOICE_UNAVAILABLE", field: unavailable.field } });
  if (!draft.price) throw new AppError("VALIDATION_FAILED", { fieldErrors: { quantity: "Choose a quantity before adding this to your cart." } });
  const blocking = draft.price.reasons.find((reason) => reason.blocking);
  if (blocking) throw new AppError("RULE_FAILED", { message: blocking.message, context: { reason: "BLOCKED_CONFIGURATION", code: blocking.code } });
}

const editHref = (draft: { productSlug: string; id: string; family: string; fromTemplate?: { templateId: string; organizationId: string } | null }) =>
  // A template design is changed by ordering from the template again (T11-01c).
  draft.fromTemplate
    ? `/workspace/${draft.fromTemplate.organizationId}/templates/${draft.fromTemplate.templateId}/order`
    : draft.family === "GARMENT"
      ? `/products/${draft.productSlug}/configure?draft=${draft.id}`
      : `/products/${draft.productSlug}?draft=${draft.id}`;

function itemView(item: typeof schema.cartItems.$inferSelect): CartItem {
  const snapshot = item.snapshot as Snapshot;
  const artwork = snapshot.files.find((file) => file.role === "ARTWORK" || file.role === "LOGO");
  return {
    id: item.id,
    configurationId: item.configurationId,
    group: item.group,
    productName: snapshot.productName,
    productSlug: snapshot.productSlug,
    summary: snapshot.summary,
    quantity: snapshot.price?.quantity ?? snapshot.quantity,
    artwork: artwork ? `${artwork.name}${artwork.status === "READY" ? " · checked" : ""}` : snapshot.artwork === "LATER" ? "Artwork later" : null,
    // Before VAT: the cart adds VAT once, on the whole order (owner, 2026-10-05).
    totalMinor: snapshot.price?.totalMinor != null ? (BigInt(snapshot.price.totalMinor) - BigInt(snapshot.price.vatMinor ?? "0")).toString() : null,
    perUnitMinor: snapshot.price?.perUnitMinor ?? null,
    quantityOptions: snapshot.garment ? [] : [...new Set([...(snapshot.quantityOptions ?? []), ...(snapshot.price?.quantity ? [snapshot.price.quantity] : [])])].sort((a, b) => a - b),
    editHref: editHref(snapshot),
  };
}

/** The cart, with each item's copy refreshed if its design was edited since. */
export async function getCart(db: Db, access: CartAccess): Promise<Cart> {
  const cart = await findCart(db, access, false);
  const items = cart ? await db.select().from(schema.cartItems).where(eq(schema.cartItems.cartId, cart.id)).orderBy(asc(schema.cartItems.createdAt)) : [];
  const rows = items.length ? await db.select().from(schema.configurations).where(inArray(schema.configurations.id, items.map((item) => item.configurationId))) : [];
  const live: (typeof items)[number][] = [];
  for (const item of items) {
    const row = rows.find((candidate) => candidate.id === item.configurationId);
    if (!row || row.status !== "IN_CART") {
      await db.delete(schema.cartItems).where(eq(schema.cartItems.id, item.id));
      continue;
    }
    const snapshot = item.snapshot as Snapshot;
    if (row.updatedAt.getTime() > new Date(snapshot.updatedAt).getTime()) {
      const fresh = await snapshotOf(db, row, access.actor.now);
      const [updated] = await db.update(schema.cartItems).set({ snapshot: fresh, group: groupOf(fresh) }).where(eq(schema.cartItems.id, item.id)).returning();
      live.push(updated!);
    } else live.push(item);
  }
  const views = live.map(itemView);
  const ready = live.filter((item) => item.group === "READY").map((item) => (item.snapshot as Snapshot).price!);
  const sum = (values: (string | null)[]) => values.reduce((total, value) => total + BigInt(value ?? "0"), 0n);
  const quotes = live.filter((item) => item.group === "QUOTE").map((item) => (item.snapshot as Snapshot).price?.totalMinor ?? null);
  const rate = ready[0]?.vatRateBps ?? null;
  const totals = checkoutTotals(
    ready.map((price) => ({ totalMinor: BigInt(price.totalMinor ?? "0"), vatMinor: BigInt(price.vatMinor ?? "0") })),
    null,
    { vatRateBps: rate ?? 0, vatOnDelivery: false },
  );
  return {
    items: views,
    savedForLater: await savedDrafts(db, access),
    ready: { goodsMinor: totals.goodsMinor.toString(), vatMinor: totals.vatMinor.toString(), totalMinor: totals.totalMinor.toString(), vatRateBps: rate },
    quoteEstimateMinor: quotes.some((value) => value !== null) ? sum(quotes).toString() : null,
  };
}

async function savedDrafts(db: Db, access: CartAccess) {
  const owner = ownerOf(access);
  if (!owner) return [];
  const rows = await db
    .select()
    .from(schema.configurations)
    .where(
      and(
        eq(schema.configurations.status, "DRAFT"),
        isNotNull(schema.configurations.savedForLaterAt),
        "userId" in owner ? eq(schema.configurations.ownerUserId, owner.userId) : eq(schema.configurations.ownerDeviceHash, owner.deviceHash),
      ),
    )
    .orderBy(desc(schema.configurations.savedForLaterAt))
    .limit(20);
  const list = [];
  for (const row of rows) {
    const draft = await draftView(db, row, access.actor.now);
    list.push({ configurationId: row.id, productName: draft.productName, summary: await choiceSummary(db, draft, row.productId), quantity: draft.price?.quantity ?? draft.quantity, editHref: editHref(draft) });
  }
  return list;
}

/** Adds a design to the cart (COM-FR-080). Adding it again is harmless. */
export async function addToCart(db: Db, access: CartAccess, configurationId: string) {
  const row = await loadDraft(db, access, configurationId);
  if (row.status === "IN_CART") return getCart(db, access);
  if (row.status !== "DRAFT") throw new AppError("CONFLICT", { message: "This design already has a quote request, so it can't go in the cart.", context: { reason: "NOT_DRAFT" } });
  const draft = await draftView(db, row, access.actor.now);
  refuseUnorderable(draft);
  const cart = await findCart(db, access, true);
  await db.transaction(async (tx) => {
    const moved = await tx
      .update(schema.configurations)
      .set({ status: "IN_CART", savedForLaterAt: null })
      .where(and(eq(schema.configurations.id, configurationId), eq(schema.configurations.status, "DRAFT")))
      .returning();
    if (!moved.length) return;
    const snapshot = await snapshotOf(tx as unknown as Db, moved[0]!, access.actor.now);
    await tx.insert(schema.cartItems).values({ cartId: cart!.id, configurationId, group: groupOf(snapshot), snapshot }).onConflictDoNothing();
  });
  return getCart(db, access);
}

async function ownedItem(db: Db, access: CartAccess, itemId: string) {
  const cart = await findCart(db, access, false);
  const [item] = cart ? await db.select().from(schema.cartItems).where(and(eq(schema.cartItems.id, itemId), eq(schema.cartItems.cartId, cart.id))) : [];
  if (!item) throw new AppError("NOT_FOUND");
  return item;
}

/** Removes an item. Its design stays a draft the customer can still open. */
export async function removeFromCart(db: Db, access: CartAccess, itemId: string, options: { saveForLater: boolean }) {
  const item = await ownedItem(db, access, itemId);
  await db.transaction(async (tx) => {
    await tx.delete(schema.cartItems).where(eq(schema.cartItems.id, item.id));
    await closeCheckoutsWith(tx, item.configurationId);
    await tx
      .update(schema.configurations)
      .set({ status: "DRAFT", savedForLaterAt: options.saveForLater ? access.actor.now : null, version: sql`${schema.configurations.version} + 1` })
      .where(and(eq(schema.configurations.id, item.configurationId), eq(schema.configurations.status, "IN_CART")));
  });
  return getCart(db, access);
}

/** Drops a saved-for-later design from the list (the draft itself stays). */
export async function forgetSaved(db: Db, access: CartAccess, configurationId: string) {
  const row = await loadDraft(db, access, configurationId);
  await db.update(schema.configurations).set({ savedForLaterAt: null }).where(eq(schema.configurations.id, row.id));
  return getCart(db, access);
}

/** "Submit quote items" (Pen 41): one quote request for every quote design, with one set of contact details. */
export async function requestCartQuotes(deps: NotificationDeps & { webOrigin: string }, access: CartAccess, input: { email: string; name: string; phone?: string; note?: string }) {
  const cart = await findCart(deps.db, access, false);
  const items = cart ? await deps.db.select().from(schema.cartItems).where(and(eq(schema.cartItems.cartId, cart.id), eq(schema.cartItems.group, "QUOTE"))).orderBy(asc(schema.cartItems.createdAt)) : [];
  if (!items.length) throw new AppError("RULE_FAILED", { message: "There are no quote items in your cart.", context: { reason: "NO_QUOTE_ITEMS" } });
  // All or nothing (review P2-02): every design is checked first, then all are quoted in one transaction.
  const checked: Awaited<ReturnType<typeof quotable>>[] = [];
  for (const item of items) checked.push(await quotable(deps.db, access, item.configurationId));
  // Every item not yet quoted goes as one request with one reference (owner, 2026-10-05).
  return deps.db.transaction(async (tx) => {
    const fresh = checked.filter((one): one is Exclude<typeof one, { reference: string }> => !("reference" in one));
    const earlier = checked.flatMap((one) => ("reference" in one && one.reference ? [one.reference] : []));
    const references = fresh.length ? [await quoteIn(tx, deps, access, fresh, input)] : [];
    return { references: [...new Set([...references, ...earlier])] };
  });
}

/** The cart's READY items for checkout, oldest first. */
export async function readyItems(db: Db, access: CartAccess) {
  await getCart(db, access);
  const cart = await findCart(db, access, false);
  if (!cart) return { cart: null, items: [] };
  const items = await db.select().from(schema.cartItems).where(and(eq(schema.cartItems.cartId, cart.id), eq(schema.cartItems.group, "READY"))).orderBy(asc(schema.cartItems.createdAt));
  return { cart, items };
}

export { findCart, ownerOf, groupOf };

/** Retained attachments and snapshots must survive upload cleanup. */
export function cartRetainsFile(fileId: string) {
  return sql`exists (select 1 from checkouts where items::text like '%' || ${fileId}::text || '%')
    or exists (select 1 from cart_items where snapshot::text like '%' || ${fileId}::text || '%')`;
}
