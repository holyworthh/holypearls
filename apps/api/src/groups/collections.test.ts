import { collectionInviteSchema, collectionListSchema, collectionSchema, configurationSchema, templateSchema } from "@holypearls/contracts";
import { eq, schema, sql } from "@holypearls/db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { type Actors, as, expectForbidden, expectHidden, signInActors } from "../testing/actors.js";
import { createHarness, type Harness } from "../testing/harness.js";

/*
 * T12-01: group collection setup (PRD-05 B2B-FR-050–052, 060; Pen 132).
 * Done when: participants only get allowed fields.
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
const inFuture = (days = 14) => new Date(Date.now() + days * 86_400_000).toISOString();
const anonymous = () => as(harness, "");

/** An approved business-cards template; `lockQuantity` makes quantity company controlled. */
async function approvedTemplate(lockQuantity = false) {
  const draft = configurationSchema.parse((await api("acmeOwner").post("/v1/configurations", { productSlug: "business-cards", choices: { paper: "350gsm-matte", sides: "both-sides" }, quantity: 500 })).body);
  let template = templateSchema.parse((await api("acmeOwner").post(`/v1/organizations/${acme}/templates`, { name: `Cards ${crypto.randomUUID().slice(0, 6)}`, configurationId: draft.id, assetVersionIds: [], allLocations: true })).body);
  if (lockQuantity) {
    template = templateSchema.parse(
      (
        await api("acmeOwner").put(`/v1/organizations/${acme}/templates/${template.id}`, {
          name: template.name,
          fields: template.fields.map(({ key, control, reason }) => ({ key, control: key === "quantity" ? "LOCKED" : control, reason: key === "quantity" ? "500 per person" : reason })),
          assetVersionIds: [],
          allLocations: true,
          version: template.version,
        })
      ).body,
    );
  }
  template = templateSchema.parse((await api("acmeOwner").post(`/v1/organizations/${acme}/templates/${template.id}/submit`, { version: template.version })).body);
  const staff = (await api("adminAda").get(`/v1/admin/templates/${template.id}`)).body as { version: number };
  await api("adminAda").post(`/v1/admin/templates/${template.id}/decision`, { decision: "APPROVE", note: null, version: staff.version });
  return template.id;
}

const setup = (person: keyof Actors, collection: { id: string; version: number }, body: Record<string, unknown>) =>
  api(person).put(`${base()}/${collection.id}`, { title: "Lekki staff polos 2026", fields: [], deadline: inFuture(), deliveryMode: "CENTRAL", centralLocationId: lekki, branchLocationIds: [], unsureSizeRule: "ALLOW_UNSURE", version: collection.version, ...body });

const secretOf = (collection: { shareUrl: string | null }) => collection.shareUrl!.split("#")[1]!;

beforeAll(async () => {
  harness = await createHarness();
  actors = await signInActors(harness, ["acmeOwner", "acmeBuyer", "acmeLekkiManager", "acmeApprover", "acmeViewer", "customerChidi", "adminAda"]);
  const [organization] = await db().select().from(schema.organizations).where(sql`${schema.organizations.name} like 'ACME%'`);
  acme = organization!.id;
  const locations = await db().select().from(schema.locations).where(eq(schema.locations.organizationId, acme));
  lekki = locations.find((location) => location.name === "Lekki")!.id;
  victoriaIsland = locations.find((location) => location.name !== "Lekki")!.id;
});

afterAll(async () => {
  await harness?.close();
});

describe("setting up a collection (B2B-FR-050–052)", () => {
  it("participants only get allowed fields: a template's locked fields and fields the product lacks can't be offered", async () => {
    const templateId = await approvedTemplate(true);
    const created = collectionSchema.parse((await api("acmeLekkiManager").post(base(), { title: "Lekki cards", locationId: lekki, templateId })).body);
    expect(created).toMatchObject({ status: "DRAFT", source: { kind: "TEMPLATE", templateId }, fields: [], shareUrl: null, canManage: true });
    expect(created.availableFields).toEqual([
      { field: "SIZE", available: false, reason: "This product has no sizes" },
      { field: "PERSONALIZATION", available: false, reason: "This product has no personalisation" },
      { field: "QUANTITY", available: false, reason: "Quantity is locked by the template" },
      { field: "COLOUR", available: false, reason: "This product has no colour choice" },
    ]);
    const locked = await setup("acmeLekkiManager", created, { fields: ["QUANTITY"] });
    expect(locked.status).toBe(400);
    expect(locked.body.fieldErrors).toEqual({ fields: "Quantity is locked by the template" });
    expect((await setup("acmeLekkiManager", created, { fields: ["SIZE"] })).body.fieldErrors).toEqual({ fields: "This product has no sizes" });

    // Retired by the owner (2026-10-10): nothing goes to a home address (and participants never pay).
    expect((await setup("acmeLekkiManager", created, { deliveryMode: "HOME" })).status).toBe(400);

    // A garment design offers sizes, personalisation, quantity and colour; the organizer picks two.
    const polo = configurationSchema.parse((await api("acmeLekkiManager").post("/v1/configurations", { productSlug: "polo-shirt", choices: { colour: "navy", fabric: "pique-cotton" } })).body);
    let collection = collectionSchema.parse((await api("acmeLekkiManager").post(base(), { title: "Lekki staff polos 2026", locationId: lekki, configurationId: polo.id })).body);
    expect(collection.availableFields.every((item) => item.available)).toBe(true);
    expect(collection.fields).toEqual(["SIZE"]);
    collection = collectionSchema.parse((await setup("acmeLekkiManager", collection, { fields: ["SIZE", "PERSONALIZATION"] })).body);
    collection = collectionSchema.parse((await api("acmeLekkiManager").post(`${base()}/${collection.id}/open`, { version: collection.version })).body);
    expect(collection.status).toBe("OPEN");
    expect(collection.shareUrl).toMatch(/\/g#[\w-]{30,}$/);

    // The participant's view has exactly those fields, and nothing about the organization's records.
    const invite = collectionInviteSchema.parse((await anonymous().post("/v1/collections/invite", { secret: secretOf(collection) })).body);
    expect(invite).toMatchObject({ title: "Lekki staff polos 2026", status: "OPEN", fields: ["SIZE", "PERSONALIZATION"], deliveryMode: "CENTRAL", branches: [] });
    expect(Object.keys(invite).sort()).toEqual(["branches", "deadline", "deliveryMode", "fields", "organizationName", "productName", "status", "title", "unsureSizeRule"]);
  });

  it("opening needs a future deadline; paused shows as paused; drafts and cancelled collections don't exist to the link", async () => {
    const polo = configurationSchema.parse((await api("acmeOwner").post("/v1/configurations", { productSlug: "polo-shirt", choices: { colour: "navy", fabric: "pique-cotton" } })).body);
    let collection = collectionSchema.parse((await api("acmeOwner").post(base(), { title: "Branch polos", locationId: lekki, configurationId: polo.id })).body);
    collection = collectionSchema.parse((await setup("acmeOwner", collection, { deadline: new Date(Date.now() - 60_000).toISOString(), deliveryMode: "BRANCHES", centralLocationId: null, branchLocationIds: [lekki, victoriaIsland] })).body);
    const early = await api("acmeOwner").post(`${base()}/${collection.id}/open`, { version: collection.version });
    expect(early.status).toBe(400);
    expect(early.body.fieldErrors).toEqual({ deadline: "Choose a deadline in the future." });
    collection = collectionSchema.parse((await setup("acmeOwner", collection, { deadline: inFuture(), deliveryMode: "BRANCHES", centralLocationId: null, branchLocationIds: [lekki, victoriaIsland] })).body);
    collection = collectionSchema.parse((await api("acmeOwner").post(`${base()}/${collection.id}/open`, { version: collection.version })).body);
    const secret = secretOf(collection);
    expect(collectionInviteSchema.parse((await anonymous().post("/v1/collections/invite", { secret })).body)).toMatchObject({ deliveryMode: "BRANCHES", branches: [{ name: "Lekki" }, { name: expect.stringContaining("Victoria") }] });

    // Changes need a pause first.
    expect((await setup("acmeOwner", collection, { fields: ["SIZE"] })).body.context?.reason).toBe("NOT_EDITABLE");
    collection = collectionSchema.parse((await api("acmeOwner").post(`${base()}/${collection.id}/pause`, { version: collection.version })).body);
    expect(collectionInviteSchema.parse((await anonymous().post("/v1/collections/invite", { secret })).body).status).toBe("PAUSED");
    // Re-opening keeps the same link.
    collection = collectionSchema.parse((await api("acmeOwner").post(`${base()}/${collection.id}/open`, { version: collection.version })).body);
    expect(secretOf(collection)).toBe(secret);
    collection = collectionSchema.parse((await api("acmeOwner").post(`${base()}/${collection.id}/cancel`, { version: collection.version })).body);
    expect(collection.status).toBe("CANCELLED");
    expectHidden(await anonymous().post("/v1/collections/invite", { secret }));
    expectHidden(await anonymous().post("/v1/collections/invite", { secret: "x".repeat(32) }));
  });
});

describe("who can set up and see collections (TECH-03 §7, §17)", () => {
  it("needs Manage group collections for the location; the link is only for organizers", async () => {
    const polo = configurationSchema.parse((await api("acmeLekkiManager").post("/v1/configurations", { productSlug: "polo-shirt", choices: { colour: "navy", fabric: "pique-cotton" } })).body);
    expectForbidden(await api("acmeViewer").post(base(), { title: "Nope", locationId: lekki, configurationId: polo.id }), "MANAGE_COLLECTIONS");
    expectForbidden(await api("acmeApprover").post(base(), { title: "Nope", locationId: lekki, configurationId: polo.id }), "MANAGE_COLLECTIONS");
    // The Victoria Island Buyer can't start one for Lekki, nor use someone else's design.
    expectHidden(await api("acmeBuyer").post(base(), { title: "Nope", locationId: lekki, configurationId: polo.id }));
    expectHidden(await api("acmeBuyer").post(base(), { title: "Nope", locationId: victoriaIsland, configurationId: polo.id }));
    expectHidden(await api("customerChidi").get(base()));

    let collection = collectionSchema.parse((await api("acmeLekkiManager").post(base(), { title: "Lekki aprons", locationId: lekki, configurationId: polo.id })).body);
    collection = collectionSchema.parse((await setup("acmeLekkiManager", collection, {})).body);
    collection = collectionSchema.parse((await api("acmeLekkiManager").post(`${base()}/${collection.id}/open`, { version: collection.version })).body);
    // A Lekki viewer sees it read-only, without the link; the Victoria Island Buyer doesn't see it.
    const viewer = collectionSchema.parse((await api("acmeViewer").get(`${base()}/${collection.id}`)).body);
    expect(viewer).toMatchObject({ canManage: false, shareUrl: null });
    expectForbidden(await api("acmeViewer").post(`${base()}/${collection.id}/pause`, { version: collection.version }), "MANAGE_COLLECTIONS");
    expectHidden(await api("acmeBuyer").get(`${base()}/${collection.id}`));
    expect(collectionListSchema.parse((await api("acmeBuyer").get(base())).body).collections.map((row) => row.id)).not.toContain(collection.id);
    // Every change is audited.
    const audit = await db().select({ action: schema.auditLog.action }).from(schema.auditLog).where(eq(schema.auditLog.recordId, collection.id));
    expect(audit.map((row) => row.action)).toEqual(expect.arrayContaining(["collection.created", "collection.updated", "collection.opened"]));
  });
});
