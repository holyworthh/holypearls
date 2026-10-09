import { cartSchema, checkoutSchema, configurationSchema, templateOrderFormSchema, templateOrderResultSchema, templateSchema } from "@holypearls/contracts";
import { and, eq, schema, sql } from "@holypearls/db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { type Actors, as, expectForbidden, expectHidden, signInActors } from "../testing/actors.js";
import { createHarness, type Harness } from "../testing/harness.js";

/*
 * T11-01c: Order from a template (PRD-05 B2B-FR-033; Journey 8; frame 131).
 * Done when: the API rejects changes to locked fields.
 */

vi.setConfig({ testTimeout: 300_000 });

let harness: Harness;
let actors: Partial<Actors>;
let acme: string;
let lekki: string;
let vi_: string;
const db = () => harness.database.db;
const api = (key: keyof Actors) => as(harness, actors[key] ?? "");
const base = () => `/v1/organizations/${acme}`;

/** An approved business-cards template: paper locked, sides editable, quantity editable. */
async function approvedTemplate(options: { allLocations?: boolean; locationIds?: string[]; sidesEditable?: boolean } = {}) {
  const draft = configurationSchema.parse((await api("acmeOwner").post("/v1/configurations", { productSlug: "business-cards", choices: { paper: "350gsm-matte", sides: "both-sides" }, quantity: 500 })).body);
  let template = templateSchema.parse(
    (await api("acmeOwner").post(`${base()}/templates`, { name: `Cards ${crypto.randomUUID().slice(0, 6)}`, configurationId: draft.id, assetVersionIds: [], allLocations: options.allLocations ?? true, locationIds: options.locationIds ?? [] })).body,
  );
  if (options.sidesEditable !== false) {
    template = templateSchema.parse(
      (
        await api("acmeOwner").put(`${base()}/templates/${template.id}`, {
          name: template.name,
          fields: template.fields.map(({ key, control, reason }) => ({ key, control: key === "option:sides" ? "EDITABLE" : control, reason: key === "option:sides" ? "Single or double sided per order" : reason })),
          assetVersionIds: [],
          allLocations: template.allLocations,
          locationIds: template.locations.map((location) => location.id),
          version: template.version,
        })
      ).body,
    );
  }
  template = templateSchema.parse((await api("acmeOwner").post(`${base()}/templates/${template.id}/submit`, { version: template.version })).body);
  const staffView = (await api("adminAda").get(`/v1/admin/templates/${template.id}`)).body as { version: number };
  const decided = await api("adminAda").post(`/v1/admin/templates/${template.id}/decision`, { decision: "APPROVE", note: null, version: staffView.version });
  expect(decided.status).toBe(200);
  return templateSchema.parse((await api("acmeOwner").get(`${base()}/templates/${template.id}`)).body);
}

beforeAll(async () => {
  harness = await createHarness();
  actors = await signInActors(harness, ["acmeOwner", "acmeBuyer", "acmeLekkiManager", "acmeViewer", "customerChidi", "adminAda"]);
  const [organization] = await db().select().from(schema.organizations).where(sql`${schema.organizations.name} like 'ACME%'`);
  acme = organization!.id;
  const locations = await db().select().from(schema.locations).where(eq(schema.locations.organizationId, acme));
  lekki = locations.find((location) => location.name === "Lekki")!.id;
  vi_ = locations.find((location) => location.name !== "Lekki")!.id;
});

afterAll(async () => {
  await harness?.close();
});

describe("order from a template (B2B-FR-033)", () => {
  it("the API rejects changes to locked fields, on the template order and on the design afterwards", async () => {
    const template = await approvedTemplate();
    const order = (body: Record<string, unknown>) => api("acmeLekkiManager").post(`${base()}/templates/${template.id}/orders`, { quantity: 500, locationId: lekki, templateVersion: template.version, ...body });

    // Paper is locked by the company.
    const locked = await order({ choices: { paper: "350gsm-gloss" } });
    expect(locked.status).toBe(422);
    expect(locked.body.context).toMatchObject({ reason: "LOCKED_FIELD", field: "option:paper" });
    expect(locked.body.message).toBe("Paper is set by your company and can't be changed on this order.");
    // The price preview refuses it too, and an unknown field is a validation error.
    expect((await api("acmeLekkiManager").post(`${base()}/templates/${template.id}/price`, { choices: { paper: "350gsm-gloss" }, quantity: 500 })).body.context?.reason).toBe("LOCKED_FIELD");
    expect((await order({ choices: { colour: "red" } })).status).toBe(400);

    // Sides are editable: the order goes through, and only the editable fields can change on the design.
    const result = templateOrderResultSchema.parse((await order({ choices: { sides: "one-side" } })).body);
    const design = configurationSchema.parse((await api("acmeLekkiManager").get(`/v1/configurations/${result.configurationId}`)).body);
    expect(design.choices).toMatchObject({ paper: "350gsm-matte", sides: "one-side" });
    expect(design.fromTemplate).toMatchObject({ templateId: template.id, name: template.name });
    const patch = (body: Record<string, unknown>) => api("acmeLekkiManager").patch(`/v1/configurations/${design.id}`).send({ version: design.version, confirmRemovals: false, ...body });
    const viaDraft = await patch({ choices: { paper: "350gsm-gloss" } });
    expect(viaDraft.status).toBe(422);
    expect(viaDraft.body.context).toMatchObject({ reason: "LOCKED_FIELD", field: "option:paper" });
    expect((await patch({ rush: "RUSH" })).body.context?.reason).toBe("LOCKED_FIELD");
    expect((await patch({ quantity: 600 })).status).toBe(200);
  });

  it("a direct price goes to the cart and checks out placed for the template's location, with a saved copy", async () => {
    const template = await approvedTemplate();
    const form = templateOrderFormSchema.parse((await api("acmeLekkiManager").get(`${base()}/templates/${template.id}/order`)).body);
    expect(form).toMatchObject({ blocked: null, quantity: { editable: true, value: 500 }, locations: [{ id: lekki, name: "Lekki" }] });
    expect(form.choices.map((choice) => choice.key)).toEqual(["sides"]);
    const preview = (await api("acmeLekkiManager").post(`${base()}/templates/${template.id}/price`, { choices: {}, quantity: 500 })).body as { state: string; totalMinor: string };
    expect(preview.state).toBe("PRICE_READY");

    const result = templateOrderResultSchema.parse((await api("acmeLekkiManager").post(`${base()}/templates/${template.id}/orders`, { choices: {}, quantity: 500, locationId: lekki, templateVersion: template.version })).body);
    expect(result).toMatchObject({ route: "CHECKOUT", next: "/cart", reference: null });
    const cart = cartSchema.parse((await api("acmeLekkiManager").get("/v1/cart")).body);
    const item = cart.items.find((entry) => entry.configurationId === result.configurationId);
    expect(item?.editHref).toBe(`/workspace/${acme}/templates/${template.id}/order`);
    const checkout = checkoutSchema.parse((await api("acmeLekkiManager").post("/v1/checkouts", {})).body);
    expect(checkout.placedFor).toMatchObject({ organizationId: acme, locationId: lekki });

    const [saved] = await db().select().from(schema.templateOrders).where(eq(schema.templateOrders.configurationId, result.configurationId));
    expect(saved).toMatchObject({ templateId: template.id, locationId: lekki, route: "CHECKOUT" });
    expect(saved!.snapshot).toMatchObject({ schema: "template-order/v1", name: template.name, templateVersion: template.version });
    const audit = await db().select({ action: schema.auditLog.action }).from(schema.auditLog).where(and(eq(schema.auditLog.recordId, template.id), eq(schema.auditLog.action, "template.ordered")));
    expect(audit).toHaveLength(1);
    // Clean up the cart for the next test.
    await db().delete(schema.cartItems).where(eq(schema.cartItems.configurationId, result.configurationId));
  });

  it("anything that needs a person to price it becomes a quote for the location", async () => {
    const template = await approvedTemplate();
    const [product] = await db().select({ id: schema.products.id }).from(schema.products).where(eq(schema.products.slug, "business-cards"));
    await db().update(schema.productRules).set({ maxAutoQuantity: 1_000 }).where(eq(schema.productRules.productId, product!.id));
    try {
      const result = templateOrderResultSchema.parse((await api("acmeLekkiManager").post(`${base()}/templates/${template.id}/orders`, { choices: {}, quantity: 5_000, locationId: lekki, templateVersion: template.version })).body);
      expect(result).toMatchObject({ route: "QUOTE", reference: expect.stringMatching(/^HP-Q-/) });
      const [quote] = await db().select().from(schema.quotes).where(eq(schema.quotes.reference, result.reference!));
      expect(quote).toMatchObject({ organizationId: acme, locationId: lekki, configurationId: result.configurationId });
    } finally {
      await db().update(schema.productRules).set({ maxAutoQuantity: null }).where(eq(schema.productRules.productId, product!.id));
    }
  });

  it("only allowed locations, people who can place orders, and approved templates", async () => {
    const template = await approvedTemplate({ allLocations: false, locationIds: [lekki] });
    const body = { choices: {}, quantity: 500, locationId: lekki, templateVersion: template.version };
    // A Viewer can't place orders; the form says why.
    expect(templateOrderFormSchema.parse((await api("acmeViewer").get(`${base()}/templates/${template.id}/order`)).body).blocked).toBe("Your role can't place orders. Ask your workspace Admin.");
    expectForbidden(await api("acmeViewer").post(`${base()}/templates/${template.id}/orders`, body), "CREATE_REQUESTS");
    // The Owner sees every location but this template is for Lekki only.
    expect((await api("acmeOwner").post(`${base()}/templates/${template.id}/orders`, { ...body, locationId: vi_ })).body.context?.reason).toBe("LOCATION_NOT_ALLOWED");
    // A Buyer outside Lekki doesn't see the template at all; outsiders get 404.
    expectHidden(await api("acmeBuyer").get(`${base()}/templates/${template.id}/order`));
    expectHidden(await api("customerChidi").post(`${base()}/templates/${template.id}/orders`, body));
    // An older version of the template is refused.
    expect((await api("acmeLekkiManager").post(`${base()}/templates/${template.id}/orders`, { ...body, templateVersion: template.version - 1 })).status).toBe(409);
    // A blocked template can't be ordered.
    await db().update(schema.templates).set({ status: "NEEDS_REVIEW" }).where(eq(schema.templates.id, template.id));
    const blocked = await api("acmeLekkiManager").post(`${base()}/templates/${template.id}/orders`, body);
    expect(blocked.body.context?.reason).toBe("TEMPLATE_BLOCKED");
    expect(templateOrderFormSchema.parse((await api("acmeLekkiManager").get(`${base()}/templates/${template.id}/order`)).body).blocked).toMatch(/^Blocked — asset review required/);
  });
});
