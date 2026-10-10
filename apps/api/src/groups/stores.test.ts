import { approvalPolicySchema, collectionSchema, configurationSchema, type Store, storeListSchema, storeOrderResultSchema, storeSchema, templateSchema } from "@holypearls/contracts";
import { and, eq, schema, sql } from "@holypearls/db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { type Actors, as, expectForbidden, expectHidden, signInActors } from "../testing/actors.js";
import { createHarness, type Harness } from "../testing/harness.js";

/*
 * T12-06: Company store (PRD-05 B2B-FR-080–083; Pen 32, 77, 78; Journeys
 * 9–10). Done when: the same employee screens create different records by
 * mode.
 */

vi.setConfig({ testTimeout: 600_000 });

let harness: Harness;
let actors: Partial<Actors>;
let acme: string;
let lekki: string;
let victoriaIsland: string;
const db = () => harness.database.db;
const api = (key: keyof Actors) => as(harness, actors[key] ?? "");
const base = () => `/v1/organizations/${acme}/stores`;

/** An approved template; for the polo, size and name are left to each person. */
async function approvedTemplate(product: "polo" | "cards", options: { locationIds?: string[] } = {}) {
  const draft = configurationSchema.parse(
    (
      await api("acmeOwner").post(
        "/v1/configurations",
        product === "polo" ? { productSlug: "polo-shirt", choices: { colour: "navy", fabric: "pique-cotton" }, quantity: 24 } : { productSlug: "business-cards", choices: { paper: "350gsm-matte", sides: "both-sides" }, quantity: 500 },
      )
    ).body,
  );
  let template = templateSchema.parse(
    (
      await api("acmeOwner").post(`/v1/organizations/${acme}/templates`, {
        name: `${product === "polo" ? "Staff Polo" : "Name Cards"} ${crypto.randomUUID().slice(0, 4)}`,
        configurationId: draft.id,
        assetVersionIds: [],
        allLocations: !options.locationIds,
        locationIds: options.locationIds ?? [],
      })
    ).body,
  );
  const open = new Set(["sizes", "personalization", "quantity"]);
  template = templateSchema.parse(
    (
      await api("acmeOwner").put(`/v1/organizations/${acme}/templates/${template.id}`, {
        name: template.name,
        fields: template.fields.map(({ key, control, reason }) => ({ key, control: open.has(key) ? "EDITABLE" : control, reason: open.has(key) ? "Chosen per person" : reason })),
        assetVersionIds: [],
        allLocations: template.allLocations,
        locationIds: template.locations.map((location) => location.id),
        version: template.version,
      })
    ).body,
  );
  template = templateSchema.parse((await api("acmeOwner").post(`/v1/organizations/${acme}/templates/${template.id}/submit`, { version: template.version })).body);
  const staff = (await api("adminAda").get(`/v1/admin/templates/${template.id}`)).body as { version: number };
  expect((await api("adminAda").post(`/v1/admin/templates/${template.id}/decision`, { decision: "APPROVE", note: null, version: staff.version })).status).toBe(200);
  return templateSchema.parse((await api("acmeOwner").get(`/v1/organizations/${acme}/templates/${template.id}`)).body);
}

async function store(id: string, person: keyof Actors = "acmeOwner") {
  return storeSchema.parse((await api(person).get(`${base()}/${id}`)).body);
}

/** A store with these items, opened. */
async function openStore(mode: "PROCUREMENT" | "SELF_ORDER", items: { templateId: string; collectionId?: string | null }[], routing: "INDIVIDUAL" | "COLLECTION" = "INDIVIDUAL") {
  let created = storeSchema.parse((await api("acmeOwner").post(base(), { name: "ACME Team Store", mode })).body);
  const updated = await api("acmeOwner").put(`${base()}/${created.id}`, { name: created.name, mode, routing, items, version: created.version });
  expect(updated.status).toBe(200);
  created = storeSchema.parse(updated.body);
  return storeSchema.parse((await api("acmeOwner").post(`${base()}/${created.id}/activate`, { version: created.version })).body);
}

async function setPolicy(body: { rule: string; thresholdMinor: string | null }) {
  const current = approvalPolicySchema.parse((await api("acmeOwner").get(`/v1/organizations/${acme}/approvals/policy`)).body);
  await api("acmeOwner").put(`/v1/organizations/${acme}/approvals/policy`, { ...body, requesterMembershipIds: [], separateRequesterApprover: true, version: current.version });
}

beforeAll(async () => {
  harness = await createHarness();
  actors = await signInActors(harness, ["acmeOwner", "acmeBuyer", "acmeLekkiManager", "acmeViewer", "adminAda"]);
  const [organization] = await db().select().from(schema.organizations).where(sql`${schema.organizations.name} like 'ACME%'`);
  acme = organization!.id;
  const locations = await db().select().from(schema.locations).where(eq(schema.locations.organizationId, acme));
  lekki = locations.find((location) => location.name === "Lekki")!.id;
  victoriaIsland = locations.find((location) => location.name !== "Lekki")!.id;
});

afterAll(async () => {
  await harness?.close();
});

describe("company store (B2B-FR-080–083)", () => {
  it("the same employee screens create different records by mode: an individual order, or a submission in the group collection", async () => {
    const polo = await approvedTemplate("polo");
    let shop = await openStore("SELF_ORDER", [{ templateId: polo.id }]);
    expect(shop).toMatchObject({ status: "ACTIVE", mode: "SELF_ORDER", setup: { routing: "INDIVIDUAL" } });

    // The employee's screen: the approved polo, what ACME set, and only size, name and branch to choose. No routing.
    const seen = async () => store(shop.id, "acmeLekkiManager");
    let screen: Store = await seen();
    expect(screen.setup).toBeNull();
    expect(screen.blocked).toBeNull();
    expect(screen.items).toHaveLength(1);
    expect(screen.items[0]).toMatchObject({ templateId: polo.id, fields: ["SIZE", "PERSONALIZATION"], branches: [{ id: lekki, name: "Lekki" }], unavailable: null, action: "Request this item" });
    expect(screen.items[0]!.locked).toContain("Navy");
    const pick = { templateId: polo.id, answers: { size: "M", personalization: "ADAEZE", branchLocationId: lekki } };

    // Individual routing (Journey 9): the pick is the employee's own order for their branch.
    const individual = storeOrderResultSchema.parse((await api("acmeLekkiManager").post(`${base()}/${shop.id}/picks`, pick)).body);
    expect(["CHECKOUT", "QUOTE"]).toContain(individual.route);
    const orders = await db().select().from(schema.templateOrders).where(and(eq(schema.templateOrders.templateId, polo.id), sql`${schema.templateOrders.snapshot}->'store'->>'storeId' = ${shop.id}`));
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ locationId: lekki, route: individual.route });
    const sizes = await db().select().from(schema.configurationSizes).where(eq(schema.configurationSizes.configurationId, orders[0]!.configurationId));
    expect(sizes.map(({ size, quantity }) => ({ size, quantity }))).toEqual([{ size: "M", quantity: 1 }]);
    const names = await db().select().from(schema.configurationPersonalizationRows).where(eq(schema.configurationPersonalizationRows.configurationId, orders[0]!.configurationId));
    expect(names.map((row) => row.name)).toEqual(["ADAEZE"]);
    const people = () => db().select().from(schema.participants).where(sql`${schema.participants.origin} like 'STORE:%' and ${schema.participants.userId} = (select id from users where email = 'adaeze.acme-manager@holypearls.test')`);
    expect(await people()).toHaveLength(0);
    // Only the choices the template leaves open (B2B-FR-083).
    expect((await api("acmeLekkiManager").post(`${base()}/${shop.id}/picks`, { ...pick, answers: { ...pick.answers, colour: "red" } })).status).toBe(400);
    expect((await api("acmeLekkiManager").post(`${base()}/${shop.id}/picks`, { ...pick, answers: { ...pick.answers, branchLocationId: null } })).body.fieldErrors).toEqual({ "answers.branchLocationId": "Choose your branch." });

    // The store is switched to the 2027 team order (Journey 10). Employees aren't told or asked.
    let collection = collectionSchema.parse((await api("acmeOwner").post(`/v1/organizations/${acme}/collections`, { title: "2027 team order", locationId: lekki, templateId: polo.id })).body);
    collection = collectionSchema.parse(
      (
        await api("acmeOwner").put(`/v1/organizations/${acme}/collections/${collection.id}`, {
          title: collection.title,
          fields: ["SIZE", "PERSONALIZATION"],
          deadline: new Date(Date.now() + 7 * 86_400_000).toISOString(),
          deliveryMode: "BRANCHES",
          centralLocationId: null,
          branchLocationIds: [lekki, victoriaIsland],
          unsureSizeRule: "REQUIRE_SIZE",
          version: collection.version,
        })
      ).body,
    );
    collection = collectionSchema.parse((await api("acmeOwner").post(`/v1/organizations/${acme}/collections/${collection.id}/open`, { version: collection.version })).body);
    shop = await store(shop.id);
    shop = storeSchema.parse((await api("acmeOwner").put(`${base()}/${shop.id}`, { name: shop.name, mode: "SELF_ORDER", routing: "COLLECTION", items: [{ templateId: polo.id, collectionId: collection.id }], version: shop.version })).body);

    // Same screen, same fields, the same request; only the words on the button say what happens.
    screen = await seen();
    expect(screen.items[0]).toMatchObject({ templateId: polo.id, fields: ["SIZE", "PERSONALIZATION"], unavailable: null, action: expect.stringMatching(/^Add to ACME .* team order$/) });
    expect(screen.items[0]!.note).toMatch(/^Joins 2027 team order, which closes .* · not a separate purchase$/);
    const joined = storeOrderResultSchema.parse((await api("acmeLekkiManager").post(`${base()}/${shop.id}/picks`, pick)).body);
    expect(joined).toMatchObject({ route: "COLLECTION", reference: null, message: "Added to 2027 team order. You'll get a copy by email." });

    // A participant submission in the collection, and no new order.
    let mine = await people();
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ collectionId: collection.id, status: "SUBMITTED", origin: "STORE:ACME Team Store" });
    expect(joined.next).toBe(`/collections/submissions/${mine[0]!.id}`);
    const [submission] = await db().select().from(schema.participantSubmissions).where(eq(schema.participantSubmissions.participantId, mine[0]!.id));
    expect(submission!.answers).toMatchObject({ size: "M", personalization: "ADAEZE", branchLocationId: lekki });
    expect(await db().select().from(schema.templateOrders).where(sql`${schema.templateOrders.snapshot}->'store'->>'storeId' = ${shop.id}`)).toHaveLength(1);
    // Picking again changes their answers; they're still one person in the collection.
    await api("acmeLekkiManager").post(`${base()}/${shop.id}/picks`, { ...pick, answers: { ...pick.answers, size: "L" } });
    mine = await people();
    expect(mine).toHaveLength(1);
    const [changed] = await db().select().from(schema.participantSubmissions).where(eq(schema.participantSubmissions.participantId, mine[0]!.id));
    expect(changed!.answers).toMatchObject({ size: "L" });
    // The participant gets their copy, and the employee can open their own answers.
    const copies = await db().select().from(schema.notifications).where(and(eq(schema.notifications.template, "collection_submitted"), eq(schema.notifications.recordId, mine[0]!.id)));
    expect(copies).toHaveLength(2);
    expect((await api("acmeLekkiManager").get(`/v1/participants/${mine[0]!.id}`)).status).toBe(200);

    // The collection's own rules still apply: once it closes, the item says so and picks are refused.
    collection = collectionSchema.parse((await api("acmeOwner").get(`/v1/organizations/${acme}/collections/${collection.id}`)).body);
    await api("acmeOwner").post(`/v1/organizations/${acme}/collections/${collection.id}/close`, { version: collection.version });
    expect((await seen()).items[0]!.unavailable).toBe("The team order has closed. If you still need one, ask your organiser.");
    expect((await api("acmeLekkiManager").post(`${base()}/${shop.id}/picks`, pick)).body.context).toMatchObject({ reason: "ITEM_UNAVAILABLE" });
  });

  it("procurement: several items for one location go together, as one order request over the approval rule", async () => {
    const [polo, cards] = [await approvedTemplate("polo"), await approvedTemplate("cards")];
    const shop = await openStore("PROCUREMENT", [{ templateId: polo.id }, { templateId: cards.id }]);
    const screen = await store(shop.id, "acmeLekkiManager");
    expect(screen.locations).toEqual([{ id: lekki, name: "Lekki" }]);
    expect(screen.items.map((item) => ({ name: item.name, fields: item.fields, action: item.action }))).toEqual([
      { name: polo.name, fields: [], action: "Add" },
      { name: cards.name, fields: [], action: "Add" },
    ]);
    const order = { locationId: lekki, lines: [{ templateId: polo.id, quantity: 24 }, { templateId: cards.id, quantity: 500 }] };

    await setPolicy({ rule: "ABOVE_AMOUNT", thresholdMinor: "100" });
    try {
      expect((await store(shop.id, "acmeLekkiManager")).approval).toEqual({ applies: "ABOVE_AMOUNT", thresholdMinor: "100" });
      const placed = storeOrderResultSchema.parse((await api("acmeLekkiManager").post(`${base()}/${shop.id}/orders`, order)).body);
      expect(placed).toMatchObject({ route: "APPROVAL", reference: null, message: "Sent for approval. Nothing is ordered until an approver says yes." });
      const requestId = placed.next.split("/").pop()!;
      const [request] = await db().select().from(schema.orderRequests).where(eq(schema.orderRequests.id, requestId));
      expect(request).toMatchObject({ status: "PENDING_APPROVAL", locationId: lekki, title: `ACME Team Store: ${polo.name} × 24, ${cards.name} × 500` });
      expect(request!.configurationIds).toHaveLength(2);
      const lines = await db().select().from(schema.templateOrders).where(sql`${schema.templateOrders.snapshot}->'store'->>'storeId' = ${shop.id}`);
      expect(lines.map((line) => line.route)).toEqual(["APPROVAL", "APPROVAL"]);
    } finally {
      await setPolicy({ rule: "NONE", thresholdMinor: null });
    }

    // Without the rule, they go on together: the cart when both have a direct price, otherwise one quote request.
    const direct = storeOrderResultSchema.parse((await api("acmeLekkiManager").post(`${base()}/${shop.id}/orders`, order)).body);
    expect(["CHECKOUT", "QUOTE"]).toContain(direct.route);
    // Only your locations, only the store's items, each once, and never in a self-order store.
    expectForbidden(await api("acmeLekkiManager").post(`${base()}/${shop.id}/orders`, { ...order, locationId: victoriaIsland }));
    expectHidden(await api("acmeLekkiManager").post(`${base()}/${shop.id}/orders`, { ...order, lines: [{ templateId: crypto.randomUUID(), quantity: 1 }] }));
    expect((await api("acmeLekkiManager").post(`${base()}/${shop.id}/orders`, { ...order, lines: [order.lines[0], order.lines[0]] })).status).toBe(400);
    expect((await api("acmeLekkiManager").post(`${base()}/${shop.id}/picks`, { templateId: polo.id, answers: { size: "M", branchLocationId: lekki } })).body.context).toMatchObject({ reason: "WRONG_MODE" });
  });

  it("only people who manage stores set them up; members see open stores and items for their locations", async () => {
    const polo = await approvedTemplate("polo");
    const viOnly = await approvedTemplate("cards", { locationIds: [victoriaIsland] });
    // Owners and Admins manage stores; others get 403 (TECH-03 §7).
    expectForbidden(await api("acmeLekkiManager").post(base(), { name: "My store", mode: "SELF_ORDER" }), "MANAGE_STORES");
    let shop = storeSchema.parse((await api("acmeOwner").post(base(), { name: "Draft store", mode: "SELF_ORDER" })).body);
    expectForbidden(await api("acmeBuyer").put(`${base()}/${shop.id}`, { name: "x", mode: "SELF_ORDER", routing: "INDIVIDUAL", items: [], version: shop.version }), "MANAGE_STORES");

    // A draft is the manager's alone; opening needs an item.
    expectHidden(await api("acmeLekkiManager").get(`${base()}/${shop.id}`));
    expect(storeListSchema.parse((await api("acmeLekkiManager").get(base())).body).stores.some((row) => row.id === shop.id)).toBe(false);
    expect((await api("acmeOwner").post(`${base()}/${shop.id}/activate`, { version: shop.version })).body.context).toMatchObject({ reason: "NO_ITEMS" });

    // Setup rules: approved templates only, collections made from the item's template, no collection routing for procurement.
    const put = (body: Record<string, unknown>) => api("acmeOwner").put(`${base()}/${shop.id}`, { name: shop.name, mode: "SELF_ORDER", routing: "INDIVIDUAL", items: [{ templateId: polo.id }], version: shop.version, ...body });
    const draftTemplate = templateSchema.parse(
      (await api("acmeOwner").post(`/v1/organizations/${acme}/templates`, { name: "Unapproved", configurationId: (await db().select().from(schema.templates).where(eq(schema.templates.id, polo.id)))[0]!.sourceConfigurationId, assetVersionIds: [], allLocations: true })).body,
    );
    expect((await put({ items: [{ templateId: draftTemplate.id }] })).body.fieldErrors).toEqual({ "items.0.templateId": "Only approved templates can go in a store." });
    expect((await put({ mode: "PROCUREMENT", routing: "COLLECTION" })).status).toBe(400);
    const cardsCollection = collectionSchema.parse((await api("acmeOwner").post(`/v1/organizations/${acme}/collections`, { title: "Cards", locationId: victoriaIsland, templateId: viOnly.id })).body);
    expect((await put({ routing: "COLLECTION", items: [{ templateId: polo.id, collectionId: cardsCollection.id }] })).body.fieldErrors).toEqual({ "items.0.collectionId": "Choose a group collection made from this template." });

    shop = storeSchema.parse((await put({ items: [{ templateId: polo.id }, { templateId: viOnly.id }] })).body);
    shop = storeSchema.parse((await api("acmeOwner").post(`${base()}/${shop.id}/activate`, { version: shop.version })).body);
    // Members see the open store, with only the items for their locations (frame 78 A).
    expect(storeListSchema.parse((await api("acmeLekkiManager").get(base())).body)).toMatchObject({ canManage: false });
    expect((await store(shop.id, "acmeLekkiManager")).items.map((item) => item.templateId)).toEqual([polo.id]);
    expect((await store(shop.id, "acmeBuyer")).items.map((item) => item.templateId)).toEqual([polo.id, viOnly.id]);
    expectHidden(await api("acmeLekkiManager").post(`${base()}/${shop.id}/picks`, { templateId: viOnly.id, answers: { branchLocationId: lekki } }));
    // A Viewer sees it but can't order (no "Create orders").
    expect((await store(shop.id, "acmeViewer")).blocked).toBe("Your role can't place orders here. Ask your workspace Admin.");
    expectForbidden(await api("acmeViewer").post(`${base()}/${shop.id}/picks`, { templateId: polo.id, answers: { size: "M", branchLocationId: lekki } }), "CREATE_REQUESTS");

    // Paused: still visible, nothing can be ordered. Archived: gone for members.
    shop = storeSchema.parse((await api("acmeOwner").post(`${base()}/${shop.id}/pause`, { version: shop.version })).body);
    expect((await store(shop.id, "acmeLekkiManager")).blocked).toBe("This store is paused. Try again later.");
    expect((await api("acmeLekkiManager").post(`${base()}/${shop.id}/picks`, { templateId: polo.id, answers: { size: "M", branchLocationId: lekki } })).body.context).toMatchObject({ reason: "STORE_NOT_OPEN" });
    shop = storeSchema.parse((await api("acmeOwner").post(`${base()}/${shop.id}/archive`, { version: shop.version })).body);
    expectHidden(await api("acmeLekkiManager").get(`${base()}/${shop.id}`));
    expect((await api("acmeOwner").post(`${base()}/${shop.id}/activate`, { version: shop.version })).body.context).toMatchObject({ reason: "WRONG_STATUS" });
    expectHidden(await api("acmeOwner").post(`${base()}/${shop.id}/reopen`, { version: shop.version }));
  });
});
