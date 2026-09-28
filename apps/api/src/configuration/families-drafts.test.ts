import { configurationSchema, quoteRequestResultSchema } from "@holypearls/contracts";
import { eq, schema } from "@holypearls/db";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { as, signInActors } from "../testing/actors.js";
import { createHarness, type Harness, TEST_WEB_ORIGIN } from "../testing/harness.js";

/* T03-08: other product families, timing and destinations, Request Final Quote. */

vi.setConfig({ testTimeout: 180_000 });

let harness: Harness;
let chidi: string;
let amaka: string;

const CARDS = { paper: "350gsm-matte", sides: "one-side", finish: "none" };
const draftOf = (body: unknown) => configurationSchema.parse((body as { draft?: unknown }).draft ?? body);
const patch = (id: string, body: object, cookie = chidi) => request(harness.url).patch(`/v1/configurations/${id}`).set("origin", TEST_WEB_ORIGIN).set("cookie", cookie).send(body);
const ask = (id: string, body: object, cookie = chidi) => request(harness.url).post(`/v1/configurations/${id}/quote-request`).set("origin", TEST_WEB_ORIGIN).set("cookie", cookie).send(body);
const chidiContact = { email: "chidi.customer@holypearls.test", name: "Chidi" };

async function start(productSlug: string, choices: Record<string, string>, quantity: number) {
  const created = await as(harness, chidi).post("/v1/configurations", { productSlug, choices, quantity });
  expect(created.status).toBe(201);
  return configurationSchema.parse(created.body);
}

beforeAll(async () => {
  harness = await createHarness();
  // A Monday, so working-day sums are easy to read.
  harness.now.value = new Date("2026-10-05T09:00:00Z");
  const actors = await signInActors(harness, ["customerChidi", "customerAmaka"]);
  chidi = actors.customerChidi!;
  amaka = actors.customerAmaka!;
});

afterAll(async () => {
  await harness?.close();
});

describe("each seeded family configures to the right price state", () => {
  it("large format: standard is priced; a custom size or installation needs a quote, keeping every answer", async () => {
    let draft = await start("roll-up-banner", { size: "85-200-cm" }, 2);
    expect(draft.family).toBe("LARGE_FORMAT");
    expect(draft.price).toMatchObject({ state: "PRICE_READY", valid: true });

    draft = draftOf((await patch(draft.id, { version: draft.version, details: { sizeMode: "STANDARD", service: "DELIVERED", destination: "LAGOS" } })).body);
    expect(draft.price!.state).toBe("PRICE_READY");

    draft = draftOf((await patch(draft.id, { version: draft.version, details: { sizeMode: "CUSTOM", widthCm: 300, heightCm: 150 } })).body);
    expect(draft.price!.state).toBe("QUOTE_REQUIRED");
    expect(draft.price!.reasons).toEqual(expect.arrayContaining([expect.objectContaining({ code: "CUSTOM_SIZE" })]));
    // Switching to a quote keeps every choice (COM-FR-060).
    expect(draft.choices).toEqual({ size: "85-200-cm" });
    expect(draft.quantity).toBe(2);
    expect(draft.details).toMatchObject({ service: "DELIVERED", destination: "LAGOS", widthCm: 300, heightCm: 150 });

    draft = draftOf(
      (
        await patch(draft.id, {
          version: draft.version,
          details: { sizeMode: "STANDARD", service: "INSTALLATION", installSite: "Lekki office", installSurface: "Glass", installHeightM: 3, installAccess: "Ladder", installDate: "2026-10-20" },
        })
      ).body,
    );
    expect(draft.price!.reasons).toEqual(expect.arrayContaining([expect.objectContaining({ code: "INSTALLATION" })]));
    expect(draft.price!.state).toBe("QUOTE_REQUIRED");
  });

  it("packaging: standard is an estimate; custom needs a quote", async () => {
    let draft = await start("small-paper-bag", { handle: "twisted-paper" }, 500);
    expect(draft.price!.state).toBe("ESTIMATE_READY");
    draft = draftOf((await patch(draft.id, { version: draft.version, details: { packagingType: "CUSTOM", packagingSpec: "25 x 30 x 10 cm, rope handles" } })).body);
    expect(draft.price!.state).toBe("QUOTE_REQUIRED");
    expect(draft.price!.reasons).toEqual(expect.arrayContaining([expect.objectContaining({ code: "CUSTOM_PACKAGING" })]));
  });

  it("promotional: a catalogue item is priced; sourcing something similar needs a quote", async () => {
    let draft = await start("standard-mug", { colour: "white" }, 20);
    draft = draftOf((await patch(draft.id, { version: draft.version, details: { promoSource: "CATALOGUE" } })).body);
    expect(draft.price!.state).toBe("PRICE_READY");
    draft = draftOf((await patch(draft.id, { version: draft.version, details: { promoSource: "SOURCE_SIMILAR", similarItem: "Enamel camping mug" } })).body);
    expect(draft.price!.state).toBe("QUOTE_REQUIRED");
  });

  it("embroidery: on the customer's garments the price is final after inspection", async () => {
    let draft = await start("flat-embroidery", { placement: "left-chest" }, 20);
    expect(draft.price!.state).toBe("ESTIMATE_READY");
    draft = draftOf((await patch(draft.id, { version: draft.version, details: { garmentOwner: "CUSTOMER" } })).body);
    expect(draft.price!.reasons).toEqual(expect.arrayContaining([expect.objectContaining({ code: "FINAL_AFTER_INSPECTION" })]));
  });

  it("stickers, wall art and paper print stay priced; the team project starts a consultation", async () => {
    expect((await start("label-sticker", { finish: "gloss" }, 200)).price!.state).toBe("PRICE_READY");
    expect((await start("landscape-canvas", { size: "40-30-cm" }, 1)).price!.state).toBe("PRICE_READY");
    expect((await start("business-cards", CARDS, 100)).price!.state).toBe("PRICE_READY");
    // Consultation products start a project instead of a draft.
    const team = await as(harness, chidi).post("/v1/configurations", { productSlug: "team-staff-branding", quantity: 20 });
    expect(team.status).toBe(422);
    expect(team.body.context).toMatchObject({ reason: "CONSULTATION_PRODUCT" });
  });
});

describe("timing and destinations (COM-FR-070–072)", () => {
  it("shows production and transit separately, suggests rush for a tight date, and reviews an impossible one", async () => {
    let draft = await start("roll-up-banner", { size: "85-200-cm" }, 1);
    draft = draftOf((await patch(draft.id, { version: draft.version, details: { destination: "LAGOS", deadline: "2026-10-12" } })).body);
    expect(draft.timing).toMatchObject({ production: { min: 1, max: 4 }, transit: { min: 1, max: 2 }, verdict: "RUSH_NEEDED", suggestedRush: "RUSH" });

    draft = draftOf((await patch(draft.id, { version: draft.version, rush: "RUSH" })).body);
    expect(draft.timing.verdict).toBe("ON_TIME");
    expect(draft.price!.lines.map((line) => line.label)).toContain("Rush");

    draft = draftOf((await patch(draft.id, { version: draft.version, rush: "STANDARD", details: { deadline: "2026-10-06" } })).body);
    expect(draft.timing.verdict).toBe("REVIEW");
    expect(draft.price!.state).toBe("ESTIMATE_READY");
    expect(draft.price!.reasons).toEqual(expect.arrayContaining([expect.objectContaining({ code: "DEADLINE_REVIEW" })]));
  });

  it("an international address continues as a quote, with freight confirmed in it", async () => {
    let draft = await start("business-cards", CARDS, 100);
    draft = draftOf((await patch(draft.id, { version: draft.version, details: { destination: "INTERNATIONAL", country: "Ghana", city: "Accra" } })).body);
    expect(draft.price).toMatchObject({ state: "QUOTE_REQUIRED", valid: true });
    expect(draft.timing).toMatchObject({ transit: null, transitQuoted: true });
    expect(draft.choices).toEqual(CARDS);
  });
});

describe("Request Final Quote (COM-FR-061)", () => {
  it("creates a PENDING_REVIEW quote with every answer kept, and emails a link", async () => {
    let draft = await start("roll-up-banner", { size: "100-200-cm" }, 3);
    draft = draftOf(
      (await patch(draft.id, { version: draft.version, details: { sizeMode: "CUSTOM", widthCm: 250, heightCm: 200, service: "DELIVERED", destination: "NIGERIA", city: "Abuja" } })).body,
    );
    expect(draft.price!.state).toBe("QUOTE_REQUIRED");

    // Someone else can't request a quote for this design.
    expect((await ask(draft.id, { email: "amaka@example.com", name: "Amaka" }, amaka)).status).toBe(404);

    const response = await ask(draft.id, { ...chidiContact, phone: "+234 800 000 0000", note: "For our Abuja launch" });
    expect(response.status).toBe(200);
    const result = quoteRequestResultSchema.parse(response.body);
    expect(result.reference).toMatch(/^HP-Q-2026-\d{4}$/);

    const [quote] = await harness.database.db.select().from(schema.quotes).where(eq(schema.quotes.reference, result.reference));
    expect(quote).toMatchObject({ status: "PENDING_REVIEW", configurationId: draft.id });
    expect(quote!.requestSnapshot).toMatchObject({ choices: { size: "100-200-cm" }, quantity: 3, details: { widthCm: 250, city: "Abuja" }, price: { state: "QUOTE_REQUIRED" } });
    expect(quote!.contact).toMatchObject({ name: "Chidi", note: "For our Abuja launch" });

    const reopened = configurationSchema.parse((await as(harness, chidi).get(`/v1/configurations/${draft.id}`)).body);
    expect(reopened).toMatchObject({ status: "QUOTE_REQUESTED", quote: { reference: result.reference, status: "PENDING_REVIEW" }, choices: { size: "100-200-cm" }, quantity: 3 });

    const [email] = await harness.database.db.select().from(schema.notifications).where(eq(schema.notifications.recordId, draft.id));
    expect(email).toMatchObject({ template: "guest_link" });

    // Asking again returns the same quote; the design no longer changes.
    expect(quoteRequestResultSchema.parse((await ask(draft.id, chidiContact)).body).reference).toBe(result.reference);
    expect((await patch(draft.id, { version: reopened.version, quantity: 5 })).status).toBe(409);
  });

  it("works from an estimate too", async () => {
    const draft = await start("small-paper-bag", { handle: "twisted-paper" }, 300);
    expect(draft.price!.state).toBe("ESTIMATE_READY");
    expect((await ask(draft.id, chidiContact)).status).toBe(200);
  });

  it("refuses a design with a blocking answer", async () => {
    // Business cards below their minimum of 100 are blocked.
    const draft = await start("business-cards", CARDS, 50);
    expect(draft.price!.valid).toBe(false);
    expect((await ask(draft.id, chidiContact)).status).toBe(422);
  });
});
