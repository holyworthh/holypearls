import { adminQuoteSchema, apiErrorSchema, customerQuoteSchema, orderSchema, paymentStartSchema, projectSchema, quoteVersionSchema } from "@holypearls/contracts";
import { desc, eq, schema, sql } from "@holypearls/db";
import { unseal } from "@holypearls/email";
import { FakeGateway } from "@holypearls/testkit";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { checkPaymentAttempt } from "../payments/payments.js";
import { as, expectHidden, signInActors, type Actors } from "../testing/actors.js";
import { createHarness, type Harness, TEST_SEAL_KEY, TEST_WEB_ORIGIN } from "../testing/harness.js";
import { expireQuoteVersion } from "./quotes.js";
import { sendInstallmentDueReminder } from "./customer.js";

/*
 * T05-05: the customer quote page, acceptance, deposits and balances
 * (QUOTE-FR-002–008, PAY-FR-001–004; TECH-05 §4, §8). Done when: an expired
 * quote has no actions; another customer gets 404; parallel accepts create
 * one order; an old version is rejected; the code is required; deposit and
 * balance are paid separately; the customer's payment status is right.
 */

vi.setConfig({ testTimeout: 300_000 });

let harness: Harness;
let gateway: FakeGateway;
let actors: Partial<Actors>;
const db = () => harness.database.db;
const notify = () => ({ db: db(), jobs: harness.jobs, sealKey: TEST_SEAL_KEY, webOrigin: TEST_WEB_ORIGIN });

const cookieOf = (response: request.Response, name: string) =>
  ((response.headers["set-cookie"] as unknown as string[] | undefined) ?? []).map((cookie) => cookie.split(";")[0]!).find((cookie) => cookie.startsWith(`${name}=`));

/** A browser with its own cookie jar (device and guest cookies). */
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
    post: (path: string, body: object = {}, key = `test_${randomUUID().replaceAll("-", "")}`) => send(request(harness.url).post(path).set("idempotency-key", key).send(body)),
    patch: (path: string, body: object) => send(request(harness.url).patch(path).send(body)),
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

const fees = { designMinor: "5000000", deliveryMinor: "0", deliveryNote: "", installationMinor: "0", installationNote: "", otherMinor: "0", otherLabel: "" };
const schedule = [
  { label: "Deposit", kind: "PERCENT", value: "6500", trigger: "ON_ACCEPTANCE" },
  { label: "Balance", kind: "PERCENT", value: "3500", trigger: "BEFORE_DISPATCH" },
];

/** A submitted project with V1 sent; returns the quote and a guest browser opened from the quote email. */
async function sentQuote(options: { versions?: number; email?: string } = {}) {
  const email = options.email ?? `quote.${randomUUID().slice(0, 8)}@example.com`;
  const b = browser();
  let project = projectSchema.parse((await b.post("/v1/projects", { type: "EVENT", title: "Accept test (TEST DATA)" })).body);
  project = projectSchema.parse((await b.patch(`/v1/projects/${project.id}`, { version: project.version, answers: { attendees: 200, crew: 20 } })).body);
  project = projectSchema.parse((await b.post(`/v1/projects/${project.id}/submit`, { version: project.version, email })).body);
  const ada = staff(actors.adminAda!);
  const quoteId = project.quote!.id;
  for (let number = 1; number <= (options.versions ?? 1); number++) {
    const quote = adminQuoteSchema.parse((await ada.post(`/v1/admin/quotes/${quoteId}/versions`)).body);
    const draft = quote.versions.find((version) => version.status === "DRAFT")!;
    const lines = quote.candidates.slice(0, 2).map((candidate, index) => ({ source: candidate.source, sourceKey: candidate.sourceKey, title: candidate.title, summary: candidate.summary, quantity: (candidate.quantity ?? 1) + number - 1, unitMinor: String((index + 1) * 200_000) }));
    const saved = quoteVersionSchema.parse((await ada.put(`/v1/admin/quotes/${quoteId}/versions/${draft.id}`, { version: draft.version, currency: "NGN", lines, fees, validDays: 14, terms: "Terms", assumptions: "", productionSequence: "", schedule })).body);
    await ada.post(`/v1/admin/quotes/${quoteId}/versions/${draft.id}/send`, { version: saved.version });
  }
  const [mail] = await db().select().from(schema.notifications).where(sql`${schema.notifications.recordId} = ${quoteId} and ${schema.notifications.template} = 'quote_ready'`).orderBy(desc(schema.notifications.createdAt)).limit(1);
  const { url } = unseal(mail!.sealedData!, TEST_SEAL_KEY) as { url: string };
  const guest = browser();
  await guest.post("/v1/guest-links/redeem", { secret: url.split("#")[1] });
  return { quoteId, guest, owner: b, email };
}

/** Sends and enters an email code for this guest (TECH-03 §5). */
async function verifyEmail(guest: ReturnType<typeof browser>, email: string) {
  await guest.post("/v1/email-codes", { purpose: "ACCEPT_QUOTE" });
  const [mail] = await db().select().from(schema.notifications).where(sql`${schema.notifications.recipient} = ${email} and ${schema.notifications.template} = 'email_code'`).orderBy(desc(schema.notifications.createdAt)).limit(1);
  const { code } = unseal(mail!.sealedData!, TEST_SEAL_KEY) as { code: string };
  const verified = await guest.post("/v1/email-codes/verify", { purpose: "ACCEPT_QUOTE", code });
  expect(verified.status).toBe(200);
}

beforeAll(async () => {
  gateway = new FakeGateway();
  harness = await createHarness({ payments: gateway });
  await db().update(schema.paymentSettings).set({ onlinePayments: true }).where(eq(schema.paymentSettings.id, 1));
  actors = await signInActors(harness, ["adminAda", "customerChidi"]);
});

afterAll(async () => {
  await harness?.close();
});

describe("the quote page (QUOTE-FR-002, 005)", () => {
  it("shows the sent version, what changed and the schedule; drafts and staff details stay hidden", async () => {
    const { quoteId, guest } = await sentQuote({ versions: 2 });
    const quote = customerQuoteSchema.parse((await guest.get(`/v1/quotes/${quoteId}`)).body);
    expect(quote).toMatchObject({ status: "READY", canAccept: true, version: { number: 2, status: "SENT" } });
    expect(quote.versions.map((version) => [version.number, version.status])).toEqual([
      [2, "SENT"],
      [1, "SUPERSEDED"],
    ]);
    expect(quote.changes.length).toBeGreaterThan(0);
    expect(quote.changes[0]).toMatch(/→/);
    expect(quote.version!.payments!.map((payment) => payment.label)).toEqual(["Deposit", "Balance"]);
  });

  it("opens for the project's owner and link, and is 404 for anyone else (TECH-03 §17)", async () => {
    const { quoteId, owner } = await sentQuote();
    expect((await owner.get(`/v1/quotes/${quoteId}`)).status).toBe(200);
    expectHidden(await browser().get(`/v1/quotes/${quoteId}`));
    expectHidden(await as(harness, actors.customerChidi!).get(`/v1/quotes/${quoteId}`));
    expectHidden(await browser().get(`/v1/quotes/${randomUUID()}`));
  });
});

describe("accepting (QUOTE-FR-007–008, TECH-05 §8)", () => {
  it("needs the review tick and a recent email code", async () => {
    const { quoteId, guest } = await sentQuote();
    const unticked = await guest.post(`/v1/quotes/${quoteId}/accept`, { versionNumber: 1, acknowledged: false });
    expect(unticked.status).toBe(400);
    const noCode = await guest.post(`/v1/quotes/${quoteId}/accept`, { versionNumber: 1, acknowledged: true });
    expect(apiErrorSchema.parse(noCode.body).code).toBe("RECENT_EMAIL_CODE_REQUIRED");
  });

  it("makes exactly one order however many accepts arrive, from the version's lines with its schedule", async () => {
    const { quoteId, guest, email } = await sentQuote();
    await verifyEmail(guest, email);
    const presses = await Promise.all(Array.from({ length: 4 }, () => guest.post(`/v1/quotes/${quoteId}/accept`, { versionNumber: 1, acknowledged: true })));
    const orders = new Set(presses.filter((response) => response.status === 200).map((response) => response.body.id));
    expect(orders.size).toBe(1);
    const orderId = [...orders][0]!;
    expect(await db().select().from(schema.orders).where(eq(schema.orders.id, orderId))).toHaveLength(1);

    const quote = customerQuoteSchema.parse((await guest.get(`/v1/quotes/${quoteId}`)).body);
    expect(quote).toMatchObject({ status: "ACCEPTED", canAccept: false, order: { id: orderId }, version: { status: "ACCEPTED" } });
    const order = orderSchema.parse((await guest.get(`/v1/orders/${orderId}`)).body);
    expect(order.items).toHaveLength(2);
    expect(order.items.every((item) => item.status === "AWAITING_PREREQUISITE")).toBe(true);
    expect(order.paymentStatus).toBe("DEPOSIT_DUE");
    expect(order.payments!.installments.map((part) => [part.label, part.status, part.payable])).toEqual([
      ["Deposit", "DUE", true],
      ["Balance", "NOT_DUE", false],
    ]);
    expect(BigInt(order.payments!.installments[0]!.amountMinor) + BigInt(order.payments!.installments[1]!.amountMinor)).toBe(BigInt(order.totals.totalMinor));
    const [project] = await db().select({ status: schema.projects.status }).from(schema.projects).innerJoin(schema.quotes, eq(schema.quotes.projectId, schema.projects.id)).where(eq(schema.quotes.id, quoteId));
    expect(project!.status).toBe("ORDERED");
    const [mail] = await db().select().from(schema.notifications).where(sql`${schema.notifications.recordId} = ${orderId} and ${schema.notifications.template} = 'quote_accepted'`);
    expect(mail).toBeTruthy();
  });

  it("refuses an old version and an expired quote, which has no actions", async () => {
    const { quoteId, guest, email } = await sentQuote({ versions: 2 });
    await verifyEmail(guest, email);
    const old = await guest.post(`/v1/quotes/${quoteId}/accept`, { versionNumber: 1, acknowledged: true });
    expect(apiErrorSchema.parse(old.body).context).toMatchObject({ reason: "NOT_CURRENT_VERSION" });

    const [current] = await db().select().from(schema.quoteVersions).where(sql`${schema.quoteVersions.quoteId} = ${quoteId} and ${schema.quoteVersions.status} = 'SENT'`);
    await expireQuoteVersion(db(), current!.id, new Date(Date.now() + 30 * 86_400_000));
    const expired = customerQuoteSchema.parse((await guest.get(`/v1/quotes/${quoteId}`)).body);
    expect(expired).toMatchObject({ status: "EXPIRED", canAccept: false, blockers: [expect.objectContaining({ code: "EXPIRED" })] });
    const refused = await guest.post(`/v1/quotes/${quoteId}/accept`, { versionNumber: 2, acknowledged: true });
    expect(refused.status).toBeGreaterThanOrEqual(400);
    expect((await guest.post(`/v1/quotes/${quoteId}/requests`, { kind: "CHANGE", note: "x" })).status).toBe(200);
    // "Request updated quote" keeps the project and history.
    const renewed = customerQuoteSchema.parse((await guest.post(`/v1/quotes/${quoteId}/request-update`)).body);
    expect(renewed.status).toBe("PENDING_REVIEW");
  });
});

describe("changes, questions and declining (QUOTE-FR-003–004)", () => {
  it("records a change request about a line and moves the quote to REVISION_REQUESTED", async () => {
    const { quoteId, guest } = await sentQuote();
    const quote = customerQuoteSchema.parse((await guest.get(`/v1/quotes/${quoteId}`)).body);
    const line = quote.version!.lines[0]!;
    const asked = customerQuoteSchema.parse((await guest.post(`/v1/quotes/${quoteId}/requests`, { kind: "QUESTION", note: "Can the polos be navy?" })).body);
    expect(asked.status).toBe("READY");
    const changed = customerQuoteSchema.parse((await guest.post(`/v1/quotes/${quoteId}/requests`, { kind: "CHANGE", lineId: line.id, changeType: "Quantity", note: "We need 40, not 20." })).body);
    expect(changed.status).toBe("REVISION_REQUESTED");
    expect(changed.requests.map((request) => [request.kind, request.line])).toEqual([
      ["CHANGE", line.title],
      ["QUESTION", null],
    ]);
    expect(changed.canAccept).toBe(false);
    const wrongLine = await guest.post(`/v1/quotes/${quoteId}/requests`, { kind: "CHANGE", lineId: randomUUID(), note: "x" });
    expect(apiErrorSchema.parse(wrongLine.body).fieldErrors).toHaveProperty("lineId");
  });

  it("declines with a reason", async () => {
    const { quoteId, guest } = await sentQuote();
    const declined = customerQuoteSchema.parse((await guest.post(`/v1/quotes/${quoteId}/decline`, { reason: "Budget moved" })).body);
    expect(declined).toMatchObject({ status: "DECLINED", canAccept: false, version: { status: "DECLINED" } });
  });
});

describe("deposits and balances (PAY-FR-001–004)", () => {
  async function accepted() {
    const made = await sentQuote();
    await verifyEmail(made.guest, made.email);
    const order = (await made.guest.post(`/v1/quotes/${made.quoteId}/accept`, { versionNumber: 1, acknowledged: true })).body as { id: string };
    return { ...made, orderId: order.id };
  }

  async function payNext(guest: ReturnType<typeof browser>, orderId: string) {
    const order = orderSchema.parse((await guest.get(`/v1/orders/${orderId}`)).body);
    const next = order.payments!.next!;
    const started = paymentStartSchema.parse((await guest.post(`/v1/orders/${orderId}/installments/${next.id}/payments`)).body);
    expect(started.amountMinor).toBe(next.amountMinor);
    gateway.settle(started.reference, { status: "success" });
    const [attempt] = await db().select().from(schema.paymentAttempts).where(eq(schema.paymentAttempts.reference, started.reference));
    expect(await checkPaymentAttempt({ db: db(), gateway, notify: notify() }, attempt!.id, 1)).toBe("succeeded");
    return orderSchema.parse((await guest.get(`/v1/orders/${orderId}`)).body);
  }

  it("pays the deposit and the balance separately, each with its receipt and email", async () => {
    const { guest, orderId } = await accepted();
    const balanceFirst = orderSchema.parse((await guest.get(`/v1/orders/${orderId}`)).body).payments!.installments[1]!;
    const refused = await guest.post(`/v1/orders/${orderId}/installments/${balanceFirst.id}/payments`);
    expect(apiErrorSchema.parse(refused.body).context).toMatchObject({ reason: "NOT_NEXT" });

    const afterDeposit = await payNext(guest, orderId);
    expect(afterDeposit.paymentStatus).toBe("DEPOSIT_PAID");
    expect(afterDeposit.payments).toMatchObject({ paidMinor: afterDeposit.payments!.installments[0]!.amountMinor, next: { label: "Balance", payable: true } });
    expect(afterDeposit.receipts).toHaveLength(1);

    const afterBalance = await payNext(guest, orderId);
    expect(afterBalance.paymentStatus).toBe("PAID");
    expect(afterBalance.payments).toMatchObject({ remainingMinor: "0", next: null });
    expect(afterBalance.receipts).toHaveLength(2);
    const emails = await db().select().from(schema.notifications).where(sql`${schema.notifications.recordId} = ${orderId} and ${schema.notifications.template} = 'payment_received'`);
    expect(emails).toHaveLength(2);
    // A paid order can't be paid again.
    expect((await guest.post(`/v1/orders/${orderId}/installments/${afterBalance.payments!.installments[1]!.id}/payments`)).status).toBe(409);
  });

  it("reminds about a dated payment and marks it due, unless it's paid", async () => {
    const { orderId } = await accepted();
    const [part] = await db()
      .select({ id: schema.installments.id })
      .from(schema.installments)
      .innerJoin(schema.paymentSchedules, eq(schema.paymentSchedules.id, schema.installments.scheduleId))
      .innerJoin(schema.orders, eq(schema.orders.quoteVersionId, schema.paymentSchedules.quoteVersionId))
      .where(sql`${schema.orders.id} = ${orderId} and ${schema.installments.position} = 2`);
    expect(await sendInstallmentDueReminder(notify(), part!.id, "test")).toBe("sent");
    const [row] = await db().select({ status: schema.installments.status }).from(schema.installments).where(eq(schema.installments.id, part!.id));
    expect(row!.status).toBe("DUE");
  });
});

it("lets a quote guest read only the quote's source-project artwork", async () => {
  const { quoteId, guest } = await sentQuote();
  const [quote] = await db().select().from(schema.quotes).where(eq(schema.quotes.id, quoteId));
  const [file] = await db().insert(schema.files).values({ purpose: "PROJECT_ATTACHMENT", status: "READY", bucket: "private", originalName: "reference.pdf", safeName: "reference.pdf", declaredType: "application/pdf", declaredSize: 20, storageKey: `guest-reference/${randomUUID()}`, ownerType: "PROJECT", ownerId: quote!.projectId!, attachedAt: new Date() }).returning();
  expect((await guest.get(`/v1/files/${file!.id}/download`)).status).toBe(200);
  const unrelated = await sentQuote();
  expect((await unrelated.guest.get(`/v1/files/${file!.id}/download`)).status).toBe(404);
});
