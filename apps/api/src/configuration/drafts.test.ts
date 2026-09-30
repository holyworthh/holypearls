import { configurationSchema, publicProductSchema } from "@holypearls/contracts";
import { eq, schema } from "@holypearls/db";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, expectHidden, signInActors, type Actors } from "../testing/actors.js";
import { createHarness, type Harness, TEST_WEB_ORIGIN } from "../testing/harness.js";
import { conflictsAfterChange } from "./drafts.js";

let harness: Harness;
let actors: Partial<Actors>;

const deviceCookie = (response: request.Response) =>
  ((response.headers["set-cookie"] as unknown as string[] | undefined) ?? []).map((cookie) => cookie.split(";")[0]).find((cookie) => cookie.startsWith("hp.device="));

/** An anonymous browser: keeps its device cookie between calls. */
function browser() {
  let cookie = "";
  const send = (req: request.Test) => {
    req.set("origin", TEST_WEB_ORIGIN);
    if (cookie) req.set("cookie", cookie);
    return req.then((response) => {
      cookie = deviceCookie(response) ?? cookie;
      return response;
    });
  };
  return {
    post: (path: string, body: object) => send(request(harness.url).post(path).send(body)),
    patch: (path: string, body: object) => send(request(harness.url).patch(path).send(body)),
    get: (path: string) => send(request(harness.url).get(path)),
    cookie: () => cookie,
  };
}

beforeAll(async () => {
  harness = await createHarness();
  actors = await signInActors(harness, ["customerChidi", "customerAmaka"]);
});

afterAll(async () => {
  await harness?.close();
});

describe("keep compatible answers (COM-FR-011)", () => {
  const options = [
    { key: "paper", values: [{ key: "matte" }, { key: "gloss" }] },
    { key: "finish", values: [{ key: "none" }, { key: "foil" }] },
  ];
  const rules = [{ ifOption: "paper", ifValue: "gloss", thenOption: "finish", thenValues: ["foil"], effect: "NOT_ALLOWED", message: "No foil on gloss." }];

  it("keeps answers that still fit", () => {
    expect(conflictsAfterChange({ paper: "matte", finish: "none" }, { paper: "gloss" }, options, rules)).toEqual({ next: { paper: "gloss", finish: "none" }, conflicts: [], invalidChange: null });
  });

  it("lists a later answer that no longer fits", () => {
    const result = conflictsAfterChange({ paper: "matte", finish: "foil" }, { paper: "gloss" }, options, rules);
    expect(result.conflicts).toEqual([{ option: "finish", value: "foil", message: "No foil on gloss." }]);
    expect(result.next).toEqual({ paper: "gloss" });
  });

  it("refuses a new answer that isn't allowed with an earlier one", () => {
    expect(conflictsAfterChange({ paper: "gloss" }, { finish: "foil" }, options, rules).invalidChange).toMatchObject({ option: "finish" });
  });

  it("clears an answer when sent null, and refuses unknown values", () => {
    expect(conflictsAfterChange({ paper: "matte", finish: "none" }, { finish: null }, options, rules).next).toEqual({ paper: "matte" });
    expect(conflictsAfterChange({}, { paper: "cardboard" }, options, rules).invalidChange).toMatchObject({ option: "paper" });
  });
});

describe("configuration drafts (COM-FR-010–014)", () => {
  it("gives the product page its configurator: options, priced quantity presets and blocked pairs", async () => {
    const product = publicProductSchema.parse((await request(harness.url).get("/v1/catalogue/products/business-cards")).body);
    expect(product.configurator).toMatchObject({ moq: 100, currency: "NGN", leadDays: { min: 2, max: 5 } });
    expect(product.configurator!.quantityPresets.map((preset) => preset.quantity)).toEqual([100, 500, 1000]);
    // ₦150 per card at 100 including VAT = ₦161.25.
    expect(product.configurator!.quantityPresets[0]!.perUnitMinor).toBe("16125");
    expect(product.configurator!.blocked).toEqual([expect.objectContaining({ ifValue: "350gsm-gloss", thenValues: ["foil"] })]);
    const project = publicProductSchema.parse((await request(harness.url).get("/v1/catalogue/products/team-staff-branding")).body);
    expect(project.configurator).toBeNull();
  });

  it("autosaves an anonymous draft with a device cookie, prices it, and hides it from other browsers", async () => {
    const mine = browser();
    const created = await mine.post("/v1/configurations", { productSlug: "business-cards", choices: { paper: "350gsm-matte", sides: "both-sides" } });
    expect(created.status).toBe(201);
    expect(mine.cookie()).toMatch(/^hp\.device=/);
    let draft = configurationSchema.parse(created.body);
    expect(draft.price).toBeNull();

    draft = configurationSchema.parse((await mine.patch(`/v1/configurations/${draft.id}`, { version: draft.version, quantity: 250, step: "quantity" })).body.draft);
    expect(draft.price).toMatchObject({ state: "PRICE_READY", totalMinor: "4031250", perUnitMinor: "16125" });
    expect(draft.step).toBe("quantity");

    // A stale version is refused with the latest draft.
    const stale = await mine.patch(`/v1/configurations/${draft.id}`, { version: draft.version - 1, quantity: 500 });
    expect(stale.status).toBe(409);
    expect(stale.body.context.latest.quantity).toBe(250);

    const stranger = browser();
    expectHidden(await stranger.get(`/v1/configurations/${draft.id}`));
    expectHidden(await as(harness, actors.customerAmaka!).get(`/v1/configurations/${draft.id}`));
  });

  it("warns before removing later answers, and removes them once confirmed", async () => {
    const mine = browser();
    let draft = configurationSchema.parse(
      (await mine.post("/v1/configurations", { productSlug: "business-cards", choices: { paper: "350gsm-matte", sides: "one-side", finish: "foil" }, quantity: 100 })).body,
    );
    expect(draft.price?.totalMinor).toBe("2150000"); // ₦15,000 + ₦5,000 foil + 7.5% VAT

    const warned = await mine.patch(`/v1/configurations/${draft.id}`, { version: draft.version, choices: { paper: "350gsm-gloss" } });
    expect(warned.status).toBe(422);
    expect(warned.body.context).toMatchObject({ reason: "ANSWERS_CONFLICT", conflicts: [{ option: "finish", value: "foil" }] });

    const confirmed = await mine.patch(`/v1/configurations/${draft.id}`, { version: draft.version, choices: { paper: "350gsm-gloss" }, confirmRemovals: true });
    expect(confirmed.status).toBe(200);
    draft = configurationSchema.parse(confirmed.body.draft);
    expect(draft.choices).toEqual({ paper: "350gsm-gloss", sides: "one-side" });
    expect(confirmed.body.removed).toEqual([expect.objectContaining({ option: "finish" })]);

    // Choosing foil now is refused before Review (COM-FR-042).
    const blocked = await mine.patch(`/v1/configurations/${draft.id}`, { version: draft.version, choices: { finish: "foil" } });
    expect(blocked.status).toBe(400);
    expect(blocked.body.fieldErrors["choices.finish"]).toContain("Foil doesn't hold on gloss");

    // Keeping compatible answers: changing sides keeps the paper.
    const kept = configurationSchema.parse((await mine.patch(`/v1/configurations/${draft.id}`, { version: draft.version, choices: { sides: "both-sides" } })).body.draft);
    expect(kept.choices).toEqual({ paper: "350gsm-gloss", sides: "both-sides" });
  });

  it("belongs to the account that started it", async () => {
    const created = await as(harness, actors.customerChidi!).post("/v1/configurations", { productSlug: "standard-mug", choices: { colour: "white" }, quantity: 10 });
    expect(created.status).toBe(201);
    expect(created.headers["set-cookie"] ?? []).not.toEqual(expect.arrayContaining([expect.stringMatching(/^hp\.device=/)]));
    expect((await as(harness, actors.customerChidi!).get(`/v1/configurations/${created.body.id}`)).status).toBe(200);
    expectHidden(await as(harness, actors.customerAmaka!).get(`/v1/configurations/${created.body.id}`));
  });

  it("emails a guest a link that opens the draft on another device", async () => {
    const mine = browser();
    const draft = configurationSchema.parse((await mine.post("/v1/configurations", { productSlug: "label-sticker", choices: { finish: "gloss" }, quantity: 100 })).body);
    const emailed = await mine.post(`/v1/configurations/${draft.id}/email`, { email: "draft.guest@holypearls.test" });
    expect(emailed.status).toBe(200);
    expect(emailed.body.emailedTo).toBe("dr***@holypearls.test");

    const [link] = await harness.database.db.select().from(schema.guestLinks).where(eq(schema.guestLinks.targetId, draft.id));
    expect(link).toMatchObject({ purpose: "CONFIGURATION", targetType: "CONFIGURATION" });
    const [notification] = await harness.database.db.select().from(schema.notifications).where(eq(schema.notifications.recordId, draft.id));
    expect(notification).toMatchObject({ template: "guest_link", resendable: false });

    // The guest session the link opens can see this draft and no other.
    const [customer] = await harness.database.db.select().from(schema.customers).where(eq(schema.customers.emailNormalized, "draft.guest@holypearls.test"));
    const { startGuestSession } = await import("../identity/customers.js");
    const session = await startGuestSession(harness.database.db, link!, new Date());
    const guestCookie = `hp.guest=${session.token}`;
    expect((await as(harness, guestCookie).get(`/v1/configurations/${draft.id}`)).status).toBe(200);
    const other = configurationSchema.parse((await browser().post("/v1/configurations", { productSlug: "label-sticker", choices: { finish: "gloss" } })).body);
    expectHidden(await as(harness, guestCookie).get(`/v1/configurations/${other.id}`));
    expect(customer).toBeDefined();
  });

  it("refuses consultative and unpublished products", async () => {
    expect((await browser().post("/v1/configurations", { productSlug: "team-staff-branding" })).status).toBe(422);
    await harness.database.db.update(schema.products).set({ status: "DRAFT" }).where(eq(schema.products.slug, "roll-up-banner"));
    expect((await browser().post("/v1/configurations", { productSlug: "roll-up-banner" })).status).toBe(404);
  });
}, 180_000);
