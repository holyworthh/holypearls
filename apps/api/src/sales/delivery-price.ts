import type { DeliveryPriceQueue, deliveryPriceInputSchema } from "@holypearls/contracts";
import { and, eq, gt, isNull, or, schema, sql } from "@holypearls/db";
import type { z } from "zod";
import { AppError } from "../errors.js";
import type { ActorContext } from "../identity/actor.js";
import { recordAudit } from "../platform/audit.js";
import type { HelpDeps } from "../platform/help-requests.js";
import { queueEmail } from "../platform/notifications.js";
import { checkoutsWithActivePayment } from "../payments/payments.js";
import { awaitingDeliveryPrice, type Delivery, totalsOf } from "./checkout.js";
import { checkoutExpiry } from "./retention.js";

/*
 * Delivery priced by staff (owner, 2026-10-05). An address outside the
 * delivery zones (other states, abroad) has no rate, so checkout holds
 * payment until staff set one. Staff are told once the customer has finished
 * the steps; setting the price keeps the checkout open for 72 more hours and
 * emails the customer. A new address clears the price, since it was for that place.
 */

type Row = typeof schema.checkouts.$inferSelect;
const naira = (minor: bigint) => `₦${(Number(minor) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const placeOf = (row: Row) => {
  const address = row.address as { area?: string; state?: string; country?: string } | null;
  return [address?.area, address?.state, address?.country].filter(Boolean).join(", ") || "an address outside the zones";
};
const open = (now: Date) => and(eq(schema.checkouts.status, "OPEN"), or(isNull(schema.checkouts.expiresAt), gt(schema.checkouts.expiresAt, now)));

/** After the last checkout step: asks staff for the price, once per address. */
export async function requestDeliveryPrice(deps: HelpDeps, checkoutId: string, now: Date, requestId: string) {
  const [row] = await deps.db.select().from(schema.checkouts).where(eq(schema.checkouts.id, checkoutId));
  const delivery = row?.delivery as Delivery | null;
  if (!row || row.step !== "review" || !delivery?.chosen || !awaitingDeliveryPrice(delivery) || delivery.requestedAt) return;
  await deps.db.transaction(async (tx) => {
    // Marked without a new version, so the customer's open page stays current.
    const marked = await tx
      .update(schema.checkouts)
      .set({ delivery: { ...delivery, requestedAt: now.toISOString() } })
      .where(and(eq(schema.checkouts.id, row.id), sql`${schema.checkouts.delivery}->>'requestedAt' is null`))
      .returning({ id: schema.checkouts.id });
    if (!marked.length) return;
    await queueEmail(deps, tx, {
      template: "delivery_price_needed",
      to: deps.helpInboxEmail,
      data: { place: placeOf(row), url: `${deps.adminOrigin}/delivery-prices` },
      record: { type: "CHECKOUT", id: row.id, label: `Delivery price · ${placeOf(row)}` },
      linkLabel: "Opens the delivery prices queue",
      requestId,
    });
  });
}

export async function deliveryPriceQueue(deps: Pick<HelpDeps, "db">, now: Date): Promise<DeliveryPriceQueue> {
  const rows = await deps.db
    .select()
    .from(schema.checkouts)
    .where(and(open(now), sql`${schema.checkouts.delivery}->>'pricing' = 'QUOTE'`, sql`${schema.checkouts.delivery}->>'rateMinor' is null`, sql`${schema.checkouts.delivery}->>'requestedAt' is not null`))
    .orderBy(sql`${schema.checkouts.delivery}->>'requestedAt'`)
    .limit(100);
  return {
    items: rows.map((row) => {
      const delivery = row.delivery as Delivery;
      const contact = row.contact as { name?: string; email: string } | null;
      const items = row.items as { productName: string; quantity: number }[];
      return {
        checkoutId: row.id,
        version: row.version,
        zoneName: delivery.zoneName,
        place: placeOf(row),
        customer: contact?.name || contact?.email || "Customer",
        items: items.map((item) => `${item.productName} × ${item.quantity.toLocaleString("en-NG")}`).join(", "),
        goodsMinor: row.goodsMinor.toString(),
        requestedAt: delivery.requestedAt!,
        expiresAt: row.expiresAt?.toISOString() ?? null,
      };
    }),
  };
}

/** Staff set the delivery price (PRICING_MANAGE). The customer is emailed and can pay. */
export async function setDeliveryPrice(deps: HelpDeps, actor: ActorContext, id: string, input: z.infer<typeof deliveryPriceInputSchema>) {
  const now = actor.now;
  const updated = await deps.db.transaction(async (tx) => {
    const [row] = await tx.select().from(schema.checkouts).where(eq(schema.checkouts.id, id)).for("update");
    if (!row) throw new AppError("NOT_FOUND");
    const delivery = row.delivery as Delivery | null;
    if (row.status !== "OPEN" || (row.expiresAt && row.expiresAt <= now)) {
      throw new AppError("CONFLICT", { message: "This checkout has closed. The customer will need to check out again.", context: { reason: "CHECKOUT_CLOSED" } });
    }
    if (!delivery?.chosen || delivery.pricing !== "QUOTE") throw new AppError("RULE_FAILED", { message: "This checkout's delivery already has a zone rate.", context: { reason: "NOT_QUOTED_DELIVERY" } });
    if (row.version !== input.version) throw new AppError("VERSION_CONFLICT");
    if ((await checkoutsWithActivePayment(tx, [row.id])).length) {
      throw new AppError("CONFLICT", { message: "The customer is paying right now. Try again in a few minutes.", context: { reason: "PAYMENT_IN_PROGRESS" } });
    }
    const priced: Delivery = { ...delivery, rateMinor: input.rateMinor, transitDays: { min: input.transitMinDays, max: input.transitMaxDays }, quotedAt: now.toISOString() };
    const totals = totalsOf({ ...row, delivery: priced });
    const later = checkoutExpiry(now);
    const [saved] = await tx
      .update(schema.checkouts)
      .set({ delivery: priced, ...totals, expiresAt: !row.expiresAt || row.expiresAt < later ? later : row.expiresAt, version: sql`${schema.checkouts.version} + 1` })
      .where(eq(schema.checkouts.id, row.id))
      .returning();
    await recordAudit(tx, actor, {
      action: "checkout.delivery_priced",
      summary: `Delivery priced at ${naira(BigInt(input.rateMinor))} for ${placeOf(row)}`,
      recordType: "CHECKOUT",
      recordId: row.id,
      before: { rateMinor: null },
      after: { rateMinor: input.rateMinor, transitDays: priced.transitDays },
      permission: "PRICING_MANAGE",
    });
    const contact = row.contact as { email: string } | null;
    if (contact?.email) {
      await queueEmail(deps, tx, {
        template: "delivery_price_ready",
        to: contact.email,
        customerId: row.customerId ?? undefined,
        data: { delivery: naira(BigInt(input.rateMinor)), total: naira(totals.totalMinor), url: `${deps.webOrigin}/checkout/${row.id}` },
        record: { type: "CHECKOUT", id: row.id, label: "Delivery price ready" },
        linkLabel: "Opens the checkout",
        requestId: actor.requestId,
      });
    }
    return saved!;
  });
  return { checkoutId: updated.id, version: updated.version, totalMinor: updated.totalMinor.toString() };
}
