import type { Checkout, checkoutAddressSchema, checkoutBillingSchema, checkoutContactSchema, Configuration } from "@holypearls/contracts";
import { and, type Database, desc, eq, inArray, schema, sql } from "@holypearls/db";
import type { z } from "zod";
import { AppError } from "../errors.js";
import { currentTaxSetting } from "../catalogue/rules.js";
import { draftView, reprice } from "../configuration/drafts.js";
import { ensureAccountCustomer, ensureGuestCustomer } from "../identity/customers.js";
import { type CartAccess, choiceSummary, deviceHash, groupOf, readyItems } from "./cart.js";
import { type Cover, checkoutTotals, loadZones, zoneFor } from "./delivery.js";
import { checkoutExpiry } from "./retention.js";
import { type OrderableConfigurationSnapshotV1, orderableSnapshot } from "./snapshot.js";
import { orderOfCheckout } from "../orders/orders.js";
import { cancelCheckoutPayments, checkoutPayment, checkoutsWithActivePayment, type PaymentDeps, paymentInProgress, paymentSettings, paymentsBlocker, startCheckoutPayment } from "../payments/payments.js";

/*
 * Checkout (T04-01, COM-FR-083–084, TECH-05 §1, Pen 43/44/45).
 *
 * Creating a checkout reprices every ready item on the server and freezes the
 * result: later catalogue price changes never touch it. The customer then
 * answers contact, address, delivery and billing; each answer recalculates
 * the total from the frozen items, the delivery zone's rate (copied when the
 * address is set) and the VAT setting copied at creation. Nothing the browser
 * sends is ever an amount.
 *
 * One cart has at most one OPEN checkout (a partial unique index). Asking
 * again with the same items returns it, so a double submit makes one checkout;
 * with different items, or after a day, the old one is abandoned and a new
 * one starts with the customer's earlier answers. Once a payment is under way
 * (T04-03) the checkout can't change or be replaced until it finishes.
 */

type Db = Database;
/** The database and the payment provider (null when payments aren't set up). */
export type CheckoutDeps = Pick<PaymentDeps, "db" | "gateway">;
type Row = typeof schema.checkouts.$inferSelect;

/** An open checkout older than this is repriced on the next "Check out". */
const FRESH_FOR_MS = 24 * 60 * 60 * 1000;

const STEPS = ["contact", "address", "delivery", "billing", "review"] as const;
type Step = (typeof STEPS)[number];

interface FrozenItem {
  configurationId: string;
  productName: string;
  summary: string;
  quantity: number;
  goodsMinor: string;
  vatMinor: string;
  totalMinor: string;
  perUnitMinor: string | null;
  cartTotalMinor: string | null;
  leadDays: { min: number; max: number } | null;
  priceResultId: string;
  /** What production makes and accounts charge for, frozen now (review P1-06). */
  snapshot: OrderableConfigurationSnapshotV1;
}

export interface Delivery {
  zoneId: string;
  zoneName: string;
  pricing: "FIXED" | "QUOTE";
  /** For QUOTE, null until staff set the price (owner, 2026-10-05). */
  rateMinor: string | null;
  transitDays: { min: number; max: number } | null;
  chosen: boolean;
  /** QUOTE only: when staff were asked to price it, and when they did. */
  requestedAt?: string | null;
  quotedAt?: string | null;
}

/** Delivery to this address waits for staff to set its price. */
export const awaitingDeliveryPrice = (delivery: Delivery | null) => delivery?.pricing === "QUOTE" && delivery.rateMinor === null;

function canOpen(access: CartAccess, row: Row) {
  if (access.actor.type === "user" && row.ownerUserId === access.actor.session.userId) return true;
  return Boolean(access.deviceKey && row.ownerDeviceHash && row.ownerDeviceHash === deviceHash(access.deviceKey));
}

async function load(db: Db, access: CartAccess, id: string) {
  const [row] = await db.select().from(schema.checkouts).where(eq(schema.checkouts.id, id));
  if (!row || !canOpen(access, row)) throw new AppError("NOT_FOUND");
  return row;
}

export function totalsOf(row: Pick<Row, "items" | "delivery" | "vatRateBps" | "vatOnDelivery">) {
  const items = row.items as FrozenItem[];
  const delivery = row.delivery as Delivery | null;
  // A fixed zone rate, or the price staff set for a quoted address.
  const amount = delivery?.chosen && delivery.rateMinor !== null ? { amountMinor: BigInt(delivery.rateMinor) } : null;
  return checkoutTotals(
    items.map((item) => ({ vatMinor: BigInt(item.vatMinor), totalMinor: BigInt(item.totalMinor) })),
    amount,
    { vatRateBps: row.vatRateBps, vatOnDelivery: row.vatOnDelivery },
  );
}

function checkoutView(row: Row): Omit<Checkout, "payment" | "order"> {
  const items = row.items as FrozenItem[];
  const delivery = row.delivery as Delivery | null;
  const address = row.address as Checkout["address"];
  const done = (step: Step) => STEPS.indexOf(row.step as Step) > STEPS.indexOf(step);
  const blockers: Checkout["blockers"] = [];
  if (!done("billing")) blockers.push({ code: "STEPS_INCOMPLETE", message: "Finish the steps above to review and pay." });
  if (awaitingDeliveryPrice(delivery)) {
    blockers.push({
      code: "DELIVERY_QUOTE_REQUIRED",
      message: address?.country === "NG" ? "Delivery to this address is priced by our team. We'll email you the delivery price, then you can pay here." : "International freight is priced by our team. We'll email you the freight price, then you can pay here.",
    });
  }
  const leads = items.flatMap((item) => (item.leadDays ? [item.leadDays] : []));
  return {
    id: row.id,
    status: row.status,
    step: row.step as Step,
    version: row.version,
        // Item lines are before VAT; VAT is one line on the whole order (owner, 2026-10-05).
    items: items.map(({ productName, summary, quantity, totalMinor, vatMinor, perUnitMinor, cartTotalMinor }) => ({ productName, summary, quantity, totalMinor: (BigInt(totalMinor) - BigInt(vatMinor)).toString(), perUnitMinor, cartTotalMinor })),
    contact: row.contact as Checkout["contact"],
    address,
    delivery: delivery ? { zoneName: delivery.zoneName, pricing: delivery.pricing, rateMinor: delivery.rateMinor, transitDays: delivery.transitDays, chosen: delivery.chosen } : null,
    billing: row.billing as Checkout["billing"],
    totals: {
      goodsMinor: row.goodsMinor.toString(),
      deliveryMinor: row.deliveryMinor === null ? null : row.deliveryMinor.toString(),
      vatMinor: row.vatMinor.toString(),
      totalMinor: row.totalMinor.toString(),
      vatRateBps: row.vatRateBps,
    },
    international: Boolean(address && address.country !== "NG"),
    productionDays: leads.length ? { min: Math.max(...leads.map((lead) => lead.min)), max: Math.max(...leads.map((lead) => lead.max)) } : null,
    blockers,
    quoteItemsLeftInCart: false,
  };
}

async function withCartState(deps: CheckoutDeps, row: Row): Promise<Checkout> {
  const db = deps.db;
  const view: Checkout = { ...checkoutView(row), payment: await checkoutPayment(deps, row), order: row.status === "COMPLETED" ? await orderOfCheckout(db, row.id) : null };
  const off = row.status === "OPEN" ? paymentsBlocker(deps.gateway, await paymentSettings(db)) : null;
  if (off) view.blockers.push(off);
  if (row.cartId) {
    const [quote] = await db.select({ id: schema.cartItems.id }).from(schema.cartItems).where(and(eq(schema.cartItems.cartId, row.cartId), eq(schema.cartItems.group, "QUOTE"))).limit(1);
    view.quoteItemsLeftInCart = Boolean(quote);
  }
  return view;
}

export async function getCheckout(deps: CheckoutDeps, access: CartAccess, id: string) {
  return withCartState(deps, await load(deps.db, access, id));
}

/** "Pay" (TECH-05 §5): the amount is the checkout's own total, worked out by the server. */
export async function payCheckout(deps: PaymentDeps, access: CartAccess, id: string) {
  const row = await load(deps.db, access, id);
  return startCheckoutPayment(deps, access.actor, { row, blockers: checkoutView(row).blockers });
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

/** "Check out ready items" (Pen 41). Returns the cart's open checkout when nothing changed. */
export async function startCheckout(deps: CheckoutDeps, access: CartAccess): Promise<Checkout> {
  const db = deps.db;
  const now = access.actor.now;
  const { cart, items } = await readyItems(db, access);
  if (!cart || !items.length) throw new AppError("RULE_FAILED", { message: "Nothing in your cart is ready to check out.", context: { reason: "NOTHING_READY" } });

  const [open] = await db.select().from(schema.checkouts).where(and(eq(schema.checkouts.cartId, cart.id), eq(schema.checkouts.status, "OPEN")));
  const ids = items.map((item) => item.configurationId);
  if (open && sameSet(open.configurationIds, ids) && now.getTime() - open.createdAt.getTime() < FRESH_FOR_MS) return withCartState(deps, open);
  // A payment under way keeps its checkout: the customer finishes or waits for it first.
  if (open && (await checkoutsWithActivePayment(db, [open.id])).length) return withCartState(deps, open);

  const tax = await currentTaxSetting(db, now);
  const vat = { vatRateBps: tax?.vatRateBps ?? 0, vatOnDelivery: tax?.vatOnDelivery ?? false };
  const taxSnapshot = { settingId: tax?.id ?? null, ...vat };

  // The server's price now, not the cart's copy (TECH-05 §1).
  const frozen: FrozenItem[] = [];
  const nowQuote: string[] = [];
  for (const item of items) {
    const row = await reprice(db, item.configurationId, now);
    const draft: Configuration = await draftView(db, row, now);
    if (groupOf(draft) !== "READY") {
      // Its price now needs review: it moves to the quote group and stays out of this payment.
      nowQuote.push(item.id);
      continue;
    }
    const price = draft.price!;
    const addedPrice = (item.snapshot as Configuration).price;
    // Compared before VAT, as the cart showed it.
    const added = addedPrice?.totalMinor != null ? (BigInt(addedPrice.totalMinor) - BigInt(addedPrice.vatMinor ?? "0")).toString() : null;
    const net = (BigInt(price.totalMinor!) - BigInt(price.vatMinor!)).toString();
    frozen.push({
      configurationId: row.id,
      productName: draft.productName,
      summary: await choiceSummary(db, draft, row.productId),
      quantity: price.quantity,
      goodsMinor: price.goodsMinor!,
      vatMinor: price.vatMinor!,
      totalMinor: price.totalMinor!,
      perUnitMinor: price.perUnitMinor,
      cartTotalMinor: added !== null && added !== net ? added : null,
      leadDays: price.leadDays,
      priceResultId: price.id,
      snapshot: await orderableSnapshot(db, row, draft, taxSnapshot, now),
    });
  }
  if (frozen.some((item) => BigInt(item.totalMinor) <= 0n)) throw new AppError("RULE_FAILED", { message: "An item has no price. Contact us to finish this order.", context: { reason: "NO_PRICE" } });

  // The customer's answers carry over from the open checkout, or the one a change just closed.
  const [previous] = open ? [open] : await db.select().from(schema.checkouts).where(and(eq(schema.checkouts.cartId, cart.id), eq(schema.checkouts.status, "ABANDONED"))).orderBy(desc(schema.checkouts.createdAt)).limit(1);
  const earlier = previous ?? null;
  try {
    // Regrouping, closing the old checkout and opening the new one happen together (review P1-07):
    // when nothing is ready any more, the old checkout still closes.
    const created = await db.transaction(async (tx) => {
      if (nowQuote.length) await tx.update(schema.cartItems).set({ group: "QUOTE" }).where(inArray(schema.cartItems.id, nowQuote));
      if (open) {
        await tx.update(schema.checkouts).set({ status: "ABANDONED" }).where(and(eq(schema.checkouts.id, open.id), eq(schema.checkouts.status, "OPEN")));
        await cancelCheckoutPayments(tx, [open.id]);
      }
      if (!frozen.length) return null;
      const base = {
        cartId: cart.id,
        expiresAt: checkoutExpiry(now),
        ownerUserId: cart.ownerUserId,
        ownerDeviceHash: cart.ownerDeviceHash,
        items: frozen,
        configurationIds: frozen.map((item) => item.configurationId),
        ...vat,
        taxSettingId: tax?.id ?? null,
        // Keep the customer's earlier answers; delivery is chosen again because the goods changed.
        customerId: earlier?.customerId ?? null,
        contact: earlier?.contact ?? null,
        address: earlier?.address ?? null,
        deliveryZoneId: earlier?.deliveryZoneId ?? null,
        delivery: earlier?.delivery ? { ...(earlier.delivery as Delivery), chosen: false } : null,
        billing: earlier?.billing ?? null,
        step: earlier ? (earlier.address ? "delivery" : earlier.contact ? "address" : "contact") : "contact",
      };
      const totals = totalsOf(base);
      const [row] = await tx.insert(schema.checkouts).values({ ...base, ...totals }).returning();
      return row!;
    });
    if (!created) throw new AppError("RULE_FAILED", { message: "Prices changed and your items now need a quote. They're in the quote group in your cart.", context: { reason: "NOTHING_READY" } });
    return withCartState(deps, created);
  } catch (error) {
    // Two "Check out" clicks at once: the index lets one through, and both get it.
    if ((error as { cause?: { code?: string } }).cause?.code === "23505") {
      const [winner] = await db.select().from(schema.checkouts).where(and(eq(schema.checkouts.cartId, cart.id), eq(schema.checkouts.status, "OPEN")));
      if (winner) return withCartState(deps, winner);
    }
    throw error;
  }
}

async function save(deps: CheckoutDeps, row: Row, version: number, patch: Partial<typeof schema.checkouts.$inferInsert>) {
  const db = deps.db;
  const expired = row.expiresAt !== null && row.expiresAt.getTime() <= Date.now();
  if (row.status !== "OPEN" || expired) throw new AppError("CONFLICT", { message: "This checkout is closed. Go back to your cart to start again.", context: { reason: "CHECKOUT_CLOSED" } });
  // The amount being paid can't change under the customer's payment (TECH-05 §1).
  if ((await checkoutsWithActivePayment(db, [row.id])).length) throw paymentInProgress();
  const next = { ...row, ...patch } as Row;
  const totals = totalsOf(next);
  const [updated] = await db
    .update(schema.checkouts)
    .set({ ...patch, ...totals, version: sql`${schema.checkouts.version} + 1` })
    .where(and(eq(schema.checkouts.id, row.id), eq(schema.checkouts.version, version), eq(schema.checkouts.status, "OPEN")))
    .returning();
  if (!updated) throw new AppError("CONFLICT", { message: "This checkout changed in another tab. Reload to continue.", context: { reason: "STALE_VERSION" } });
  return withCartState(deps, updated);
}

/** The step after `step`, unless the customer already got further. */
const advance = (current: string, step: Step): Step => {
  const next = STEPS[STEPS.indexOf(step) + 1]!;
  return STEPS.indexOf(current as Step) > STEPS.indexOf(next) ? (current as Step) : next;
};

/** One transaction: a stale version leaves no customer record behind (review P2-01). */
export async function setContact(deps: CheckoutDeps, access: CartAccess, id: string, input: z.infer<typeof checkoutContactSchema> & { version: number }) {
  return deps.db.transaction(async (transaction) => {
    const tx = transaction as unknown as Db;
    const row = await load(tx, access, id);
    // Signed in, the checkout belongs to the account's customer; the typed email is only where we write to.
    const owner = access.actor.type === "user" ? await ensureAccountCustomer(tx, access.actor.session, access.actor.now) : await ensureGuestCustomer(tx, input);
    return save({ ...deps, db: tx }, row, input.version, { contact: { name: input.name, email: input.email, phone: input.phone }, customerId: owner.id, step: advance(row.step, "contact") });
  });
}

export async function setAddress(deps: CheckoutDeps, access: CartAccess, id: string, input: z.infer<typeof checkoutAddressSchema> & { version: number }) {
  const db = deps.db;
  const row = await load(db, access, id);
  if (!row.contact) throw new AppError("RULE_FAILED", { message: "Add your contact details first.", context: { reason: "STEP_ORDER" } });
  const zones = await loadZones(db);
  const zone = zoneFor(zones.map((item) => ({ ...item, covers: item.covers as Cover[] })), input);
  const delivery: Delivery = zone
    ? {
        zoneId: zone.id,
        zoneName: zone.name,
        pricing: zone.pricing,
        rateMinor: zone.rateMinor === null ? null : zone.rateMinor.toString(),
        transitDays: zone.transitMinDays !== null && zone.transitMaxDays !== null ? { min: zone.transitMinDays, max: zone.transitMaxDays } : null,
        chosen: false,
      }
    : // No zones set up yet: every delivery is priced by staff (Pen 108 empty state).
      { zoneId: "", zoneName: input.country === "NG" ? "Delivery" : "International", pricing: "QUOTE", rateMinor: null, transitDays: null, chosen: false };
  const { version: _version, ...address } = input;
  void _version;
  // A new address means choosing delivery again (the rate may differ).
  const step: Step = STEPS.indexOf(row.step as Step) > STEPS.indexOf("delivery") ? "delivery" : advance(row.step, "address");
  return save(deps, row, input.version, {
    address: { ...address, landmark: address.landmark ?? null, postcode: address.postcode ?? null },
    deliveryZoneId: zone?.id ?? null,
    delivery,
    step,
  });
}

export async function setDelivery(deps: CheckoutDeps, access: CartAccess, id: string, input: { option: "STANDARD"; version: number }) {
  const row = await load(deps.db, access, id);
  const delivery = row.delivery as Delivery | null;
  if (!delivery) throw new AppError("RULE_FAILED", { message: "Add the delivery address first.", context: { reason: "STEP_ORDER" } });
  return save(deps, row, input.version, { delivery: { ...delivery, chosen: true }, step: advance(row.step, "delivery") });
}

export async function setBilling(deps: CheckoutDeps, access: CartAccess, id: string, input: z.infer<typeof checkoutBillingSchema> & { version: number }) {
  const row = await load(deps.db, access, id);
  if (!(row.delivery as Delivery | null)?.chosen) throw new AppError("RULE_FAILED", { message: "Choose delivery first.", context: { reason: "STEP_ORDER" } });
  if (!input.sameAsDelivery && !input.address) throw new AppError("VALIDATION_FAILED", { fieldErrors: { address: "Enter the billing address, or use the delivery address" } });
  const { version: _version, ...billing } = input;
  void _version;
  return save(deps, row, input.version, { billing, step: advance(row.step, "billing") });
}
