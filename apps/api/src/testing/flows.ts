import { adminQuoteSchema, checkoutSchema, configurationSchema, orderSchema, paymentStartSchema, projectSchema, quoteVersionSchema } from "@holypearls/contracts";
import { desc, eq, schema, sql } from "@holypearls/db";
import { unseal } from "@holypearls/email";
import type { FakeGateway } from "@holypearls/testkit";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { checkPaymentAttempt } from "../payments/payments.js";
import { type Harness, TEST_SEAL_KEY, TEST_WEB_ORIGIN } from "./harness.js";

/*
 * Customer and staff flows shared by the order tests (T07-01 on): a browser
 * with its own device and guest cookies, a staff client, a paid checkout, an
 * accepted quote with a deposit and a before-dispatch balance, and paying the
 * next installment through the fake gateway.
 */

const cookieOf = (response: request.Response, name: string) =>
  ((response.headers["set-cookie"] as unknown as string[] | undefined) ?? []).map((cookie) => cookie.split(";")[0]!).find((cookie) => cookie.startsWith(`${name}=`));

export type Browser = ReturnType<ReturnType<typeof orderFlows>["browser"]>;

export function orderFlows(harness: () => Harness, gateway: () => FakeGateway) {
  const db = () => harness().database.db;
  const notify = () => ({ db: db(), jobs: harness().jobs, sealKey: TEST_SEAL_KEY, webOrigin: TEST_WEB_ORIGIN });

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
      post: (path: string, body: object = {}) => send(request(harness().url).post(path).set("idempotency-key", `test_${randomUUID().replaceAll("-", "")}`).send(body)),
      patch: (path: string, body: object) => send(request(harness().url).patch(path).send(body)),
      put: (path: string, body: object) => send(request(harness().url).put(path).send(body)),
      get: (path: string) => send(request(harness().url).get(path)),
    };
  }

  const staff = (cookie: string) => {
    const req = (test: request.Test) => test.set("origin", TEST_WEB_ORIGIN).set("cookie", cookie);
    return {
      get: (path: string) => req(request(harness().url).get(path)),
      post: (path: string, body: object = {}) => req(request(harness().url).post(path)).set("idempotency-key", `test_${randomUUID().replaceAll("-", "")}`).send(body),
      put: (path: string, body: object) => req(request(harness().url).put(path)).send(body),
    };
  };

  /** A paid business-cards checkout: the order and the browser that paid. */
  async function paidOrder() {
    const b = browser();
    const contact = { name: "Order Tester (TEST DATA)", email: `order.${randomUUID().slice(0, 8)}@example.com`, phone: "0800 000 0000" };
    const created = configurationSchema.parse((await b.post("/v1/configurations", { productSlug: "business-cards", choices: { paper: "350gsm-matte", sides: "both-sides" } })).body);
    const cards = configurationSchema.parse((await b.patch(`/v1/configurations/${created.id}`, { version: created.version, quantity: 250 })).body.draft);
    await b.post("/v1/cart/items", { configurationId: cards.id });
    let checkout = checkoutSchema.parse((await b.post("/v1/checkouts")).body);
    checkout = checkoutSchema.parse((await b.put(`/v1/checkouts/${checkout.id}/contact`, { ...contact, version: checkout.version })).body);
    checkout = checkoutSchema.parse((await b.put(`/v1/checkouts/${checkout.id}/address`, { country: "NG", name: contact.name, phone: contact.phone, street: "12 Admiralty Way", area: "Eti-Osa", state: "Lagos", landmark: "", version: checkout.version })).body);
    checkout = checkoutSchema.parse((await b.put(`/v1/checkouts/${checkout.id}/delivery`, { option: "STANDARD", version: checkout.version })).body);
    checkout = checkoutSchema.parse((await b.put(`/v1/checkouts/${checkout.id}/billing`, { sameAsDelivery: true, version: checkout.version })).body);
    const started = paymentStartSchema.parse((await b.post(`/v1/checkouts/${checkout.id}/payments`)).body);
    gateway().settle(started.reference, { status: "success" });
    const [attempt] = await db().select().from(schema.paymentAttempts).where(eq(schema.paymentAttempts.reference, started.reference));
    await checkPaymentAttempt({ db: db(), gateway: gateway(), notify: notify() }, attempt!.id, 1);
    const view = checkoutSchema.parse((await b.get(`/v1/checkouts/${checkout.id}`)).body);
    return { b, orderId: view.order!.id, contact };
  }

  /** An accepted two-line quote (60% deposit, 40% before dispatch); proofs set NOT_REQUIRED so payment is the only gate. */
  async function acceptedQuote(ada: ReturnType<typeof staff>) {
    const email = `quote.${randomUUID().slice(0, 8)}@example.com`;
    const b = browser();
    let project = projectSchema.parse((await b.post("/v1/projects", { type: "EVENT", title: "Order test (TEST DATA)" })).body);
    project = projectSchema.parse((await b.patch(`/v1/projects/${project.id}`, { version: project.version, answers: { attendees: 200, crew: 20 } })).body);
    project = projectSchema.parse((await b.post(`/v1/projects/${project.id}/submit`, { version: project.version, email })).body);
    const quoteId = project.quote!.id;
    const quote = adminQuoteSchema.parse((await ada.post(`/v1/admin/quotes/${quoteId}/versions`)).body);
    const draft = quote.versions.find((version) => version.status === "DRAFT")!;
    const lines = quote.candidates.slice(0, 2).map((candidate, index) => ({ source: candidate.source, sourceKey: candidate.sourceKey, title: candidate.title, summary: candidate.summary, quantity: candidate.quantity ?? 1, unitMinor: String((index + 1) * 200_000) }));
    const fees = { designMinor: "0", deliveryMinor: "0", deliveryNote: "", installationMinor: "0", installationNote: "", otherMinor: "0", otherLabel: "" };
    const schedule = [
      { label: "Deposit", kind: "PERCENT", value: "6000", trigger: "ON_ACCEPTANCE" },
      { label: "Balance", kind: "PERCENT", value: "4000", trigger: "BEFORE_DISPATCH" },
    ];
    const saved = quoteVersionSchema.parse((await ada.put(`/v1/admin/quotes/${quoteId}/versions/${draft.id}`, { version: draft.version, currency: "NGN", lines, fees, validDays: 14, terms: "Terms", assumptions: "", productionSequence: "", schedule })).body);
    await ada.post(`/v1/admin/quotes/${quoteId}/versions/${draft.id}/send`, { version: saved.version });
    const [mail] = await db().select().from(schema.notifications).where(sql`${schema.notifications.recordId} = ${quoteId} and ${schema.notifications.template} = 'quote_ready'`).orderBy(desc(schema.notifications.createdAt)).limit(1);
    const { url } = unseal(mail!.sealedData!, TEST_SEAL_KEY) as { url: string };
    const guest = browser();
    await guest.post("/v1/guest-links/redeem", { secret: url.split("#")[1] });
    await guest.post("/v1/email-codes", { purpose: "ACCEPT_QUOTE" });
    const [codeMail] = await db().select().from(schema.notifications).where(sql`${schema.notifications.recipient} = ${email} and ${schema.notifications.template} = 'email_code'`).orderBy(desc(schema.notifications.createdAt)).limit(1);
    const { code } = unseal(codeMail!.sealedData!, TEST_SEAL_KEY) as { code: string };
    await guest.post("/v1/email-codes/verify", { purpose: "ACCEPT_QUOTE", code });
    const order = (await guest.post(`/v1/quotes/${quoteId}/accept`, { versionNumber: 1, acknowledged: true })).body as { id: string };
    const items = await db().select().from(schema.orderItems).where(eq(schema.orderItems.orderId, order.id)).orderBy(schema.orderItems.position);
    await db()
      .update(schema.proofs)
      .set({ status: "NOT_REQUIRED", requirement: "NOT_REQUIRED" })
      .where(sql`${schema.proofs.orderItemId} in (${sql.join(items.map((row) => sql`${row.id}`), sql`, `)})`);
    return { guest, orderId: order.id, items, email };
  }

  /** Pays the order's next installment through the fake gateway. */
  async function payNext(guest: Browser, orderId: string) {
    const order = orderSchema.parse((await guest.get(`/v1/orders/${orderId}`)).body);
    const next = order.payments!.next!;
    const started = paymentStartSchema.parse((await guest.post(`/v1/orders/${orderId}/installments/${next.id}/payments`)).body);
    gateway().settle(started.reference, { status: "success" });
    const [attempt] = await db().select().from(schema.paymentAttempts).where(eq(schema.paymentAttempts.reference, started.reference));
    await checkPaymentAttempt({ db: db(), gateway: gateway(), notify: notify() }, attempt!.id, 1);
    return orderSchema.parse((await guest.get(`/v1/orders/${orderId}`)).body);
  }

  return { browser, staff, paidOrder, acceptedQuote, payNext, notify };
}
