import {
  adminProofSchema,
  adminQuoteSchema,
  apiErrorSchema,
  checkoutSchema,
  configurationSchema,
  orderSchema,
  paymentStartSchema,
  productionBoardSchema,
  productionItemSchema,
  projectSchema,
  quoteVersionSchema,
} from "@holypearls/contracts";
import { and, desc, eq, schema, sql } from "@holypearls/db";
import { unseal } from "@holypearls/email";
import { FakeGateway } from "@holypearls/testkit";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { checkPaymentAttempt } from "../payments/payments.js";
import { as, signInActors, type Actors } from "../testing/actors.js";
import { createHarness, type Harness, TEST_SEAL_KEY, TEST_WEB_ORIGIN } from "../testing/harness.js";

/*
 * T07-01: production statuses, the board, holds and release rules
 * (FUL-FR-012–016, 020–021; OPS-FR-060–064). Done when: illegal status changes
 * are rejected; items move independently; paying the balance releases items
 * in the same transaction; the summary status table passes (summary.test.ts).
 */

vi.setConfig({ testTimeout: 300_000 });

let harness: Harness;
let gateway: FakeGateway;
let actors: Partial<Actors>;
const db = () => harness.database.db;
const notify = () => ({ db: db(), jobs: harness.jobs, sealKey: TEST_SEAL_KEY, webOrigin: TEST_WEB_ORIGIN });

const cookieOf = (response: request.Response, name: string) =>
  ((response.headers["set-cookie"] as unknown as string[] | undefined) ?? []).map((cookie) => cookie.split(";")[0]!).find((cookie) => cookie.startsWith(`${name}=`));

function browser() {
  const jar = new Map<string, string>();
  const send = (req: request.Test) => {
    req.set("origin", TEST_WEB_ORIGIN);
    if (jar.size) req.set("cookie", [...jar.values()].join("; "));
    return req.then((response) => {
      for (const name of ["hp.device", "hp.guest"]) {
        const value = cookieOf(response, name);
        if (value) jar.set(name, value);
      }
      return response;
    });
  };
  return {
    post: (path: string, body: object = {}) => send(request(harness.url).post(path).set("idempotency-key", `test_${randomUUID().replaceAll("-", "")}`).send(body)),
    patch: (path: string, body: object) => send(request(harness.url).patch(path).send(body)),
    put: (path: string, body: object) => send(request(harness.url).put(path).send(body)),
    get: (path: string) => send(request(harness.url).get(path)),
  };
}

const staff = (cookie: string) => {
  const req = (test: request.Test) => test.set("origin", TEST_WEB_ORIGIN).set("cookie", cookie);
  return {
    get: (path: string) => req(request(harness.url).get(path)),
    post: (path: string, body: object = {}) => req(request(harness.url).post(path)).set("idempotency-key", `test_${randomUUID().replaceAll("-", "")}`).send(body),
    put: (path: string, body: object) => req(request(harness.url).put(path)).send(body),
  };
};

const ada = () => staff(actors.adminAda!);
const item = async (id: string) => productionItemSchema.parse((await ada().get(`/v1/admin/production/items/${id}`)).body);
const move = async (id: string, to: "QUEUE" | "START" | "TO_QUALITY_CHECK") => ada().post(`/v1/admin/production/items/${id}/moves`, { move: to, version: (await item(id)).version });
const qc = async (id: string, outcome: "PASSED" | "REWORK", note = "") => ada().post(`/v1/admin/production/items/${id}/qc`, { outcome, note, version: (await item(id)).version });
const itemsOf = (orderId: string) => db().select().from(schema.orderItems).where(eq(schema.orderItems.orderId, orderId)).orderBy(schema.orderItems.position);

/** A paid business-cards checkout (its proof is required). */
async function paidOrder() {
  const b = browser();
  const contact = { name: "Production Tester (TEST DATA)", email: `prod.${randomUUID().slice(0, 8)}@example.com`, phone: "0800 000 0000" };
  const created = configurationSchema.parse((await b.post("/v1/configurations", { productSlug: "business-cards", choices: { paper: "350gsm-matte", sides: "both-sides" } })).body);
  const cards = configurationSchema.parse((await b.patch(`/v1/configurations/${created.id}`, { version: created.version, quantity: 250 })).body.draft);
  await b.post("/v1/cart/items", { configurationId: cards.id });
  let checkout = checkoutSchema.parse((await b.post("/v1/checkouts")).body);
  checkout = checkoutSchema.parse((await b.put(`/v1/checkouts/${checkout.id}/contact`, { ...contact, version: checkout.version })).body);
  checkout = checkoutSchema.parse((await b.put(`/v1/checkouts/${checkout.id}/address`, { country: "NG", name: contact.name, phone: contact.phone, street: "12 Admiralty Way", area: "Eti-Osa", state: "Lagos", landmark: "", version: checkout.version })).body);
  checkout = checkoutSchema.parse((await b.put(`/v1/checkouts/${checkout.id}/delivery`, { option: "STANDARD", version: checkout.version })).body);
  checkout = checkoutSchema.parse((await b.put(`/v1/checkouts/${checkout.id}/billing`, { sameAsDelivery: true, version: checkout.version })).body);
  const started = paymentStartSchema.parse((await b.post(`/v1/checkouts/${checkout.id}/payments`)).body);
  gateway.settle(started.reference, { status: "success" });
  const [attempt] = await db().select().from(schema.paymentAttempts).where(eq(schema.paymentAttempts.reference, started.reference));
  await checkPaymentAttempt({ db: db(), gateway, notify: notify() }, attempt!.id, 1);
  const view = checkoutSchema.parse((await b.get(`/v1/checkouts/${checkout.id}`)).body);
  return { b, orderId: view.order!.id, contact };
}

/** Staff publish V1 of the order's proof and the customer approves it with an email code. */
async function approveProof(orderId: string, email: string) {
  const [items] = await itemsOf(orderId);
  const [proof] = await db().select().from(schema.proofs).where(eq(schema.proofs.orderItemId, items!.id));
  const prepared = adminProofSchema.parse((await ada().post(`/v1/admin/proofs/${proof!.id}/versions`)).body);
  const draft = prepared.versions.find((version) => version.status === "DRAFT")!;
  const [file] = await db()
    .insert(schema.files)
    .values({ purpose: "PROOF", status: "READY", originalName: "proof.pdf", safeName: "proof.pdf", declaredType: "application/pdf", declaredSize: 1000, storageKey: `proofs/${randomUUID()}`, bucket: "private" })
    .returning();
  const details = { placement: "Front", dimensions: "85 × 55 mm", colourReference: "CMYK", quantity: "250", notes: "" };
  const saved = adminProofSchema.parse((await ada().put(`/v1/admin/proofs/${proof!.id}/draft`, { version: draft.version, views: [{ label: "Front", fileId: file!.id }], details })).body);
  await ada().post(`/v1/admin/proofs/${proof!.id}/publish`, { version: saved.versions.find((version) => version.status === "DRAFT")!.version });
  const [mail] = await db().select().from(schema.notifications).where(sql`${schema.notifications.recordId} = ${orderId} and ${schema.notifications.template} = 'proof_ready'`).orderBy(desc(schema.notifications.createdAt)).limit(1);
  const { url } = unseal(mail!.sealedData!, TEST_SEAL_KEY) as { url: string };
  const guest = browser();
  await guest.post("/v1/guest-links/redeem", { secret: url.split("#")[1] });
  await guest.post("/v1/email-codes", { purpose: "APPROVE_PROOF" });
  const [codeMail] = await db().select().from(schema.notifications).where(sql`${schema.notifications.recipient} = ${email} and ${schema.notifications.template} = 'email_code'`).orderBy(desc(schema.notifications.createdAt)).limit(1);
  const { code } = unseal(codeMail!.sealedData!, TEST_SEAL_KEY) as { code: string };
  await guest.post("/v1/email-codes/verify", { purpose: "APPROVE_PROOF", code });
  const approved = await guest.post(`/v1/orders/${orderId}/proofs/${proof!.id}/approve`, { versionNumber: 1, acknowledged: true });
  expect(approved.status).toBe(200);
}

const fees = { designMinor: "0", deliveryMinor: "0", deliveryNote: "", installationMinor: "0", installationNote: "", otherMinor: "0", otherLabel: "" };
const schedule = [
  { label: "Deposit", kind: "PERCENT", value: "6000", trigger: "ON_ACCEPTANCE" },
  { label: "Balance", kind: "PERCENT", value: "4000", trigger: "BEFORE_DISPATCH" },
];

/** An accepted two-line quote with a deposit and a before-dispatch balance; proofs set NOT_REQUIRED so payment is the only gate. */
async function acceptedQuote() {
  const email = `prodq.${randomUUID().slice(0, 8)}@example.com`;
  const b = browser();
  let project = projectSchema.parse((await b.post("/v1/projects", { type: "EVENT", title: "Production test (TEST DATA)" })).body);
  project = projectSchema.parse((await b.patch(`/v1/projects/${project.id}`, { version: project.version, answers: { attendees: 200, crew: 20 } })).body);
  project = projectSchema.parse((await b.post(`/v1/projects/${project.id}/submit`, { version: project.version, email })).body);
  const quoteId = project.quote!.id;
  const quote = adminQuoteSchema.parse((await ada().post(`/v1/admin/quotes/${quoteId}/versions`)).body);
  const draft = quote.versions.find((version) => version.status === "DRAFT")!;
  const lines = quote.candidates.slice(0, 2).map((candidate, index) => ({ source: candidate.source, sourceKey: candidate.sourceKey, title: candidate.title, summary: candidate.summary, quantity: candidate.quantity ?? 1, unitMinor: String((index + 1) * 200_000) }));
  const saved = quoteVersionSchema.parse((await ada().put(`/v1/admin/quotes/${quoteId}/versions/${draft.id}`, { version: draft.version, currency: "NGN", lines, fees, validDays: 14, terms: "Terms", assumptions: "", productionSequence: "", schedule })).body);
  await ada().post(`/v1/admin/quotes/${quoteId}/versions/${draft.id}/send`, { version: saved.version });
  const [mail] = await db().select().from(schema.notifications).where(sql`${schema.notifications.recordId} = ${quoteId} and ${schema.notifications.template} = 'quote_ready'`).orderBy(desc(schema.notifications.createdAt)).limit(1);
  const { url } = unseal(mail!.sealedData!, TEST_SEAL_KEY) as { url: string };
  const guest = browser();
  await guest.post("/v1/guest-links/redeem", { secret: url.split("#")[1] });
  await guest.post("/v1/email-codes", { purpose: "ACCEPT_QUOTE" });
  const [codeMail] = await db().select().from(schema.notifications).where(sql`${schema.notifications.recipient} = ${email} and ${schema.notifications.template} = 'email_code'`).orderBy(desc(schema.notifications.createdAt)).limit(1);
  const { code } = unseal(codeMail!.sealedData!, TEST_SEAL_KEY) as { code: string };
  await guest.post("/v1/email-codes/verify", { purpose: "ACCEPT_QUOTE", code });
  const order = (await guest.post(`/v1/quotes/${quoteId}/accept`, { versionNumber: 1, acknowledged: true })).body as { id: string };
  const items = await itemsOf(order.id);
  await db()
    .update(schema.proofs)
    .set({ status: "NOT_REQUIRED", requirement: "NOT_REQUIRED" })
    .where(sql`${schema.proofs.orderItemId} in (${sql.join(items.map((row) => sql`${row.id}`), sql`, `)})`);
  return { guest, orderId: order.id, items };
}

async function payNext(guest: ReturnType<typeof browser>, orderId: string) {
  const order = orderSchema.parse((await guest.get(`/v1/orders/${orderId}`)).body);
  const next = order.payments!.next!;
  const started = paymentStartSchema.parse((await guest.post(`/v1/orders/${orderId}/installments/${next.id}/payments`)).body);
  gateway.settle(started.reference, { status: "success" });
  const [attempt] = await db().select().from(schema.paymentAttempts).where(eq(schema.paymentAttempts.reference, started.reference));
  expect(await checkPaymentAttempt({ db: db(), gateway, notify: notify() }, attempt!.id, 1)).toBe("succeeded");
  return orderSchema.parse((await guest.get(`/v1/orders/${orderId}`)).body);
}

beforeAll(async () => {
  gateway = new FakeGateway();
  harness = await createHarness({ payments: gateway });
  await db().update(schema.paymentSettings).set({ onlinePayments: true }).where(eq(schema.paymentSettings.id, 1));
  actors = await signInActors(harness, ["adminAda", "adminTunde", "customerChidi"]);
});

afterAll(async () => {
  await harness?.close();
});

describe("prerequisites (TECH-01 §4)", () => {
  it("keeps an item waiting for its proof, refuses a manual queue, and queues it in the approval's transaction", async () => {
    const { b, orderId, contact } = await paidOrder();
    const [row] = await itemsOf(orderId);
    expect(row!.status).toBe("AWAITING_PREREQUISITE");

    const board = productionBoardSchema.parse((await ada().get("/v1/admin/production")).body);
    const card = board.groups.find((group) => group.group === "WAITING")!.items.find((entry) => entry.id === row!.id)!;
    expect(card.note).toBe("Needs: proof approval");

    const refused = await move(row!.id, "QUEUE");
    expect(refused.status).toBe(422);
    expect(apiErrorSchema.parse(refused.body)).toMatchObject({ context: { reason: "PREREQUISITE_MISSING", missing: ["PROOF_APPROVAL"] } });
    expect(apiErrorSchema.parse(refused.body).message).toContain("can't move to QUEUED: the proof is still being prepared (PREPARING)");
    expect((await itemsOf(orderId))[0]!.status).toBe("AWAITING_PREREQUISITE");

    await approveProof(orderId, contact.email);
    const queued = await item(row!.id);
    expect(queued.status).toBe("QUEUED");
    expect(queued.prerequisites).toMatchObject({ proof: { status: "APPROVED", versionNumber: 1 }, missing: [] });
    expect(queued.history[0]).toMatchObject({ kind: "STATUS", from: "AWAITING_PREREQUISITE", to: "QUEUED", by: "System" });
    expect(orderSchema.parse((await b.get(`/v1/orders/${orderId}`)).body).summaryStatus).toBe("CONFIRMED");
  });
});

describe("item moves and quality check (OPS-FR-061, 063)", () => {
  it("offers only allowed moves, rejects illegal and stale ones, and records rework and a pass", async () => {
    const { b, orderId, contact } = await paidOrder();
    await approveProof(orderId, contact.email);
    const [row] = await itemsOf(orderId);
    const id = row!.id;
    expect((await item(id)).moves).toEqual(["START"]);

    // Skipping a step changes nothing.
    const skip = await move(id, "TO_QUALITY_CHECK");
    expect(apiErrorSchema.parse(skip.body).context).toMatchObject({ reason: "ILLEGAL_MOVE", status: "QUEUED" });
    expect((await qc(id, "PASSED")).status).toBe(422);
    // A stale version is refused.
    const stale = await ada().post(`/v1/admin/production/items/${id}/moves`, { move: "START", version: 0 });
    expect(apiErrorSchema.parse(stale.body).code).toBe("VERSION_CONFLICT");

    expect((await move(id, "START")).status).toBe(200);
    expect(orderSchema.parse((await b.get(`/v1/orders/${orderId}`)).body)).toMatchObject({ summaryStatus: "IN_PRODUCTION", items: [{ status: "IN_PRODUCTION", hold: null }] });
    await move(id, "TO_QUALITY_CHECK");
    expect((await item(id))).toMatchObject({ status: "QUALITY_CHECK", moves: [], canRecordQc: true });

    const rework = productionItemSchema.parse((await qc(id, "REWORK", "Colour off")).body);
    expect(rework.status).toBe("IN_PRODUCTION");
    expect(rework.history[0]).toMatchObject({ kind: "QC", from: "QUALITY_CHECK", to: "IN_PRODUCTION", note: "Sent for rework: Colour off", by: "Ada Okafor (TEST DATA)" });

    await move(id, "TO_QUALITY_CHECK");
    const passed = productionItemSchema.parse((await qc(id, "PASSED", "Matches proof V1")).body);
    expect(passed).toMatchObject({ status: "READY_TO_DISPATCH", orderSummary: "READY_TO_DISPATCH", balance: null });
    const results = await db().select().from(schema.qcResults).where(eq(schema.qcResults.orderItemId, id));
    expect(results.map((result) => result.outcome).sort()).toEqual(["PASSED", "REWORK"]);
    const audit = await db().select().from(schema.auditLog).where(eq(schema.auditLog.recordId, id));
    expect(audit.map((entry) => entry.action)).toEqual(expect.arrayContaining(["order_item.moved", "order_item.qc_rework", "order_item.qc_passed"]));
  });
});

describe("holds (OPS-FR-062, FUL-FR-013)", () => {
  it("pauses an item without changing its status, tells the customer, and blocks moves until resolved", async () => {
    const { b, orderId, contact } = await paidOrder();
    await approveProof(orderId, contact.email);
    const [row] = await itemsOf(orderId);
    const id = row!.id;
    await move(id, "START");

    const empty = await ada().post(`/v1/admin/production/items/${id}/hold`, { reason: "CUSTOMER_INFORMATION", internalNote: "", customerExplanation: " ", whoActs: "CUSTOMER", timingImpactDays: 3 });
    expect(empty.status).toBe(400);

    const held = productionItemSchema.parse(
      (await ada().post(`/v1/admin/production/items/${id}/hold`, { reason: "CUSTOMER_INFORMATION", internalNote: "Wall is 2.8 m, not 3 m.", customerExplanation: "We need the final wall width before printing.", whoActs: "CUSTOMER", timingImpactDays: 3 })).body,
    );
    expect(held).toMatchObject({ status: "IN_PRODUCTION", moves: [], orderSummary: "ON_HOLD", hold: { status: "OPEN", reason: "CUSTOMER_INFORMATION" } });
    const board = productionBoardSchema.parse((await ada().get("/v1/admin/production")).body);
    expect(board.groups.find((group) => group.group === "ON_HOLD")!.items.find((entry) => entry.id === id)).toMatchObject({ status: "IN_PRODUCTION", note: "Customer: customer information" });

    const order = orderSchema.parse((await b.get(`/v1/orders/${orderId}`)).body);
    expect(order.summaryStatus).toBe("ON_HOLD");
    expect(order.items[0]!.hold).toMatchObject({ explanation: "We need the final wall width before printing.", whoActs: "CUSTOMER", timingImpactDays: 3 });
    expect(JSON.stringify(order)).not.toContain("2.8 m");
    const [mail] = await db().select().from(schema.notifications).where(and(eq(schema.notifications.recordId, orderId), eq(schema.notifications.template, "item_on_hold")));
    expect(mail).toBeTruthy();

    const blocked = await move(id, "TO_QUALITY_CHECK");
    expect(apiErrorSchema.parse(blocked.body).context).toMatchObject({ reason: "ON_HOLD" });
    const twice = await ada().post(`/v1/admin/production/items/${id}/hold`, { reason: "OTHER", internalNote: "", customerExplanation: "Again", whoActs: "HOLYPEARLS", timingImpactDays: null });
    expect(apiErrorSchema.parse(twice.body).context).toMatchObject({ reason: "ALREADY_ON_HOLD" });

    const resolved = productionItemSchema.parse((await ada().post(`/v1/admin/production/items/${id}/hold/resolve`, { resolution: "Customer confirmed 2.8 m" })).body);
    expect(resolved).toMatchObject({ status: "IN_PRODUCTION", moves: ["TO_QUALITY_CHECK"], orderSummary: "IN_PRODUCTION", hold: { status: "RESOLVED" } });
    expect(orderSchema.parse((await b.get(`/v1/orders/${orderId}`)).body).items[0]!.hold).toBeNull();
    const [done] = await db().select().from(schema.notifications).where(and(eq(schema.notifications.recordId, orderId), eq(schema.notifications.template, "hold_resolved")));
    expect(done).toBeTruthy();
    expect((await ada().post(`/v1/admin/production/items/${id}/hold/resolve`, { resolution: "Again" })).status).toBe(409);
  });
});

describe("deposit, balance and release (FUL-FR-020–021, OPS-FR-064, TECH-05 §10)", () => {
  it("queues on the deposit, holds finished items for the balance, and releases them in the balance payment's transaction", async () => {
    const { guest, orderId, items } = await acceptedQuote();
    const [first, second] = items;
    expect(items.map((row) => row.status)).toEqual(["AWAITING_PREREQUISITE", "AWAITING_PREREQUISITE"]);
    expect((await item(first!.id)).prerequisites).toMatchObject({ deposit: "DUE", missing: ["DEPOSIT"] });

    const afterDeposit = await payNext(guest, orderId);
    expect(afterDeposit.items.map((row) => row.status)).toEqual(["QUEUED", "QUEUED"]);
    expect(afterDeposit.payments!.installments[1]!.status).toBe("NOT_DUE");

    // Items move independently: only the first goes through production.
    await move(first!.id, "START");
    await move(first!.id, "TO_QUALITY_CHECK");
    const finished = productionItemSchema.parse((await qc(first!.id, "PASSED")).body);
    expect(finished).toMatchObject({ status: "READY_AWAITING_RELEASE", orderSummary: "BALANCE_REQUIRED", balance: { label: "Balance", status: "DUE" } });
    expect((await item(second!.id)).status).toBe("QUEUED");
    const board = productionBoardSchema.parse((await ada().get("/v1/admin/production")).body);
    expect(board.groups.find((group) => group.group === "READY")!.items.find((entry) => entry.id === first!.id)!.note).toBe("Balance due");

    const due = orderSchema.parse((await guest.get(`/v1/orders/${orderId}`)).body);
    expect(due).toMatchObject({ summaryStatus: "BALANCE_REQUIRED", paymentStatus: "BALANCE_DUE", payments: { next: { label: "Balance", payable: true } } });
    const [reminder] = await db().execute<{ id: string }>(sql`select id from pgboss.job where name = 'reminder.send' and data->>'recordId' = ${due.payments!.installments[1]!.id}`).then((result) => result.rows);
    expect(reminder).toBeTruthy();

    const paid = await payNext(guest, orderId);
    expect(paid.items.map((row) => row.status)).toEqual(["READY_TO_DISPATCH", "QUEUED"]);
    expect(paid.summaryStatus).toBe("PARTIALLY_READY");
    // Released in the payment's transaction: the event and the PAID installment share its commit.
    const released = await item(first!.id);
    expect(released.history[0]).toMatchObject({ from: "READY_AWAITING_RELEASE", to: "READY_TO_DISPATCH", by: "System", note: "Balance paid: released for dispatch" });
    const [part] = await db().select().from(schema.installments).where(eq(schema.installments.id, paid.payments!.installments[1]!.id));
    const [event] = await db().execute<{ xmin: string }>(sql`select xmin::text from order_item_events where order_item_id = ${first!.id} and to_status = 'READY_TO_DISPATCH'`).then((result) => result.rows);
    const [installment] = await db().execute<{ xmin: string }>(sql`select xmin::text from installments where id = ${part!.id}`).then((result) => result.rows);
    expect(event!.xmin).toBe(installment!.xmin);

    // The second item, finished after the balance is paid, goes straight to READY_TO_DISPATCH.
    await move(second!.id, "START");
    await move(second!.id, "TO_QUALITY_CHECK");
    expect(productionItemSchema.parse((await qc(second!.id, "PASSED")).body)).toMatchObject({ status: "READY_TO_DISPATCH", orderSummary: "READY_TO_DISPATCH" });
  });
});

describe("permissions (TECH-03 §17)", () => {
  it("needs PRODUCTION_MANAGE for the board and every action", async () => {
    const { orderId } = await paidOrder();
    const [row] = await itemsOf(orderId);
    const tunde = as(harness, actors.adminTunde!);
    const chidi = as(harness, actors.customerChidi!);
    // Staff without the permission get 403; customers don't learn the admin exists (404).
    for (const [actor, status] of [[tunde, 403], [chidi, 404]] as const) {
      expect((await actor.get("/v1/admin/production")).status).toBe(status);
      expect((await actor.get(`/v1/admin/production/items/${row!.id}`)).status).toBe(status);
      expect((await actor.post(`/v1/admin/production/items/${row!.id}/moves`, { move: "QUEUE", version: 1 })).status).toBe(status);
      expect((await actor.post(`/v1/admin/production/items/${row!.id}/hold`, { reason: "OTHER", customerExplanation: "x", whoActs: "HOLYPEARLS", timingImpactDays: null })).status).toBe(status);
    }
    expect((await request(harness.url).get("/v1/admin/production").set("origin", TEST_WEB_ORIGIN)).status).toBe(404);
    expect((await ada().get(`/v1/admin/production/items/${randomUUID()}`)).status).toBe(404);
  });
});
