import { TEST_PEOPLE } from "@holypearls/auth";
import { orderSchema } from "@holypearls/contracts";
import { and, eq, schema, sql } from "@holypearls/db";
import { FakeGateway } from "@holypearls/testkit";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { checkPaymentAttempt } from "../payments/payments.js";
import { as, signInActors, type Actors } from "../testing/actors.js";
import { orderFlows } from "../testing/flows.js";
import { createHarness, type Harness } from "../testing/harness.js";

let h: Harness;
let gateway: FakeGateway;
let actors: Partial<Actors>;
let organizationId: string;
let locationId: string;
let ownerUserId: string;
let oldUnpaid: string;
let usdOrder: string;
const db = () => h.database.db;
const client = () => as(h, actors.acmeOwner!);
const base = () => `/v1/organizations/${organizationId}`;
const flows = orderFlows(
  () => h,
  () => gateway,
);

async function place(orderId: string, date = new Date()) {
  await db().update(schema.orders).set({ organizationId, locationId, ownerUserId, ownerDeviceHash: null, placedAt: date }).where(eq(schema.orders.id, orderId));
}

beforeAll(async () => {
  gateway = new FakeGateway();
  h = await createHarness({ payments: gateway });
  await db()
    .update(schema.paymentSettings)
    .set({ onlinePayments: true, usdEnabled: true, accountSupports: { usd: true } })
    .where(eq(schema.paymentSettings.id, 1));
  actors = await signInActors(h, ["acmeOwner", "adminAda"]);
  const [member] = await db()
    .select({ membership: schema.memberships })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(eq(schema.users.email, TEST_PEOPLE.acmeOwner.email));
  organizationId = member!.membership.organizationId;
  ownerUserId = member!.membership.userId;
  const [location] = await db().select().from(schema.locations).where(eq(schema.locations.organizationId, organizationId));
  locationId = location!.id;

  const debt = await flows.acceptedQuote(flows.staff(actors.adminAda!));
  oldUnpaid = debt.orderId;
  await place(oldUnpaid, new Date(Date.now() - 365 * 86_400_000));
  const usd = await flows.acceptedQuote(flows.staff(actors.adminAda!), "USD");
  usdOrder = usd.orderId;
  await flows.payNext(usd.guest, usdOrder);
  await place(usdOrder);
  const paid = await flows.paidOrder();
  await place(paid.orderId);
  const [original] = await db().select().from(schema.orders).where(eq(schema.orders.id, paid.orderId));
  const [checkout] = await db().select().from(schema.checkouts).where(eq(schema.checkouts.id, original!.checkoutId!));
  const [item] = await db().select().from(schema.orderItems).where(eq(schema.orderItems.orderId, original!.id));
  const [receipt] = await db().select().from(schema.receipts).where(eq(schema.receipts.orderId, original!.id));
  const [intent] = await db().select().from(schema.paymentIntents).where(eq(schema.paymentIntents.id, receipt!.intentId));
  const [part] = await db().select().from(schema.installments).where(eq(schema.installments.id, intent!.installmentId));
  const [schedule] = await db().select().from(schema.paymentSchedules).where(eq(schema.paymentSchedules.id, part!.scheduleId));
  const [attempt] = await db().select().from(schema.paymentAttempts).where(eq(schema.paymentAttempts.id, receipt!.attemptId));
  await db().update(schema.orderItems).set({ status: "DELIVERED" }).where(eq(schema.orderItems.orderId, original!.id));
  const records = Array.from({ length: 210 }, (_, n) => ({
    n,
    order: randomUUID(),
    checkout: randomUUID(),
    item: randomUUID(),
    schedule: randomUUID(),
    part: randomUUID(),
    intent: randomUUID(),
    attempt: randomUUID(),
    receipt: randomUUID(),
  }));
  const date = new Date(Date.now() + 60_000);
  // Complete financial chains, with tied dates, make page boundaries and full-scope totals observable.
  await db().transaction(async (tx) => {
    await tx.insert(schema.checkouts).values(records.map((r) => ({ ...checkout!, id: r.checkout, organizationId, locationId, ownerUserId, ownerDeviceHash: null })));
    await tx.insert(schema.orders).values(records.map((r) => ({ ...original!, id: r.order, checkoutId: r.checkout, number: `HISTORY-${r.n}`, placedAt: date })));
    await tx.insert(schema.orderItems).values(records.map((r) => ({ ...item!, id: r.item, orderId: r.order, status: "DELIVERED" as const })));
    await tx.insert(schema.paymentSchedules).values(records.map((r) => ({ ...schedule!, id: r.schedule, checkoutId: r.checkout })));
    await tx.insert(schema.installments).values(records.map((r) => ({ ...part!, id: r.part, scheduleId: r.schedule })));
    await tx.insert(schema.paymentIntents).values(records.map((r) => ({ ...intent!, id: r.intent, installmentId: r.part, status: "OPEN" as const, succeededAttemptId: null })));
    await tx.insert(schema.paymentAttempts).values(records.map((r) => ({ ...attempt!, id: r.attempt, intentId: r.intent, reference: `HISTORY-PAY-${r.n}` })));
    await tx.execute(
      sql`update payment_intents i set status = 'SUCCEEDED', succeeded_attempt_id = v.attempt_id from (values ${sql.join(
        records.map((r) => sql`(${r.intent}::uuid, ${r.attempt}::uuid)`),
        sql`, `,
      )}) v(intent_id, attempt_id) where i.id = v.intent_id`,
    );
    await tx
      .insert(schema.receipts)
      .values(
        records.map((r) => ({
          ...receipt!,
          id: r.receipt,
          orderId: r.order,
          intentId: r.intent,
          attemptId: r.attempt,
          number: `HISTORY-RECEIPT-${r.n}`,
          paystackReference: `HISTORY-PAY-${r.n}`,
          paidAt: date,
        })),
      );
  });
});
afterAll(async () => {
  await h?.close();
});

it("keeps NGN and USD totals separate without converting either currency", async () => {
  const expected = await db()
    .select({ currency: schema.receipts.currency, paid: sql<string>`sum(${schema.receipts.amountMinor})::text` })
    .from(schema.receipts)
    .innerJoin(schema.orders, eq(schema.orders.id, schema.receipts.orderId))
    .where(eq(schema.orders.organizationId, organizationId))
    .groupBy(schema.receipts.currency);
  const response = await client().get(`${base()}/billing`);
  expect(response.status).toBe(200);
  expect(response.body.totals).toEqual(expect.arrayContaining(expected.map((row) => expect.objectContaining({ currency: row.currency, paidThisYearMinor: row.paid }))));
  expect(response.body).not.toHaveProperty("paidThisYearMinor");
});

it("finds old unpaid work before limiting active and attention views, and bills its full balance", async () => {
  const attention = await client().get(`${base()}/orders?view=attention`);
  expect(attention.body.orders.map((row: { id: string }) => row.id)).toContain(oldUnpaid);
  const active = await client().get(`${base()}/orders?view=active`);
  expect(active.body.orders.map((row: { id: string }) => row.id)).toContain(oldUnpaid);
  expect(active.body.counts).toMatchObject({ all: 213, active: 2, complete: 211, attention: 1 });
  const overview = await client().get(`${base()}/overview`);
  expect(overview.body.needsAttention.some((row: { href: string }) => row.href === `/orders/${oldUnpaid}`)).toBe(true);
  const billing = await client().get(`${base()}/billing`);
  expect(billing.body.balancesDue.some((row: { orderId: string }) => row.orderId === oldUnpaid)).toBe(true);
});

it("offers stable order and receipt cursors beyond their first pages, including tied timestamps", async () => {
  for (const path of ["orders?view=all", "billing"]) {
    const field = path.startsWith("orders") ? "orders" : "receipts";
    const cursorField = field === "orders" ? "nextCursor" : "receiptsNextCursor";
    const all: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const response = await client().get(`${base()}/${path}${cursor ? `${path.includes("?") ? "&" : "?"}cursor=${encodeURIComponent(cursor)}` : ""}`);
      expect(response.status).toBe(200);
      all.push(...response.body[field].map((row: { id: string }) => row.id));
      expect(response.body).toHaveProperty(cursorField);
      cursor = response.body[cursorField];
      expect(++pages).toBeLessThan(10);
    } while (cursor);
    expect(all).toHaveLength(field === "orders" ? 213 : 212);
    expect(new Set(all).size).toBe(all.length);
  }
});

it("batches a page's cards instead of querying once per order", async () => {
  const pool = Reflect.get(db(), "$client") as { query(...args: unknown[]): unknown };
  const queries = vi.spyOn(pool, "query");
  try {
    expect((await client().get(`${base()}/orders?view=all`)).status).toBe(200);
    const reads = queries.mock.calls.filter((args) => {
      const text = typeof args[0] === "string" ? args[0] : ((args[0] as { text?: string })?.text ?? "");
      return /^select/i.test(text) && !text.includes("pgboss");
    });
    expect(reads.length).toBeGreaterThan(5);
    expect(reads.length).toBeLessThanOrEqual(30);
  } finally {
    queries.mockRestore();
  }
});

it("reports the failed installment on both the order and its workspace card", async () => {
  const [part] = await db()
    .select({ part: schema.installments })
    .from(schema.installments)
    .innerJoin(schema.paymentSchedules, eq(schema.paymentSchedules.id, schema.installments.scheduleId))
    .innerJoin(schema.orders, eq(schema.orders.quoteVersionId, schema.paymentSchedules.quoteVersionId))
    .where(and(eq(schema.orders.id, oldUnpaid), eq(schema.installments.position, 1)));
  const started = await client().post(`/v1/orders/${oldUnpaid}/installments/${part!.part.id}/payments`);
  expect(started.status).toBe(200);
  gateway.settle(started.body.reference, { status: "failed" });
  const [attempt] = await db().select().from(schema.paymentAttempts).where(eq(schema.paymentAttempts.reference, started.body.reference));
  await checkPaymentAttempt({ db: db(), gateway, notify: null }, attempt!.id, 1);
  const order = orderSchema.parse((await client().get(`/v1/orders/${oldUnpaid}`)).body);
  expect(order.paymentStatus).toBe("PAYMENT_FAILED");
  const list = await client().get(`${base()}/orders?view=attention`);
  expect(list.body.orders.find((row: { id: string }) => row.id === oldUnpaid)?.paymentStatus).toBe("PAYMENT_FAILED");
});

it("rejects malformed cursors at the request boundary", async () => {
  for (const route of ["orders", "billing"])
    for (const cursor of ["garbage", Buffer.from('{"at":"yesterday","id":"anything"}').toString("base64url")]) {
      expect((await client().get(`${base()}/${route}?cursor=${cursor}`)).status).toBe(400);
    }
});
