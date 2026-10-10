import { collectionSchema, configurationSchema, participationSchema } from "@holypearls/contracts";
import { desc, eq, schema, sql } from "@holypearls/db";
import { unseal } from "@holypearls/email";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { type Actors, as, expectHidden, signInActors } from "../testing/actors.js";
import { createHarness, type Harness, TEST_SEAL_KEY, TEST_WEB_ORIGIN } from "../testing/harness.js";

/*
 * T12-01b: the participant flow (PRD-05 B2B-FR-060–064; Pen 31, 76). Done
 * when: participants can't see each other; participants never see payment
 * screens (the organization always pays: owner decision 2026-10-10).
 */

vi.setConfig({ testTimeout: 300_000 });

let harness: Harness;
let actors: Partial<Actors>;
let acme: string;
let lekki: string;
let victoriaIsland: string;
const db = () => harness.database.db;
const api = (key: keyof Actors) => as(harness, actors[key] ?? "");
const base = () => `/v1/organizations/${acme}/collections`;

/** A browser with its own cookie jar, as a participant's phone. */
function browser(cookie = "") {
  const jar = new Map<string, string>();
  const send = (test: request.Test) => {
    test.set("origin", TEST_WEB_ORIGIN);
    const cookies = [cookie, ...jar.values()].filter(Boolean);
    if (cookies.length) test.set("cookie", cookies.join("; "));
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

/** An OPEN collection from a saved polo: size and name, delivered by branch (Lekki or Victoria Island). */
async function openCollection(options: { unsure?: "ALLOW_UNSURE" | "REQUIRE_SIZE"; branches?: boolean } = {}) {
  const polo = configurationSchema.parse((await api("acmeOwner").post("/v1/configurations", { productSlug: "polo-shirt", choices: { colour: "navy", fabric: "pique-cotton" } })).body);
  let collection = collectionSchema.parse((await api("acmeOwner").post(base(), { title: `Staff polos ${randomUUID().slice(0, 6)}`, locationId: lekki, configurationId: polo.id })).body);
  const branches = options.branches ?? true;
  collection = collectionSchema.parse(
    (
      await api("acmeOwner").put(`${base()}/${collection.id}`, {
        title: collection.title,
        fields: ["SIZE", "PERSONALIZATION"],
        deadline: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        deliveryMode: branches ? "BRANCHES" : "CENTRAL",
        centralLocationId: branches ? null : lekki,
        branchLocationIds: branches ? [lekki, victoriaIsland] : [],
        unsureSizeRule: options.unsure ?? "ALLOW_UNSURE",
        version: collection.version,
      })
    ).body,
  );
  collection = collectionSchema.parse((await api("acmeOwner").post(`${base()}/${collection.id}/open`, { version: collection.version })).body);
  return { collection, secret: collection.shareUrl!.split("#")[1]! };
}

async function join(secret: string, name: string, email = `${name.toLowerCase()}.${randomUUID().slice(0, 6)}@example.com`, cookie = "") {
  const phone = browser(cookie);
  const joined = await phone.post("/v1/collections/join", { secret, name, email });
  expect(joined.status).toBe(200);
  const id = (joined.body as { participantId: string }).participantId;
  const participation = participationSchema.parse((await phone.get(`/v1/participants/${id}`)).body);
  return { phone, id, participation, email };
}

const save = (participant: { phone: ReturnType<typeof browser>; id: string }, version: number, answers: Record<string, unknown>) =>
  participant.phone.put(`/v1/participants/${participant.id}/answers`, { answers: { size: null, sizeUnsure: false, personalization: null, quantity: null, colour: null, branchLocationId: null, ...answers }, version });

beforeAll(async () => {
  harness = await createHarness();
  actors = await signInActors(harness, ["acmeOwner", "customerChidi"]);
  const [organization] = await db().select().from(schema.organizations).where(sql`${schema.organizations.name} like 'ACME%'`);
  acme = organization!.id;
  const locations = await db().select().from(schema.locations).where(eq(schema.locations.organizationId, acme));
  lekki = locations.find((location) => location.name === "Lekki")!.id;
  victoriaIsland = locations.find((location) => location.name !== "Lekki")!.id;
});

afterAll(async () => {
  await harness?.close();
});

describe("participants (B2B-FR-060–064)", () => {
  it("participants can't see each other, and never see payment screens", async () => {
    const { collection, secret } = await openCollection();
    const adaeze = await join(secret, "Adaeze");
    const tunde = await join(secret, "Tunde");
    // Each sees their own submission only: the other's id is 404, and the organizer's API needs an account (401).
    expectHidden(await adaeze.phone.get(`/v1/participants/${tunde.id}`));
    expectHidden(await tunde.phone.get(`/v1/participants/${adaeze.id}`));
    expect((await adaeze.phone.get(`${base()}/${collection.id}`)).status).toBe(401);
    // What they see has no other people, no counts and nothing about payment.
    expect(Object.keys(adaeze.participation).sort()).toEqual(["answers", "canEdit", "collection", "colours", "correction", "name", "participantId", "sizes", "status", "version"]);
    expect(JSON.stringify(adaeze.participation)).not.toMatch(/pay|price|amount|Tunde/i);
    expect(adaeze.participation).toMatchObject({ status: "IN_PROGRESS", sizes: ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"], colours: [], collection: { fields: ["SIZE", "PERSONALIZATION"], deliveryMode: "BRANCHES" } });

    // Adaeze answers and sends; she gets a copy, and the organizer's count goes up.
    const saved = participationSchema.parse((await save(adaeze, adaeze.participation.version, { size: "M", personalization: "ADAEZE", branchLocationId: lekki })).body);
    const sent = participationSchema.parse((await adaeze.phone.post(`/v1/participants/${adaeze.id}/submit`, { version: saved.version })).body);
    expect(sent).toMatchObject({ status: "SUBMITTED", answers: { size: "M", personalization: "ADAEZE", branchLocationId: lekki } });
    const [copy] = await db().select().from(schema.notifications).where(sql`${schema.notifications.recipient} = ${adaeze.email} and ${schema.notifications.template} = 'collection_submitted'`);
    expect(copy).toBeDefined();
    expect(collectionSchema.parse((await api("acmeOwner").get(`${base()}/${collection.id}`)).body).submittedCount).toBe(1);
    // Tunde still sees only himself.
    expect(participationSchema.parse((await tunde.phone.get(`/v1/participants/${tunde.id}`)).body)).toMatchObject({ status: "IN_PROGRESS", answers: { size: null } });
  });

  it("only the fields the organizer allowed; sizes from the list; not sure only when allowed; branch from the approved ones", async () => {
    const { secret } = await openCollection({ unsure: "REQUIRE_SIZE" });
    const kemi = await join(secret, "Kemi");
    const v = kemi.participation.version;
    expect((await save(kemi, v, { colour: "red" })).body.fieldErrors).toEqual({ "answers.colour": "This collection doesn't ask for a colour." });
    expect((await save(kemi, v, { quantity: 3 })).body.fieldErrors).toEqual({ "answers.quantity": "This collection is one each." });
    expect((await save(kemi, v, { size: "XXXL" })).body.fieldErrors).toEqual({ "answers.size": "Choose one of the sizes." });
    expect((await save(kemi, v, { sizeUnsure: true })).body.fieldErrors).toEqual({ "answers.size": "Your organiser needs a size." });
    expect((await save(kemi, v, { size: "L", branchLocationId: randomUUID() })).body.fieldErrors).toEqual({ "answers.branchLocationId": "Choose one of the branches." });
    expect((await save(kemi, v, { personalization: "OLUWABUKOLAAA" })).status).toBe(400);
    // Sending needs a branch when delivery is by branch.
    const partial = participationSchema.parse((await save(kemi, v, { size: "L" })).body);
    expect((await kemi.phone.post(`/v1/participants/${kemi.id}/submit`, { version: partial.version })).body.fieldErrors).toEqual({ "answers.branchLocationId": "Choose your branch." });

    // Central delivery: no branch at all, and "not sure" when allowed.
    const central = await openCollection({ branches: false });
    const bola = await join(central.secret, "Bola");
    expect((await save(bola, bola.participation.version, { size: "M", branchLocationId: lekki })).body.fieldErrors).toEqual({ "answers.branchLocationId": "Everything is delivered together; there's no branch to choose." });
    const unsure = participationSchema.parse((await save(bola, bola.participation.version, { sizeUnsure: true })).body);
    expect((await bola.phone.post(`/v1/participants/${bola.id}/submit`, { version: unsure.version })).status).toBe(200);
  });

  it("paused and closed collections can't take answers; drafts and cancelled ones don't exist to the link", async () => {
    const { collection, secret } = await openCollection();
    const ife = await join(secret, "Ife");
    let current = collectionSchema.parse((await api("acmeOwner").post(`${base()}/${collection.id}/pause`, { version: collection.version })).body);
    expect((await save(ife, ife.participation.version, { size: "S" })).body.context?.reason).toBe("COLLECTION_PAUSED");
    expect((await browser().post("/v1/collections/join", { secret, name: "Late", email: "late@example.com" })).body.context?.reason).toBe("COLLECTION_PAUSED");
    current = collectionSchema.parse((await api("acmeOwner").post(`${base()}/${collection.id}/open`, { version: current.version })).body);
    // Past the deadline: read-only.
    await db().update(schema.groupCollections).set({ deadline: new Date(Date.now() - 60_000) }).where(eq(schema.groupCollections.id, collection.id));
    const closed = participationSchema.parse((await ife.phone.get(`/v1/participants/${ife.id}`)).body);
    expect(closed).toMatchObject({ canEdit: false, collection: { status: "CLOSED" } });
    expect((await save(ife, closed.version, { size: "S" })).body.context?.reason).toBe("COLLECTION_CLOSED");
    await db().update(schema.groupCollections).set({ deadline: new Date(Date.now() + 86_400_000) }).where(eq(schema.groupCollections.id, collection.id));
    await api("acmeOwner").post(`${base()}/${collection.id}/cancel`, { version: current.version });
    expectHidden(await browser().post("/v1/collections/join", { secret, name: "Gone", email: "gone@example.com" }));
    expectHidden(await ife.phone.get(`/v1/participants/${ife.id}`));
  });

  it("a participant comes back with their emailed link, or with the account they joined with", async () => {
    const { secret } = await openCollection();
    const chidi = await join(secret, "Chidi", undefined, actors.customerChidi!);
    // Signed in, the account sees its own participation.
    expect((await api("customerChidi").get(`/v1/participants/${chidi.id}`)).status).toBe(200);
    // The emailed link opens the same submission in a new browser.
    const [mail] = await db().select().from(schema.notifications).where(sql`${schema.notifications.recordId} = ${chidi.id} and ${schema.notifications.template} = 'guest_link'`).orderBy(desc(schema.notifications.createdAt)).limit(1);
    const { url } = unseal(mail!.sealedData!, TEST_SEAL_KEY) as { url: string };
    const laptop = browser();
    const redeemed = await laptop.post("/v1/guest-links/redeem", { secret: url.split("#")[1] });
    expect(redeemed.body).toMatchObject({ redirectTo: `/collections/submissions/${chidi.id}` });
    expect((await laptop.get(`/v1/participants/${chidi.id}`)).status).toBe(200);
    // Someone else's account can't open it.
    expectHidden(await api("acmeOwner").get(`/v1/participants/${chidi.id}`));
  });
});
