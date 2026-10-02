import { adminProofQueueSchema, adminProofSchema, apiErrorSchema, checkoutSchema, configurationSchema, customerProofSchema, orderSchema, paymentStartSchema } from "@holypearls/contracts";
import { desc, eq, schema, sql } from "@holypearls/db";
import { unseal } from "@holypearls/email";
import { FakeGateway } from "@holypearls/testkit";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { checkPaymentAttempt } from "../payments/payments.js";
import { as, expectHidden, signInActors, type Actors } from "../testing/actors.js";
import { createHarness, type Harness, TEST_SEAL_KEY, TEST_WEB_ORIGIN } from "../testing/harness.js";

/*
 * T06-01: proofs per order item, staff preparation and publishing, and the
 * customer's decisions (FUL-FR-001–004, 006; OPS-FR-050–051). Done when:
 * publishing creates an unchangeable version; the item stays waiting until
 * approval; never labelled approved before approval; V1/V2 history; approval
 * needs a code.
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

const email = () => `proof.${randomUUID().slice(0, 8)}@example.com`;

/** A paid business-cards checkout: the order and the browser that paid. */
async function paidOrder() {
  const b = browser();
  const contact = { name: "Proof Tester (TEST DATA)", email: email(), phone: "0800 000 0000" };
  const created = configurationSchema.parse((await b.post("/v1/configurations", { productSlug: "business-cards", choices: { paper: "350gsm-matte", sides: "both-sides" } })).body);
  const cards = configurationSchema.parse((await b.patch(`/v1/configurations/${created.id}`, { version: created.version, quantity: 250 })).body.draft);
  await b.post("/v1/cart/items", { configurationId: cards.id });
  let checkout = checkoutSchema.parse((await b.post("/v1/checkouts")).body);
  checkout = checkoutSchema.parse((await b.put(`/v1/checkouts/${checkout.id}/contact`, { ...contact, version: checkout.version })).body);
  checkout = checkoutSchema.parse((await b.put(`/v1/checkouts/${checkout.id}/address`, { country: "NG", name: contact.name, phone: contact.phone, street: "12 Admiralty Way", area: "Eti-Osa", state: "Lagos", landmark: "" , version: checkout.version })).body);
  checkout = checkoutSchema.parse((await b.put(`/v1/checkouts/${checkout.id}/delivery`, { option: "STANDARD", version: checkout.version })).body);
  checkout = checkoutSchema.parse((await b.put(`/v1/checkouts/${checkout.id}/billing`, { sameAsDelivery: true, version: checkout.version })).body);
  const started = paymentStartSchema.parse((await b.post(`/v1/checkouts/${checkout.id}/payments`)).body);
  gateway.settle(started.reference, { status: "success" });
  const [attempt] = await db().select().from(schema.paymentAttempts).where(eq(schema.paymentAttempts.reference, started.reference));
  await checkPaymentAttempt({ db: db(), gateway, notify: notify() }, attempt!.id, 1);
  const view = checkoutSchema.parse((await b.get(`/v1/checkouts/${checkout.id}`)).body);
  return { b, orderId: view.order!.id, contact };
}

/** A proof file staff uploaded and the checks passed. */
async function proofFile(name = "badge-proof-v1.pdf") {
  const [file] = await db()
    .insert(schema.files)
    .values({ purpose: "PROOF", status: "READY", originalName: name, safeName: name, declaredType: "application/pdf", declaredSize: 1000, storageKey: `proofs/${randomUUID()}`, bucket: "private" })
    .returning();
  return file!;
}

const details = { placement: "Front", dimensions: "85 × 55 mm", colourReference: "CMYK", quantity: "250", notes: "Spelling as supplied." };

/** Publishes a version for the order's first proof; returns the proof id. */
async function publishVersion(ada: ReturnType<typeof staff>, proofId: string) {
  const prepared = adminProofSchema.parse((await ada.post(`/v1/admin/proofs/${proofId}/versions`)).body);
  const draft = prepared.versions.find((version) => version.status === "DRAFT")!;
  const file = await proofFile();
  const saved = adminProofSchema.parse((await ada.put(`/v1/admin/proofs/${proofId}/draft`, { version: draft.version, views: [{ label: "Front", fileId: file.id }], details })).body);
  const again = saved.versions.find((version) => version.status === "DRAFT")!;
  return adminProofSchema.parse((await ada.post(`/v1/admin/proofs/${proofId}/publish`, { version: again.version })).body);
}

/** Opens the order from the proof email and checks an email code, as the customer would. */
async function guestFromProofEmail(orderId: string, to: string) {
  const [mail] = await db().select().from(schema.notifications).where(sql`${schema.notifications.recordId} = ${orderId} and ${schema.notifications.template} = 'proof_ready'`).orderBy(desc(schema.notifications.createdAt)).limit(1);
  const { url } = unseal(mail!.sealedData!, TEST_SEAL_KEY) as { url: string };
  const guest = browser();
  await guest.post("/v1/guest-links/redeem", { secret: url.split("#")[1] });
  await guest.post("/v1/email-codes", { purpose: "APPROVE_PROOF" });
  const [codeMail] = await db().select().from(schema.notifications).where(sql`${schema.notifications.recipient} = ${to} and ${schema.notifications.template} = 'email_code'`).orderBy(desc(schema.notifications.createdAt)).limit(1);
  const { code } = unseal(codeMail!.sealedData!, TEST_SEAL_KEY) as { code: string };
  return { guest, code };
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

describe("proofs per order item (FUL-FR-001, OPS-FR-018)", () => {
  it("are made with the order, from the product rule, and listed on the order", async () => {
    const { b, orderId } = await paidOrder();
    const order = orderSchema.parse((await b.get(`/v1/orders/${orderId}`)).body);
    expect(order.proofs).toHaveLength(1);
    expect(["PREPARING", "NOT_REQUIRED"]).toContain(order.proofs[0]!.status);
  });
});

describe("staff preparation and publishing (OPS-FR-050–051)", () => {
  it("publishes a version that can never change, and emails the customer", async () => {
    const { orderId } = await paidOrder();
    const ada = staff(actors.adminAda!);
    const queue = adminProofQueueSchema.parse((await ada.get("/v1/admin/proofs")).body);
    const row = queue.proofs.find((proof) => proof.orderId === orderId)!;
    await db().update(schema.proofs).set({ status: "PREPARING", requirement: "REQUIRED" }).where(eq(schema.proofs.id, row.id));
    const published = await publishVersion(ada, row.id);
    expect(published).toMatchObject({ status: "AWAITING_APPROVAL", versions: [expect.objectContaining({ number: 1, status: "PUBLISHED", details })] });
    const [mail] = await db().select().from(schema.notifications).where(sql`${schema.notifications.recordId} = ${orderId} and ${schema.notifications.template} = 'proof_ready'`);
    expect(mail).toBeTruthy();

    const version = published.versions[0]!;
    const refused = await db()
      .update(schema.proofVersions)
      .set({ details: { ...details, notes: "Changed later" } })
      .where(eq(schema.proofVersions.id, version.id))
      .then(
        () => "allowed",
        (error: Error & { cause?: Error }) => error.cause?.message ?? error.message,
      );
    expect(refused).toMatch(/published and cannot change/);
    const noDraft = await ada.put(`/v1/admin/proofs/${row.id}/draft`, { version: version.version, views: [], details });
    expect(apiErrorSchema.parse(noDraft.body).context).toMatchObject({ reason: "NO_DRAFT" });
  });

  it("refuses to publish without a ready file, and needs PROOF_MANAGE", async () => {
    const { orderId } = await paidOrder();
    const ada = staff(actors.adminAda!);
    const queue = adminProofQueueSchema.parse((await ada.get("/v1/admin/proofs?view=all")).body);
    const [proof] = await db()
      .select({ id: schema.proofs.id })
      .from(schema.proofs)
      .innerJoin(schema.orderItems, eq(schema.orderItems.id, schema.proofs.orderItemId))
      .where(eq(schema.orderItems.orderId, orderId));
    void queue;
    await db().update(schema.proofs).set({ status: "PREPARING" }).where(eq(schema.proofs.id, proof!.id));
    const prepared = adminProofSchema.parse((await ada.post(`/v1/admin/proofs/${proof!.id}/versions`)).body);
    const draft = prepared.versions[0]!;
    const empty = await ada.post(`/v1/admin/proofs/${proof!.id}/publish`, { version: draft.version });
    expect(apiErrorSchema.parse(empty.body).fieldErrors).toHaveProperty("views");
    expect((await staff(actors.adminTunde!).get(`/v1/admin/proofs/${proof!.id}`)).status).toBe(403);
    expect((await staff(actors.adminTunde!).get("/v1/admin/proofs")).status).toBe(403);
    expectHidden(await as(harness, actors.customerChidi!).get("/v1/admin/proofs"));
  });

  it("lets staff mark a file ready or reject it with a note (audited)", async () => {
    const ada = staff(actors.adminAda!);
    const [file] = await db()
      .insert(schema.files)
      .values({ purpose: "ARTWORK", status: "NEEDS_REVIEW", originalName: "logo.ai", safeName: "logo.ai", declaredType: "application/postscript", declaredSize: 1000, storageKey: `x/${randomUUID()}` })
      .returning();
    const queue = adminProofQueueSchema.parse((await ada.get("/v1/admin/proofs")).body);
    expect(queue.files.map((item) => item.id)).toContain(file!.id);
    const noNote = await ada.post(`/v1/admin/files/${file!.id}/decision`, { decision: "REJECTED" });
    expect(apiErrorSchema.parse(noNote.body).fieldErrors).toHaveProperty("note");
    expect((await ada.post(`/v1/admin/files/${file!.id}/decision`, { decision: "REJECTED", note: "Too small to print" })).status).toBe(200);
    expect((await ada.post(`/v1/admin/files/${file!.id}/decision`, { decision: "READY" })).status).toBe(409);
  });
});

describe("the customer's decisions (FUL-FR-002–004)", () => {
  async function awaiting() {
    const made = await paidOrder();
    const ada = staff(actors.adminAda!);
    const [proof] = await db()
      .select({ id: schema.proofs.id })
      .from(schema.proofs)
      .innerJoin(schema.orderItems, eq(schema.orderItems.id, schema.proofs.orderItemId))
      .where(eq(schema.orderItems.orderId, made.orderId));
    await db().update(schema.proofs).set({ status: "PREPARING", requirement: "REQUIRED" }).where(eq(schema.proofs.id, proof!.id));
    await publishVersion(ada, proof!.id);
    return { ...made, ada, proofId: proof!.id };
  }

  it("shows the published version, never labelled approved before approval, and is 404 for others", async () => {
    const { b, orderId, proofId } = await awaiting();
    const proof = customerProofSchema.parse((await b.get(`/v1/orders/${orderId}/proofs/${proofId}`)).body);
    expect(proof).toMatchObject({ status: "AWAITING_APPROVAL", canDecide: true, current: { number: 1, status: "PUBLISHED", decision: null } });
    expectHidden(await browser().get(`/v1/orders/${orderId}/proofs/${proofId}`));
    expectHidden(await as(harness, actors.customerChidi!).get(`/v1/orders/${orderId}/proofs/${proofId}`));
  });

  it("needs the tick and an email code to approve; approval is kept and the item still waits", async () => {
    const { orderId, proofId, contact } = await awaiting();
    const { guest, code } = await guestFromProofEmail(orderId, contact.email);
    expect((await guest.post(`/v1/orders/${orderId}/proofs/${proofId}/approve`, { versionNumber: 1, acknowledged: false })).status).toBe(400);
    const noCode = await guest.post(`/v1/orders/${orderId}/proofs/${proofId}/approve`, { versionNumber: 1, acknowledged: true });
    expect(apiErrorSchema.parse(noCode.body).code).toBe("RECENT_EMAIL_CODE_REQUIRED");
    expect((await guest.post("/v1/email-codes/verify", { purpose: "APPROVE_PROOF", code })).status).toBe(200);
    const presses = await Promise.all([1, 2].map(() => guest.post(`/v1/orders/${orderId}/proofs/${proofId}/approve`, { versionNumber: 1, acknowledged: true })));
    expect(presses.every((response) => response.status === 200)).toBe(true);
    const approved = customerProofSchema.parse(presses[0]!.body);
    expect(approved).toMatchObject({ status: "APPROVED", canDecide: false, current: { status: "APPROVED", decision: { decision: "APPROVED" } } });
    expect(await db().select().from(schema.proofDecisions).innerJoin(schema.proofVersions, eq(schema.proofVersions.id, schema.proofDecisions.proofVersionId)).where(eq(schema.proofVersions.proofId, proofId))).toHaveLength(1);
    const [item] = await db().select({ status: schema.orderItems.status }).from(schema.orderItems).where(eq(schema.orderItems.orderId, orderId));
    expect(item!.status).toBe("AWAITING_PREREQUISITE");
  });

  it("keeps V1 in history when changes are requested and V2 follows; questions leave it undecided", async () => {
    const { b, orderId, proofId, ada } = await awaiting();
    const asked = customerProofSchema.parse((await b.post(`/v1/orders/${orderId}/proofs/${proofId}/questions`, { versionNumber: 1, body: "Is the logo vector?" })).body);
    expect(asked).toMatchObject({ status: "AWAITING_APPROVAL", current: { comments: [expect.objectContaining({ kind: "QUESTION" })] } });
    const changed = customerProofSchema.parse((await b.post(`/v1/orders/${orderId}/proofs/${proofId}/changes`, { versionNumber: 1, note: "Long names are cut off." })).body);
    expect(changed).toMatchObject({ status: "CHANGES_REQUESTED", canDecide: false, current: { status: "CHANGES_REQUESTED" } });
    const revising = adminProofSchema.parse((await ada.post(`/v1/admin/proofs/${proofId}/versions`)).body);
    expect(revising.status).toBe("REVISION_IN_PROGRESS");
    const draft = revising.versions.find((version) => version.status === "DRAFT")!;
    expect(draft).toMatchObject({ number: 2, details });
    const file = await proofFile("badge-proof-v2.pdf");
    const saved = adminProofSchema.parse((await ada.put(`/v1/admin/proofs/${proofId}/draft`, { version: draft.version, views: [{ label: "Front", fileId: file.id }], details: { ...details, notes: "Surnames resized." } })).body);
    await ada.post(`/v1/admin/proofs/${proofId}/publish`, { version: saved.versions.find((version) => version.status === "DRAFT")!.version });
    const v2 = customerProofSchema.parse((await b.get(`/v1/orders/${orderId}/proofs/${proofId}`)).body);
    expect(v2.history.map((version) => [version.number, version.status])).toEqual([
      [2, "PUBLISHED"],
      [1, "CHANGES_REQUESTED"],
    ]);
    const old = await b.post(`/v1/orders/${orderId}/proofs/${proofId}/changes`, { versionNumber: 1, note: "again" });
    expect(apiErrorSchema.parse(old.body).context).toMatchObject({ reason: "NOT_CURRENT_VERSION" });
  });
});
