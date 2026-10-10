import { collectionDashboardSchema, collectionSchema, configurationSchema, participationSchema } from "@holypearls/contracts";
import { eq, schema, sql } from "@holypearls/db";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { type Actors, as, expectForbidden, expectHidden, signInActors } from "../testing/actors.js";
import { createHarness, type Harness, TEST_WEB_ORIGIN } from "../testing/harness.js";

/*
 * T12-03: the organizer's dashboard, correction, removal, closing and review
 * (PRD-05 B2B-FR-053–055; Pen 30, 74, 133, 134). Done when: closing never
 * starts production; NEEDS_REVIEW until issues are fixed or excluded; a
 * removed participant is excluded from totals and kept in history.
 */

vi.setConfig({ testTimeout: 300_000 });

let harness: Harness;
let actors: Partial<Actors>;
let acme: string;
let lekki: string;
const db = () => harness.database.db;
const api = (key: keyof Actors) => as(harness, actors[key] ?? "");
const base = () => `/v1/organizations/${acme}/collections`;

function browser() {
  const jar = new Map<string, string>();
  const send = (test: request.Test) => {
    test.set("origin", TEST_WEB_ORIGIN);
    if (jar.size) test.set("cookie", [...jar.values()].join("; "));
    return test.then((response) => {
      for (const set of (response.headers["set-cookie"] as unknown as string[] | undefined) ?? []) {
        const [pair] = set.split(";");
        if (pair!.startsWith("hp.guest=")) jar.set("hp.guest", pair!);
      }
      return response;
    });
  };
  return {
    get: (path: string) => send(request(harness.url).get(path)),
    post: (path: string, body: object = {}) => send(request(harness.url).post(path).set("idempotency-key", `test_${randomUUID().replaceAll("-", "")}`).send(body)),
    put: (path: string, body: object) => send(request(harness.url).put(path).send(body)),
  };
}

async function openCollection() {
  const polo = configurationSchema.parse((await api("acmeOwner").post("/v1/configurations", { productSlug: "polo-shirt", choices: { colour: "navy", fabric: "pique-cotton" } })).body);
  let collection = collectionSchema.parse((await api("acmeOwner").post(base(), { title: `Staff polos ${randomUUID().slice(0, 6)}`, locationId: lekki, configurationId: polo.id })).body);
  collection = collectionSchema.parse(
    (
      await api("acmeOwner").put(`${base()}/${collection.id}`, {
        title: collection.title,
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
  return { collection, secret: collection.shareUrl!.split("#")[1]! };
}

/** A participant who joins and, unless `send` is false, answers and sends. */
async function participant(secret: string, name: string, answers: Record<string, unknown> | null) {
  const phone = browser();
  const joined = await phone.post("/v1/collections/join", { secret, name, email: `${name.toLowerCase()}.${randomUUID().slice(0, 6)}@example.com` });
  const id = (joined.body as { participantId: string }).participantId;
  if (answers) {
    const current = participationSchema.parse((await phone.get(`/v1/participants/${id}`)).body);
    const saved = participationSchema.parse((await phone.put(`/v1/participants/${id}/answers`, { answers: { size: null, sizeUnsure: false, personalization: null, quantity: null, colour: null, branchLocationId: null, ...answers }, version: current.version })).body);
    await phone.post(`/v1/participants/${id}/submit`, { version: saved.version });
  }
  return { phone, id };
}

const dashboard = async (person: keyof Actors = "acmeOwner", id?: string) => collectionDashboardSchema.parse((await api(person).get(`${base()}/${id}/dashboard`)).body);
const versionOf = (board: { participants: { id: string; version: number }[] }, id: string) => board.participants.find((row) => row.id === id)!.version;
const statusOf = async (id: string) => collectionSchema.parse((await api("acmeOwner").get(`${base()}/${id}`)).body);
const act = (collectionId: string, participantId: string, action: string, body: Record<string, unknown>) => api("acmeOwner").post(`${base()}/${collectionId}/participants/${participantId}/${action}`, body);

beforeAll(async () => {
  harness = await createHarness();
  actors = await signInActors(harness, ["acmeOwner", "acmeViewer"]);
  const [organization] = await db().select().from(schema.organizations).where(sql`${schema.organizations.name} like 'ACME%'`);
  acme = organization!.id;
  const [location] = await db().select().from(schema.locations).where(sql`${schema.locations.organizationId} = ${acme} and ${schema.locations.name} = 'Lekki'`);
  lekki = location!.id;
});

afterAll(async () => {
  await harness?.close();
});

describe("the organizer's dashboard (Pen 30)", () => {
  it("progress, issues, live sizes and delivery; a correction goes back to the participant", async () => {
    const { collection, secret } = await openCollection();
    const ada = await participant(secret, "Ada", { size: "M", personalization: "ADA" });
    const bola = await participant(secret, "Bola", { sizeUnsure: true });
    const chidi = await participant(secret, "Chidi", null);
    let board = await dashboard("acmeOwner", collection.id);
    expect(board.progress).toMatchObject({ total: 3, submitted: 2, incomplete: 1, notStarted: 0, removed: 0 });
    expect(board.issues.map((issue) => [issue.name, issue.kind])).toEqual([
      ["Bola", "SIZE_TO_CONFIRM"],
      ["Chidi", "NOT_SUBMITTED"],
    ]);
    expect(board).toMatchObject({ sizes: [{ size: "M", count: 1 }], sizesToConfirm: 1, withNames: 1, pieces: 2, delivery: [{ name: "Lekki", count: 2 }] });

    // Ask Ada to correct her name: she sees why and sends again.
    expect((await act(collection.id, ada.id, "correction", { note: "", version: versionOf(board, ada.id) })).status).toBe(400);
    board = collectionDashboardSchema.parse((await act(collection.id, ada.id, "correction", { note: "Use your full first name", version: versionOf(board, ada.id) })).body);
    expect(board.participants.find((row) => row.id === ada.id)!.status).toBe("NEEDS_CORRECTION");
    const fix = participationSchema.parse((await ada.phone.get(`/v1/participants/${ada.id}`)).body);
    expect(fix).toMatchObject({ status: "NEEDS_CORRECTION", correction: "Use your full first name" });
    const saved = participationSchema.parse((await ada.phone.put(`/v1/participants/${ada.id}/answers`, { answers: { ...fix.answers, personalization: "ADAEZE" }, version: fix.version })).body);
    expect(participationSchema.parse((await ada.phone.post(`/v1/participants/${ada.id}/submit`, { version: saved.version })).body)).toMatchObject({ status: "SUBMITTED", correction: null });

    // Reminders go to the people who haven't sent.
    expect((await api("acmeOwner").post(`${base()}/${collection.id}/remind`)).body).toEqual({ reminded: 1 });
    expect(bola.id && chidi.id).toBeTruthy();
  });
});

describe("closing and review (B2B-FR-053–055; Pen 133, 134)", () => {
  it("closing never starts production; NEEDS_REVIEW until issues are fixed or excluded; removed people leave the totals but stay in history", async () => {
    const { collection, secret } = await openCollection();
    const ada = await participant(secret, "Ada", { size: "M", personalization: "ADA" });
    const bola = await participant(secret, "Bola", { sizeUnsure: true });
    const chidi = await participant(secret, "Chidi", null);
    const orders = async () => (await db().select({ n: sql<number>`count(*)::int` }).from(schema.orders))[0]!.n + (await db().select({ n: sql<number>`count(*)::int` }).from(schema.quotes))[0]!.n;
    const before = await orders();

    const closed = collectionDashboardSchema.parse((await api("acmeOwner").post(`${base()}/${collection.id}/close`, { version: (await statusOf(collection.id)).version })).body);
    expect(closed.closedAt).not.toBeNull();
    expect((await statusOf(collection.id)).status).toBe("NEEDS_REVIEW");
    expect(await orders()).toBe(before);
    // Participants can't change anything once it's closed, and reminders stop.
    expect((await ada.phone.put(`/v1/participants/${ada.id}/answers`, { answers: { size: "L", sizeUnsure: false, personalization: null, quantity: null, colour: null, branchLocationId: null }, version: 99 })).body.context?.reason).toBe("COLLECTION_CLOSED");
    expect((await api("acmeOwner").post(`${base()}/${collection.id}/remind`)).body.context?.reason).toBe("NOT_OPEN");

    // Confirm Bola's size: still Chidi to deal with.
    let board = collectionDashboardSchema.parse((await act(collection.id, bola.id, "settle-size", { size: "L", version: versionOf(closed, bola.id) })).body);
    expect((await statusOf(collection.id)).status).toBe("NEEDS_REVIEW");
    // Leave Chidi out: ready to order. Put him back: needs review again.
    board = collectionDashboardSchema.parse((await act(collection.id, chidi.id, "exclude", { version: versionOf(board, chidi.id) })).body);
    expect((await statusOf(collection.id)).status).toBe("READY_TO_ORDER");
    board = collectionDashboardSchema.parse((await act(collection.id, chidi.id, "include", { version: versionOf(board, chidi.id) })).body);
    expect((await statusOf(collection.id)).status).toBe("NEEDS_REVIEW");

    // Remove Chidi: out of the totals for good, still in the list and the audit.
    board = collectionDashboardSchema.parse((await act(collection.id, chidi.id, "remove", { version: versionOf(board, chidi.id) })).body);
    expect((await statusOf(collection.id)).status).toBe("READY_TO_ORDER");
    expect(board.progress).toMatchObject({ total: 2, submitted: 2, removed: 1 });
    expect(board.sizes).toEqual([
      { size: "M", count: 1 },
      { size: "L", count: 1 },
    ]);
    expect(board.participants.find((row) => row.id === chidi.id)).toMatchObject({ status: "REMOVED", removedAt: expect.any(String) });
    expectHidden(await chidi.phone.get(`/v1/participants/${chidi.id}`));
    const audit = await db().select({ action: schema.auditLog.action }).from(schema.auditLog).where(eq(schema.auditLog.recordId, collection.id));
    expect(audit.map((row) => row.action)).toEqual(expect.arrayContaining(["collection.closed", "collection.needs_review", "collection.participant_size_settled", "collection.participant_excluded", "collection.participant_removed", "collection.ready"]));
    expect(await orders()).toBe(before);

    // Reopen needs a future deadline; then participants can change their answers again.
    const current = await statusOf(collection.id);
    expect((await api("acmeOwner").post(`${base()}/${collection.id}/reopen`, { deadline: new Date(Date.now() - 1000).toISOString(), version: current.version })).status).toBe(400);
    await api("acmeOwner").post(`${base()}/${collection.id}/reopen`, { deadline: new Date(Date.now() + 86_400_000).toISOString(), version: current.version });
    expect((await statusOf(collection.id)).status).toBe("OPEN");
    expect(participationSchema.parse((await ada.phone.get(`/v1/participants/${ada.id}`)).body).canEdit).toBe(true);
  });

  it("only people who manage the collection act; participants never see the dashboard", async () => {
    const { collection, secret } = await openCollection();
    const ada = await participant(secret, "Ada", { size: "M" });
    const board = await dashboard("acmeViewer", collection.id);
    expectForbidden(await api("acmeViewer").post(`${base()}/${collection.id}/participants/${ada.id}/remove`, { version: versionOf(board, ada.id) }), "MANAGE_COLLECTIONS");
    expectForbidden(await api("acmeViewer").post(`${base()}/${collection.id}/close`, { version: collection.version }), "MANAGE_COLLECTIONS");
    expect((await ada.phone.get(`${base()}/${collection.id}/dashboard`)).status).toBe(401);
  });
});
