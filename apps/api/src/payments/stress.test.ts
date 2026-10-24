import { checkoutSchema, orderSchema, paymentStartSchema, projectSchema } from "@holypearls/contracts";
import { and, eq, schema, sql } from "@holypearls/db";
import { FakeGateway } from "@holypearls/testkit";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { type Browser, no5xx, orderFlows, STRESS_RUNS } from "../testing/flows.js";
import { createHarness, type Harness } from "../testing/harness.js";
import { checkPaymentAttempt, processPaystackEvent, settleUnanswered } from "./payments.js";

/*
 * T15-03 payment stress (TECH-05 §16, "no duplicates across 100 parallel
 * runs"): every scenario sends STRESS_RUNS requests at once against one
 * record through the real API and the fake gateway, with the pool the size
 * production uses, then counts rows. One attempt, intent, schedule, order and
 * receipt each, and no server error.
 */

vi.setConfig({ testTimeout: 600_000 });

let harness: Harness;
let gateway: FakeGateway;
const db = () => harness.database.db;
const flows = orderFlows(
  () => harness,
  () => gateway,
);
const deps = () => ({ db: db(), gateway, notify: flows.notify() });
const N = STRESS_RUNS;

const reasonOf = (response: request.Response) => (response.body?.context?.reason as string | undefined) ?? (response.body?.code as string | undefined);
const payPath = (checkoutId: string) => `/v1/checkouts/${checkoutId}/payments`;
const times = <T>(run: (index: number) => Promise<T>) => Promise.all(Array.from({ length: N }, (_, index) => run(index)));

const attemptOf = async (reference: string) => (await db().select().from(schema.paymentAttempts).where(eq(schema.paymentAttempts.reference, reference)))[0]!;
const intentById = async (id: string) => (await db().select().from(schema.paymentIntents).where(eq(schema.paymentIntents.id, id)))[0]!;
const attemptsOf = (intentId: string) => db().select().from(schema.paymentAttempts).where(eq(schema.paymentAttempts.intentId, intentId));
const reviewsOf = (intentId: string) => db().select().from(schema.paymentReviews).where(eq(schema.paymentReviews.intentId, intentId));
const receiptsOf = (intentId: string) => db().select().from(schema.receipts).where(eq(schema.receipts.intentId, intentId));
const ordersOf = (checkoutId: string) => db().select().from(schema.orders).where(eq(schema.orders.checkoutId, checkoutId));
const schedulesOf = (checkoutId: string) => db().select().from(schema.paymentSchedules).where(eq(schema.paymentSchedules.checkoutId, checkoutId));
const intentsOfCheckout = (checkoutId: string) =>
  db()
    .select({ intent: schema.paymentIntents })
    .from(schema.paymentIntents)
    .innerJoin(schema.installments, eq(schema.installments.id, schema.paymentIntents.installmentId))
    .innerJoin(schema.paymentSchedules, eq(schema.paymentSchedules.id, schema.installments.scheduleId))
    .where(eq(schema.paymentSchedules.checkoutId, checkoutId))
    .then((rows) => rows.map((row) => row.intent));
const checkoutRow = async (id: string) => (await db().select().from(schema.checkouts).where(eq(schema.checkouts.id, id)))[0]!;
const setPayments = (on: boolean) => db().update(schema.paymentSettings).set({ onlinePayments: on }).where(eq(schema.paymentSettings.id, 1));

/** A ready checkout whose payment was started once; the attempt's row. */
async function started(b: Browser, checkoutId: string) {
  return attemptOf(paymentStartSchema.parse((await b.post(payPath(checkoutId))).body).reference);
}

/** Every response but one winner is a refusal the customer can understand. */
function oneWinner(responses: request.Response[], refusals: string[]) {
  no5xx(responses);
  expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
  const others = responses.filter((response) => response.status !== 200);
  expect(others.map((response) => response.status)).toEqual(others.map(() => 409));
  expect([...new Set(others.map(reasonOf))].filter((reason) => !refusals.includes(reason!))).toEqual([]);
}

/** Sessions of this test database waiting for a row lock. */
const waiting = async () => (await db().execute<{ n: number }>(sql`select count(*)::int as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'`)).rows[0]!.n;

/**
 * Holds a row lock while each task starts, in order, and waits until it is
 * queued behind the lock; then lets go. Makes a lock-order mistake happen
 * every time instead of one run in a thousand.
 */
async function queueBehind(lock: (tx: Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0]) => Promise<unknown>, tasks: (() => Promise<unknown>)[]) {
  let release!: () => void;
  let locked!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const ready = new Promise<void>((resolve) => (locked = resolve));
  const held = db().transaction(async (tx) => {
    await lock(tx);
    locked();
    await gate;
  });
  await ready;
  const running: Promise<unknown>[] = [];
  try {
    for (const [index, task] of tasks.entries()) {
      running.push(task());
      for (let tries = 0; tries < 400 && (await waiting()) <= index; tries++) await new Promise((resolve) => setTimeout(resolve, 50));
      expect(await waiting()).toBeGreaterThan(index);
    }
  } finally {
    release();
    await held;
  }
  return Promise.allSettled(running);
}

/** No check, event or result threw: a deadlock or timeout would show here. */
const noRejections = (settled: PromiseSettledResult<unknown>[]) =>
  expect(settled.filter((result): result is PromiseRejectedResult => result.status === "rejected").map((result) => String(result.reason))).toEqual([]);

/** The intent and its one attempt are for exactly what the checkout now totals. */
async function expectPaymentMatchesCheckout(checkoutId: string) {
  const row = await checkoutRow(checkoutId);
  const [intent] = await intentsOfCheckout(checkoutId);
  const attempts = await attemptsOf(intent!.id);
  expect(attempts).toHaveLength(1);
  expect(intent!.amountMinor).toBe(row.totalMinor);
  expect(attempts[0]!.amountMinor).toBe(row.totalMinor);
}

/** A Lagos address for the checkout step; other addresses spread over it. */
const lagos = (version: number) => ({ country: "NG", name: "Order Tester (TEST DATA)", phone: "0800 000 0000", street: "12 Admiralty Way", area: "Eti-Osa", state: "Lagos", landmark: "", version });
const kano = (version: number) => ({ ...lagos(version), street: "4 Bompai Road", area: "Nassarawa", state: "Kano" });

beforeAll(async () => {
  gateway = new FakeGateway();
  harness = await createHarness({ payments: gateway, poolSize: 10 });
  await setPayments(true);
});

afterAll(async () => {
  await harness?.close();
});

describe("starting a payment, 100 at once", () => {
  it("S1: different keys make one schedule, one intent and one attempt", async () => {
    const { b, checkout } = await flows.readyCheckout();
    const transactions = gateway.transactions.size;
    const responses = await times(() => b.post(payPath(checkout.id)));
    // A press that read the checkout before the first Pay committed sees a changed version (R2) rather than a payment in progress.
    oneWinner(responses, ["PAYMENT_IN_PROGRESS", "STALE_VERSION"]);
    const intents = await intentsOfCheckout(checkout.id);
    expect(intents).toHaveLength(1);
    expect(await attemptsOf(intents[0]!.id)).toHaveLength(1);
    expect(await schedulesOf(checkout.id)).toHaveLength(1);
    expect(gateway.transactions.size).toBe(transactions + 1);
  });

  it("S1b: the same key 100 times is one attempt, replayed", async () => {
    const { b, checkout } = await flows.readyCheckout();
    const key = `test_stress_${checkout.id.replaceAll("-", "")}`;
    const responses = await times(() => b.post(payPath(checkout.id), {}, key));
    no5xx(responses);
    const done = responses.filter((response) => response.status === 200);
    expect(done.length).toBeGreaterThanOrEqual(1);
    expect(new Set(done.map((response) => paymentStartSchema.parse(response.body).reference)).size).toBe(1);
    const others = responses.filter((response) => response.status !== 200);
    expect(others.map(reasonOf).filter((reason) => reason !== "IDEMPOTENCY_IN_PROGRESS")).toEqual([]);
    const intents = await intentsOfCheckout(checkout.id);
    expect(intents).toHaveLength(1);
    expect(await attemptsOf(intents[0]!.id)).toHaveLength(1);
  });

  it("S2: paying one installment of an accepted quote 100 times makes one intent and one attempt", async () => {
    const ada = flows.staff(await harness.signInAs("adminAda"));
    const { guest, orderId } = await flows.acceptedQuote(ada);
    const order = orderSchema.parse((await guest.get(`/v1/orders/${orderId}`)).body);
    const next = order.payments!.next!;
    const responses = await times(() => guest.post(`/v1/orders/${orderId}/installments/${next.id}/payments`));
    oneWinner(responses, ["PAYMENT_IN_PROGRESS"]);
    const intents = await db().select().from(schema.paymentIntents).where(eq(schema.paymentIntents.installmentId, next.id));
    expect(intents).toHaveLength(1);
    expect(await attemptsOf(intents[0]!.id)).toHaveLength(1);
  });
});

describe("results arriving 100 at once", () => {
  it("S3: replayed webhooks and checks credit the payment once", async () => {
    const { b, checkout, contact } = await flows.readyCheckout();
    const attempt = await started(b, checkout.id);
    gateway.settle(attempt.reference, { status: "success" });

    const same = gateway.webhook("charge.success", attempt.reference, { id: 777_001 });
    const send = (hook: { body: Buffer; signature: string }) =>
      request(harness.url).post("/v1/webhooks/paystack").set("content-type", "application/json").set("x-paystack-signature", hook.signature).send(hook.body.toString("utf8"));
    const posted = await Promise.all([
      ...Array.from({ length: N / 2 }, () => send(same)),
      ...Array.from({ length: N / 2 }, (_, index) => send(gateway.webhook("charge.success", attempt.reference, { id: 888_000 + index, data: { customer: { email: contact.email, first_name: "Stress" } } }))),
    ]);
    no5xx(posted);
    expect(posted.every((response) => response.status === 200)).toBe(true);

    const events = await db().select().from(schema.paystackEvents).where(eq(schema.paystackEvents.reference, attempt.reference));
    expect(events).toHaveLength(N / 2 + 1);
    const ids = events.map((event) => sql`${event.id}`);
    const [jobs] = (await db().execute(sql`select count(*)::int as n from pgboss.job where name = 'payment.verify' and data->>'eventId' in (${sql.join(ids, sql`, `)})`)).rows as { n: number }[];
    expect(jobs!.n).toBe(N / 2 + 1);

    const settled = await Promise.allSettled([...events.map((event) => processPaystackEvent(deps(), event.id)), ...Array.from({ length: N }, () => checkPaymentAttempt(deps(), attempt.id, 1))]);
    noRejections(settled);

    const intent = await intentById(attempt.intentId);
    expect(intent.status).toBe("SUCCEEDED");
    expect(intent.succeededAttemptId).toBe(attempt.id);
    expect(await ordersOf(checkout.id)).toHaveLength(1);
    expect(await receiptsOf(intent.id)).toHaveLength(1);
    expect(await reviewsOf(intent.id)).toHaveLength(0);
    const [installment] = await db().select().from(schema.installments).where(eq(schema.installments.id, intent.installmentId));
    expect(installment!.status).toBe("PAID");
    expect(await db().select().from(schema.notifications).where(and(eq(schema.notifications.template, "order_confirmed"), eq(schema.notifications.recipient, contact.email)))).toHaveLength(1);
    expect(await db().select().from(schema.auditLog).where(and(eq(schema.auditLog.action, "payment.succeeded"), eq(schema.auditLog.recordId, intent.id)))).toHaveLength(1);
  });

  it("S4: two tabs both paid: one order, one receipt, one DUPLICATE_PAYMENT review", async () => {
    const { b, checkout } = await flows.readyCheckout();
    const first = await started(b, checkout.id);
    harness.now.value = new Date(Date.now() + 11 * 60 * 1000);
    let second;
    try {
      second = await started(b, checkout.id);
    } finally {
      harness.now.value = null;
    }
    gateway.settle(first.reference, { status: "success" });
    gateway.settle(second.reference, { status: "success" });
    const settled = await Promise.allSettled(Array.from({ length: N }, (_, index) => checkPaymentAttempt(deps(), (index % 2 ? first : second).id, 1)));
    noRejections(settled);

    expect(await ordersOf(checkout.id)).toHaveLength(1);
    const intent = await intentById(first.intentId);
    expect(await receiptsOf(intent.id)).toHaveLength(1);
    expect((await attemptOf(first.reference)).status).toBe("SUCCEEDED");
    expect((await attemptOf(second.reference)).status).toBe("SUCCEEDED");
    expect(intent.status).toBe("REVIEW_REQUIRED");
    expect((await reviewsOf(intent.id)).map((review) => review.reason)).toEqual(["DUPLICATE_PAYMENT"]);
  });

  it("S5: a success landing while customers press Pay again never deadlocks", async () => {
    const { b, checkout } = await flows.readyCheckout();
    const first = await started(b, checkout.id);
    harness.now.value = new Date(Date.now() + 11 * 60 * 1000);
    try {
      gateway.settle(first.reference, { status: "success" });
      const [presses, checks] = await Promise.all([
        Promise.all(Array.from({ length: N / 2 }, () => b.post(payPath(checkout.id)))),
        Promise.allSettled(Array.from({ length: N / 2 }, () => checkPaymentAttempt(deps(), first.id, 1))),
      ]);
      no5xx(presses);
      expect(presses.filter((response) => response.status === 200).length).toBeLessThanOrEqual(1);
      noRejections(checks);
    } finally {
      harness.now.value = null;
    }
    expect(await ordersOf(checkout.id)).toHaveLength(1);
    expect(await receiptsOf(first.intentId)).toHaveLength(1);
  });

  it("S6: Paystack timing out on checks never double-credits; a final check nobody answers waits for the dead-letter handler", async () => {
    const { b, checkout } = await flows.readyCheckout();
    const attempt = await started(b, checkout.id);
    gateway.settle(attempt.reference, { status: "success" });
    gateway.verifyFailures = 60;
    const settled = await Promise.allSettled(Array.from({ length: N }, () => checkPaymentAttempt(deps(), attempt.id, 1)));
    const rejected = settled.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    // Checks that start after the first success see a finished attempt and skip Paystack, so not every failure is used.
    expect(rejected).toHaveLength(60 - gateway.verifyFailures);
    expect(rejected.every((result) => String(result.reason).includes("timed out"))).toBe(true);
    gateway.verifyFailures = 0;
    const intent = await intentById(attempt.intentId);
    expect(intent.status).toBe("SUCCEEDED");
    expect(await receiptsOf(intent.id)).toHaveLength(1);
    expect(await reviewsOf(intent.id)).toHaveLength(0);

    // The last scheduled check also times out every retry: the attempt is left PENDING with no review.
    const other = await flows.readyCheckout();
    const silent = await started(other.b, other.checkout.id);
    gateway.verifyFailures = N;
    const lost = await Promise.allSettled(Array.from({ length: N }, () => checkPaymentAttempt(deps(), silent.id, 7)));
    gateway.verifyFailures = 0;
    expect(lost.every((result) => result.status === "rejected")).toBe(true);
    expect((await attemptOf(silent.reference)).status).toBe("PENDING");
    expect(await reviewsOf(silent.intentId)).toHaveLength(0);

    // The worker's dead-letter handler settles it: UNKNOWN, one UNCLEAR_RESULT review, however often it runs.
    await Promise.all(Array.from({ length: N }, () => settleUnanswered(deps(), silent.id)));
    expect((await attemptOf(silent.reference)).status).toBe("UNKNOWN");
    expect((await intentById(silent.intentId)).status).toBe("REVIEW_REQUIRED");
    expect((await reviewsOf(silent.intentId)).map((review) => review.reason)).toEqual(["UNCLEAR_RESULT"]);
  });
});

describe("edits colliding, 100 at once", () => {
  it("S7: the same version wins once, for a project and for a checkout step", async () => {
    const b = flows.browser();
    const project = projectSchema.parse((await b.post("/v1/projects", { type: "EVENT", title: "Stress (TEST DATA)" })).body);
    const patches = await times((index) => b.patch(`/v1/projects/${project.id}`, { version: project.version, title: `Stress ${index}` }));
    oneWinner(patches, ["VERSION_CONFLICT"]);
    expect((await db().select().from(schema.projects).where(eq(schema.projects.id, project.id)))[0]!.version).toBe(project.version + 1);

    const { b: shopper, checkout } = await flows.readyCheckout();
    const puts = await times((index) => shopper.put(`/v1/checkouts/${checkout.id}/address`, { ...lagos(checkout.version), landmark: `Gate ${index}` }));
    oneWinner(puts, ["STALE_VERSION"]);
    expect((await checkoutRow(checkout.id)).version).toBe(checkout.version + 1);
  });

  it("S8: the amount being paid never changes under the payment", async () => {
    const { b, checkout } = await flows.readyCheckout();
    const responses = await Promise.all([
      b.post(payPath(checkout.id)),
      ...Array.from({ length: N - 1 }, (_, index) => b.put(`/v1/checkouts/${checkout.id}/address`, index % 2 ? lagos(checkout.version) : kano(checkout.version))),
    ]);
    no5xx(responses);
    const [intent] = await intentsOfCheckout(checkout.id);
    if (intent?.status === "PROCESSING") await expectPaymentMatchesCheckout(checkout.id);
    // Whatever won, the checkout view the customer sees is one the payment matches.
    expect(checkoutSchema.parse((await b.get(`/v1/checkouts/${checkout.id}`)).body).totals.totalMinor).toBe((await checkoutRow(checkout.id)).totalMinor.toString());
  });
});

describe("lock order probes", () => {
  it("S5b: a result queued ahead of Pay for the intent does not deadlock with it", async () => {
    const { b, checkout } = await flows.readyCheckout();
    const first = await started(b, checkout.id);
    gateway.settle(first.reference, { status: "success" });
    harness.now.value = new Date(Date.now() + 11 * 60 * 1000);
    try {
      const [check, pay] = await queueBehind((tx) => tx.select().from(schema.paymentIntents).where(eq(schema.paymentIntents.id, first.intentId)).for("update"), [
        () => checkPaymentAttempt(deps(), first.id, 1),
        () => b.post(payPath(checkout.id)),
      ]);
      expect(check).toMatchObject({ status: "fulfilled", value: "succeeded" });
      expect(pay.status).toBe("fulfilled");
      no5xx([(pay as PromiseFulfilledResult<request.Response>).value]);
    } finally {
      harness.now.value = null;
    }
    expect(await ordersOf(checkout.id)).toHaveLength(1);
    expect((await intentById(first.intentId)).status).toBe("SUCCEEDED");
  });

  it("S8b: an edit waiting on the checkout row behind Pay is refused, not applied under the payment", async () => {
    const { b, checkout } = await flows.readyCheckout();
    const [pay, edit] = await queueBehind((tx) => tx.select().from(schema.checkouts).where(eq(schema.checkouts.id, checkout.id)).for("update"), [
      () => b.post(payPath(checkout.id)),
      () => b.put(`/v1/checkouts/${checkout.id}/address`, kano(checkout.version)),
    ]);
    expect(pay).toMatchObject({ status: "fulfilled", value: expect.objectContaining({ status: 200 }) });
    expect(edit).toMatchObject({ status: "fulfilled", value: expect.objectContaining({ status: 409 }) });
    expect((await intentsOfCheckout(checkout.id))[0]!.status).toBe("PROCESSING");
    await expectPaymentMatchesCheckout(checkout.id);
  });
});
