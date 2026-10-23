import { adminQuoteSchema, approvalPolicySchema, collectionSchema, configurationSchema, orderDraftOriginSchema, orderDraftStateSchema, participationSchema } from "@holypearls/contracts";
import { TEST_PEOPLE } from "@holypearls/auth";
import { eq, schema, sql } from "@holypearls/db";
import type { FakeGateway } from "@holypearls/testkit";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { type Actors, as, expectForbidden, expectHidden, signInActors } from "../testing/actors.js";
import { orderFlows } from "../testing/flows.js";
import { createHarness, type Harness, TEST_WEB_ORIGIN } from "../testing/harness.js";
import { purgeParticipantContacts } from "./collections.js";

/*
 * T12-03b: the Order Draft, reopening and the staff origin view (PRD-05
 * B2B-FR-054–055; OPS-FR-090; Pen 133). Done when: the 60-person journey
 * passes; reopening marks the draft STALE.
 */

vi.setConfig({ testTimeout: 600_000 });

let harness: Harness;
let actors: Partial<Actors>;
let acme: string;
let lekki: string;
const db = () => harness.database.db;
const api = (key: keyof Actors) => as(harness, actors[key] ?? "");
const base = () => `/v1/organizations/${acme}/collections`;
const SIZES = ["S", "M", "L", "XL"] as const;

async function openCollection(title: string) {
  const polo = configurationSchema.parse((await api("acmeOwner").post("/v1/configurations", { productSlug: "polo-shirt", choices: { colour: "navy", fabric: "pique-cotton" } })).body);
  let collection = collectionSchema.parse((await api("acmeOwner").post(base(), { title, locationId: lekki, configurationId: polo.id })).body);
  collection = collectionSchema.parse(
    (
      await api("acmeOwner").put(`${base()}/${collection.id}`, {
        title,
        fields: ["SIZE", "PERSONALIZATION"],
        deadline: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        deliveryMode: "CENTRAL",
        centralLocationId: lekki,
        branchLocationIds: [],
        unsureSizeRule: "ALLOW_UNSURE",
        version: collection.version,
      })
    ).body,
  );
  collection = collectionSchema.parse((await api("acmeOwner").post(`${base()}/${collection.id}/open`, { version: collection.version })).body);
  return { id: collection.id, secret: collection.shareUrl!.split("#")[1]! };
}

/** One person on their own phone: joins, and unless `send` is false, answers and sends. */
async function person(secret: string, index: number, send = true) {
  let cookie = "";
  const call = (test: request.Test) =>
    test
      .set("origin", TEST_WEB_ORIGIN)
      .set("cookie", cookie)
      .then((response) => {
        const set = ((response.headers["set-cookie"] as unknown as string[] | undefined) ?? []).find((value) => value.startsWith("hp.guest="));
        if (set) cookie = set.split(";")[0]!;
        return response;
      });
  const joined = await call(request(harness.url).post("/v1/collections/join").set("idempotency-key", randomUUID()).send({ secret, name: `Staff ${index}`, email: `staff${index}.${randomUUID().slice(0, 6)}@example.com` }));
  const id = (joined.body as { participantId: string }).participantId;
  if (!send) return id;
  const current = participationSchema.parse((await call(request(harness.url).get(`/v1/participants/${id}`))).body);
  const answers = { size: SIZES[index % SIZES.length], sizeUnsure: false, personalization: index % 3 === 0 ? null : `STAFF${index}`.slice(0, 12), quantity: null, colour: null, branchLocationId: null };
  const saved = participationSchema.parse((await call(request(harness.url).put(`/v1/participants/${id}/answers`).send({ answers, version: current.version }))).body);
  await call(request(harness.url).post(`/v1/participants/${id}/submit`).set("idempotency-key", randomUUID()).send({ version: saved.version }));
  return id;
}

const collection = async (id: string) => collectionSchema.parse((await api("acmeOwner").get(`${base()}/${id}`)).body);
const draftState = async (id: string) => orderDraftStateSchema.parse((await api("acmeOwner").get(`${base()}/${id}/order-draft`)).body);
const board = async (id: string) => (await api("acmeOwner").get(`${base()}/${id}/dashboard`)).body as { participants: { id: string; version: number }[] };

beforeAll(async () => {
  harness = await createHarness();
  actors = await signInActors(harness, ["acmeOwner", "acmeViewer", "adminAda", "financeFolake"]);
  const [organization] = await db().select().from(schema.organizations).where(sql`${schema.organizations.name} like 'ACME%'`);
  acme = organization!.id;
  const [location] = await db().select().from(schema.locations).where(sql`${schema.locations.organizationId} = ${acme} and ${schema.locations.name} = 'Lekki'`);
  lekki = location!.id;
});

afterAll(async () => {
  await harness?.close();
});

describe("the Order Draft (B2B-FR-054–055)", () => {
  it("the 60-person journey: 58 answer, 2 are left out, the draft totals them, reopening marks it STALE, it's made again and sent for a quote", async () => {
    const { id, secret } = await openCollection("60-person staff polos");
    const people: string[] = [];
    for (let index = 0; index < 60; index++) people.push(await person(secret, index, index < 58));

    // Close: two haven't sent, so it needs review; leave them out and it's ready.
    await api("acmeOwner").post(`${base()}/${id}/close`, { version: (await collection(id)).version });
    expect((await collection(id)).status).toBe("NEEDS_REVIEW");
    for (const late of people.slice(58)) {
      const row = (await board(id)).participants.find((item) => item.id === late)!;
      await api("acmeOwner").post(`${base()}/${id}/participants/${late}/exclude`, { version: row.version });
    }
    expect((await collection(id)).status).toBe("READY_TO_ORDER");

    // The draft: 58 pieces by size, names counted, 2 excluded.
    let state = orderDraftStateSchema.parse((await api("acmeOwner").post(`${base()}/${id}/order-draft`, { version: (await collection(id)).version })).body);
    expect(state.current).toMatchObject({ status: "CURRENT", pieces: 58, includedCount: 58, excludedCount: 2, delivery: [{ name: "Lekki", count: 58 }] });
    expect(state.current!.sizes).toEqual([
      { size: "S", count: 15 },
      { size: "M", count: 15 },
      { size: "L", count: 14 },
      { size: "XL", count: 14 },
    ]);
    expect(state.current!.withNames).toBe(38);
    expect((await collection(id)).status).toBe("ORDER_DRAFT_CREATED");
    // People can't be removed from a drafted collection without reopening it.
    const first = (await board(id)).participants[0]!;
    expect((await api("acmeOwner").post(`${base()}/${id}/participants/${first.id}/remove`, { version: first.version })).body.context?.reason).toBe("WRONG_STATUS");

    // Reopen: the draft is STALE (B2B-FR-055). One more person answers; close and make it again.
    await api("acmeOwner").post(`${base()}/${id}/reopen`, { deadline: new Date(Date.now() + 86_400_000).toISOString(), version: (await collection(id)).version });
    state = await draftState(id);
    expect(state).toMatchObject({ current: null, stale: 1 });
    await person(secret, 60);
    await api("acmeOwner").post(`${base()}/${id}/close`, { version: (await collection(id)).version });
    expect((await collection(id)).status).toBe("READY_TO_ORDER");
    state = orderDraftStateSchema.parse((await api("acmeOwner").post(`${base()}/${id}/order-draft`, { version: (await collection(id)).version })).body);
    expect(state).toMatchObject({ current: { status: "CURRENT", pieces: 59 }, stale: 1 });

    // Submit: one design with the size split and a row per name, sent to HolyPearls for a quote.
    state = orderDraftStateSchema.parse((await api("acmeOwner").post(`${base()}/${id}/order-draft/submit`, { version: state.current!.version })).body);
    expect(state.current).toMatchObject({ status: "SUBMITTED", route: "QUOTE", quoteReference: expect.stringMatching(/^HP-Q-/) });
    const [draft] = await db().select().from(schema.orderDrafts).where(eq(schema.orderDrafts.id, state.current!.id));
    const sizes = await db().select().from(schema.configurationSizes).where(eq(schema.configurationSizes.configurationId, draft!.configurationId!));
    expect(sizes.reduce((sum, row) => sum + row.quantity, 0)).toBe(59);
    const names = await db().select().from(schema.configurationPersonalizationRows).where(eq(schema.configurationPersonalizationRows.configurationId, draft!.configurationId!));
    expect(names).toHaveLength(38); // every third person chose just the logo, including the 59th
    const [quote] = await db().select().from(schema.quotes).where(eq(schema.quotes.id, draft!.quoteId!));
    expect(quote).toMatchObject({ organizationId: acme, locationId: lekki });

    // A sent draft can't be reopened the simple way: changes need a request.
    expect((await api("acmeOwner").post(`${base()}/${id}/reopen`, { deadline: new Date(Date.now() + 86_400_000).toISOString(), version: (await collection(id)).version })).body.context?.reason).toBe("DRAFT_SUBMITTED");

    // Staff see where the 59 came from, read only (OPS-FR-090), from the quote.
    const staffQuote = adminQuoteSchema.parse((await api("adminAda").get(`/v1/admin/quotes/${draft!.quoteId}`)).body);
    expect(staffQuote.orderDraftId).toBe(draft!.id);
    const origin = orderDraftOriginSchema.parse((await api("adminAda").get(`/v1/admin/order-drafts/${draft!.id}`)).body);
    expect(origin).toMatchObject({ pieces: 59, fromLink: 59, fromImports: [], excluded: [{ reason: "Left out during review" }, { reason: "Left out during review" }] });
    expectForbidden(await api("financeFolake").get(`/v1/admin/order-drafts/${draft!.id}`), "QUOTE_MANAGE");
    expectHidden(await api("acmeOwner").get(`/v1/admin/order-drafts/${draft!.id}`));
  });

  it("participants' names and emails go 12 months after the order was delivered, with their imported rows; sooner or undelivered, they stay (T15-03; TECH-06 §12)", async () => {
    const { id, secret } = await openCollection("Retention polos");
    const people = [await person(secret, 0, true), await person(secret, 1, true)];
    await api("acmeOwner").post(`${base()}/${id}/close`, { version: (await collection(id)).version });
    let state = orderDraftStateSchema.parse((await api("acmeOwner").post(`${base()}/${id}/order-draft`, { version: (await collection(id)).version })).body);
    state = orderDraftStateSchema.parse((await api("acmeOwner").post(`${base()}/${id}/order-draft/submit`, { version: state.current!.version })).body);
    // Stand-in for staff quoting and the customer accepting: a real accepted quote and its order, attached to this draft.
    const flows = orderFlows(
      () => harness,
      () => harness.payments as FakeGateway,
    );
    const { orderId } = await flows.acceptedQuote(flows.staff(actors.adminAda!));
    const [version] = await db().select({ quoteId: schema.quoteVersions.quoteId }).from(schema.orders).innerJoin(schema.quoteVersions, eq(schema.quoteVersions.id, schema.orders.quoteVersionId)).where(eq(schema.orders.id, orderId));
    await db().update(schema.orderDrafts).set({ quoteId: version!.quoteId }).where(eq(schema.orderDrafts.id, state.current!.id));
    const [user] = await db().select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, TEST_PEOPLE.acmeOwner.email));
    const [file] = await db().insert(schema.files).values({ purpose: "CSV_IMPORT", status: "READY", bucket: "private", originalName: "a.csv", safeName: "a.csv", declaredType: "text/csv", declaredSize: 1, storageKey: `files/source/${randomUUID()}`, uploadedByUserId: user!.id }).returning();
    const [batch] = await db().insert(schema.importBatches).values({ collectionId: id, fileId: file!.id, fileName: "a.csv", headers: ["Name", "Email"] }).returning();
    await db().insert(schema.importRows).values({ batchId: batch!.id, line: 2, raw: ["Imported Person", "imported@example.com"], values: { name: "Imported Person" }, participantId: people[0] });
    const delivered = (monthsAgo: number) => db().insert(schema.shipments).values({ orderId, number: `SHP-T-${randomUUID().slice(0, 6)}`, status: "DELIVERED", destination: "somewhere", deliveredAt: new Date(Date.now() - monthsAgo * 30.5 * 86_400_000) });
    const names = async () => (await db().select({ name: schema.participants.name, email: schema.participants.email }).from(schema.participants).where(sql`${schema.participants.id} in (${sql.join(people.map((p) => sql`${p}`), sql`, `)})`));

    // Undelivered: kept, even with an old shipment record.
    await delivered(13);
    expect(await purgeParticipantContacts(db(), new Date())).toBe(0);
    // Delivered 11 months ago: kept.
    await db().update(schema.orderItems).set({ status: "DELIVERED" }).where(eq(schema.orderItems.orderId, orderId));
    await db().delete(schema.shipments).where(eq(schema.shipments.orderId, orderId));
    await delivered(11);
    expect(await purgeParticipantContacts(db(), new Date())).toBe(0);
    expect((await names()).every((row) => row.email !== "")).toBe(true);
    // Delivered 13 months ago: names and emails go, answers stay, imported cells are emptied.
    await db().delete(schema.shipments).where(eq(schema.shipments.orderId, orderId));
    await delivered(13);
    expect(await purgeParticipantContacts(db(), new Date())).toBeGreaterThanOrEqual(2);
    expect(await names()).toEqual([{ name: "Removed participant", email: "" }, { name: "Removed participant", email: "" }]);
    expect((await db().select().from(schema.participantSubmissions).where(eq(schema.participantSubmissions.participantId, people[0]!)))[0]!.answers).toMatchObject({ size: expect.any(String) });
    expect((await db().select().from(schema.importRows).where(eq(schema.importRows.batchId, batch!.id)))[0]).toMatchObject({ raw: [], values: {} });
    // Safe to repeat.
    expect(await purgeParticipantContacts(db(), new Date())).toBe(0);
  });

  it("with the organization's approval rule on, submitting makes an order request instead", async () => {
    const policy = approvalPolicySchema.parse((await api("acmeOwner").get(`/v1/organizations/${acme}/approvals/policy`)).body);
    await api("acmeOwner").put(`/v1/organizations/${acme}/approvals/policy`, { rule: "ALL", thresholdMinor: null, requesterMembershipIds: [], separateRequesterApprover: true, version: policy.version });
    try {
      const { id, secret } = await openCollection("Small team polos");
      for (let index = 0; index < 3; index++) await person(secret, index);
      await api("acmeOwner").post(`${base()}/${id}/close`, { version: (await collection(id)).version });
      let state = orderDraftStateSchema.parse((await api("acmeOwner").post(`${base()}/${id}/order-draft`, { version: (await collection(id)).version })).body);
      // Only people who manage the collection make and send drafts.
      expectForbidden(await api("acmeViewer").post(`${base()}/${id}/order-draft/submit`, { version: state.current!.version }), "MANAGE_COLLECTIONS");
      state = orderDraftStateSchema.parse((await api("acmeOwner").post(`${base()}/${id}/order-draft/submit`, { version: state.current!.version })).body);
      expect(state.current).toMatchObject({ status: "SUBMITTED", route: "APPROVAL", orderRequestId: expect.any(String), quoteReference: null });
      const [orderRequest] = await db().select().from(schema.orderRequests).where(eq(schema.orderRequests.id, state.current!.orderRequestId!));
      expect(orderRequest).toMatchObject({ status: "PENDING_APPROVAL", locationId: lekki });
    } finally {
      const current = approvalPolicySchema.parse((await api("acmeOwner").get(`/v1/organizations/${acme}/approvals/policy`)).body);
      await api("acmeOwner").put(`/v1/organizations/${acme}/approvals/policy`, { rule: "NONE", thresholdMinor: null, requesterMembershipIds: [], separateRequesterApprover: true, version: current.version });
    }
  });
});
