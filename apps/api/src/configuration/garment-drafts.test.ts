import { configurationSchema, personalizationResultSchema } from "@holypearls/contracts";
import { eq, schema } from "@holypearls/db";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { as, signInActors, type Actors } from "../testing/actors.js";
import { createHarness, type Harness, TEST_WEB_ORIGIN } from "../testing/harness.js";

// Each test makes several priced saves against a hosted database.
vi.setConfig({ testTimeout: 180_000 });

let harness: Harness;
let actors: Partial<Actors>;
let chidi: string;

const draftOf = (body: unknown) => configurationSchema.parse((body as { draft?: unknown }).draft ?? body);
const patch = (id: string, body: object) => request(harness.url).patch(`/v1/configurations/${id}`).set("origin", TEST_WEB_ORIGIN).set("cookie", chidi).send(body);

async function newPolo() {
  const created = await as(harness, chidi).post("/v1/configurations", { productSlug: "polo-shirt", choices: { colour: "navy", fabric: "pique-cotton" } });
  expect(created.status).toBe(201);
  return configurationSchema.parse(created.body);
}

async function userId() {
  const [user] = await harness.database.db.select().from(schema.users).where(eq(schema.users.email, "chidi.customer@holypearls.test"));
  return user!.id;
}

beforeAll(async () => {
  harness = await createHarness();
  actors = await signInActors(harness, ["customerChidi"]);
  chidi = actors.customerChidi!;
});

afterAll(async () => {
  await harness?.close();
});

describe("garment sourcing and decoration (COM-FR-020–024)", () => {
  it("prices sizes as the quantity and marks customer-supplied garments final after inspection", async () => {
    let draft = await newPolo();
    expect(draft.garment).toMatchObject({ sourcing: null, sizes: [], placements: [] });
    draft = draftOf(
      (await patch(draft.id, { version: draft.version, sourcing: "SOURCE_CUSTOMIZE", decoration: "EMBROIDERY", sizes: [{ size: "M", quantity: 20 }, { size: "L", quantity: 30 }] })).body,
    );
    // 50 polos at ₦8,000 (tier from 50) = ₦400,000 + 7.5% VAT.
    expect(draft.price).toMatchObject({ state: "ESTIMATE_READY", quantity: 50, goodsMinor: "40000000", totalMinor: "43000000" });
    expect(draft.garment!.sizes).toEqual([{ size: "M", quantity: 20 }, { size: "L", quantity: 30 }]);

    draft = draftOf((await patch(draft.id, { version: draft.version, sourcing: "CUSTOMER_SUPPLIED", details: { suppliedItems: "50 navy polos, mixed sizes", receiveMethod: "DROP_OFF" } })).body);
    expect(draft.price!.reasons).toEqual(expect.arrayContaining([expect.objectContaining({ code: "FINAL_AFTER_INSPECTION", message: "Your garments: the price is final after we inspect them." })]));
    expect(draft.garment!.details).toMatchObject({ suppliedItems: "50 navy polos, mixed sizes", receiveMethod: "DROP_OFF" });

    draft = draftOf((await patch(draft.id, { version: draft.version, sourcing: "MAKE_FROM_SCRATCH", details: { sampleFirst: true } })).body);
    expect(draft.price!.state).toBe("QUOTE_REQUIRED");
    // Earlier details are kept when more are added.
    expect(draft.garment!.details).toMatchObject({ suppliedItems: "50 navy polos, mixed sizes", sampleFirst: true });
  });

  it("accepts unknown sizes with a total quantity", async () => {
    let draft = await newPolo();
    draft = draftOf((await patch(draft.id, { version: draft.version, sizesUnknown: true, quantity: 40 })).body);
    expect(draft.price).toMatchObject({ quantity: 40, valid: true });
    expect(draft.price!.reasons).toEqual(expect.arrayContaining([expect.objectContaining({ code: "SIZES_UNKNOWN" })]));
  });
});

describe("placements (COM-FR-025, 026)", () => {
  it("saves overlapping placements with a fix, and fixing one keeps the others", async () => {
    let draft = await newPolo();
    draft = draftOf(
      (
        await patch(draft.id, {
          version: draft.version,
          decoration: "EMBROIDERY",
          quantity: 20,
          placements: [
            { position: "LEFT_CHEST", size: "STANDARD", method: null, note: null },
            { position: "FULL_FRONT", size: "LARGE", method: "PRINT", note: null },
            { position: "RIGHT_SLEEVE", size: "SMALL", method: null, note: "Staff number" },
          ],
        })
      ).body,
    );
    expect(draft.garment!.conflicts).toEqual([expect.objectContaining({ positions: ["FULL_FRONT", "LEFT_CHEST"] })]);
    expect(draft.price!.reasons).toEqual(expect.arrayContaining([expect.objectContaining({ code: "EXTRA_PLACEMENTS" })]));

    draft = draftOf(
      (
        await patch(draft.id, {
          version: draft.version,
          placements: draft.garment!.placements.filter((placement) => placement.position !== "LEFT_CHEST"),
        })
      ).body,
    );
    expect(draft.garment!.conflicts).toEqual([]);
    expect(draft.garment!.placements.map((placement) => placement.position)).toEqual(["FULL_FRONT", "RIGHT_SLEEVE"]);
    expect(draft.garment!.placements[1]!.note).toBe("Staff number");
  });
});

describe("artwork (COM-FR-050, 051)", () => {
  it("allows send-later only where the product allows it", async () => {
    let draft = await newPolo();
    draft = draftOf((await patch(draft.id, { version: draft.version, artwork: "LATER" })).body);
    expect(draft.artwork).toBe("LATER");
    const [polo] = await harness.database.db.select().from(schema.products).where(eq(schema.products.slug, "polo-shirt"));
    await harness.database.db.update(schema.productRules).set({ artworkLater: false }).where(eq(schema.productRules.productId, polo!.id));
    try {
      const refused = await patch(draft.id, { version: draft.version, artwork: "LATER" });
      expect(refused.status).toBe(400);
      expect(refused.body.fieldErrors.artwork).toContain("isn't available");
      expect(draftOf((await as(harness, chidi).get(`/v1/configurations/${draft.id}`)).body).artworkLaterAllowed).toBe(false);
    } finally {
      await harness.database.db.update(schema.productRules).set({ artworkLater: true }).where(eq(schema.productRules.productId, polo!.id));
    }
  });

  it("warns about a low-resolution logo without blocking, and records the customer's choice", async () => {
    let draft = await newPolo();
    draft = draftOf((await patch(draft.id, { version: draft.version, placements: [{ position: "LEFT_CHEST", size: "STANDARD", method: null, note: null }], quantity: 20 })).body);
    const [file] = await harness.database.db
      .insert(schema.files)
      .values({ purpose: "ARTWORK", status: "READY", bucket: "private", originalName: "logo.png", safeName: "logo.png", declaredType: "image/png", detectedType: "image/png", declaredSize: 10, storageKey: "k1", uploadedByUserId: await userId(), metadata: { width: 600, height: 300 } })
      .returning();
    const attached = await as(harness, chidi).post(`/v1/configurations/${draft.id}/files`, { fileId: file!.id, role: "LOGO" });
    expect(attached.status).toBe(201);
    draft = configurationSchema.parse(attached.body);
    expect(draft.files[0]).toMatchObject({ role: "LOGO", lowResolution: { neededPixels: 1182, actualPixels: 600 }, lowResolutionAction: null });
    expect(draft.price!.valid).toBe(true);

    const chosen = configurationSchema.parse((await as(harness, chidi).post(`/v1/configurations/${draft.id}/files/${draft.files[0]!.id}/low-resolution`, { action: "CLEANUP" })).body);
    expect(chosen.files[0]!.lowResolutionAction).toBe("CLEANUP");

    const removed = await request(harness.url).delete(`/v1/configurations/${draft.id}/files/${draft.files[0]!.id}`).set("origin", TEST_WEB_ORIGIN).set("cookie", chidi);
    expect(configurationSchema.parse(removed.body).files).toEqual([]);
  });

  it("refuses someone else's file", async () => {
    const draft = await newPolo();
    const [file] = await harness.database.db
      .insert(schema.files)
      .values({ purpose: "ARTWORK", status: "READY", bucket: "private", originalName: "x.png", safeName: "x.png", declaredType: "image/png", declaredSize: 10, storageKey: "k2" })
      .returning();
    expect((await as(harness, chidi).post(`/v1/configurations/${draft.id}/files`, { fileId: file!.id, role: "ARTWORK" })).status).toBe(404);
  });
});

describe("personalization CSV (COM-FR-029)", () => {
  async function csvFile(content: string) {
    const key = `files/source/${crypto.randomUUID()}`;
    await harness.storage.write(key, Buffer.from(content), "text/csv");
    const [file] = await harness.database.db
      .insert(schema.files)
      .values({ purpose: "CSV_IMPORT", status: "READY", bucket: "private", originalName: "team.csv", safeName: "team.csv", declaredType: "text/csv", declaredSize: content.length, storageKey: key, uploadedByUserId: await userId() })
      .returning();
    return file!.id;
  }

  it("checks a 120-row file row by row and saves nothing until it's clean", async () => {
    const draft = await newPolo();
    const lines = ["name,number,department,size"];
    for (let index = 1; index <= 120; index += 1) lines.push(`Staff ${index},${index},Front of house,${index % 2 ? "M" : "L"}`);
    lines[30] = "Staff 30,thirty,Front of house,M";
    const bad = personalizationResultSchema.parse((await as(harness, chidi).post(`/v1/configurations/${draft.id}/personalization`, { fileId: await csvFile(lines.join("\n")) })).body);
    expect(bad).toMatchObject({ accepted: false, count: 120, errors: [{ row: 31, field: "number" }] });
    expect(draftOf((await as(harness, chidi).get(`/v1/configurations/${draft.id}`)).body).garment!.personalization.count).toBe(0);

    lines[30] = "Staff 30,30,Front of house,M";
    const good = personalizationResultSchema.parse((await as(harness, chidi).post(`/v1/configurations/${draft.id}/personalization`, { fileId: await csvFile(lines.join("\n")) })).body);
    expect(good).toEqual({ accepted: true, count: 120, errors: [] });
    const saved = draftOf((await as(harness, chidi).get(`/v1/configurations/${draft.id}`)).body);
    expect(saved.garment!.personalization.count).toBe(120);
    expect(saved.garment!.personalization.preview[0]).toEqual({ row: 1, name: "Staff 1", number: "1", department: "Front of house", size: "M" });
  });
});

describe("guest uploads", () => {
  it("gives an anonymous visitor a guest session for their draft when they save it by email", async () => {
    const created = await request(harness.url).post("/v1/configurations").set("origin", TEST_WEB_ORIGIN).send({ productSlug: "polo-shirt", choices: { colour: "navy" } });
    const device = (created.headers["set-cookie"] as unknown as string[]).map((cookie) => cookie.split(";")[0]).find((cookie) => cookie.startsWith("hp.device="))!;
    const emailed = await request(harness.url).post(`/v1/configurations/${created.body.id}/email`).set("origin", TEST_WEB_ORIGIN).set("cookie", device).send({ email: "team.lead@holypearls.test" });
    expect(emailed.status).toBe(200);
    const guest = (emailed.headers["set-cookie"] as unknown as string[]).find((cookie) => cookie.startsWith("hp.guest="));
    expect(guest).toBeDefined();
    const session = guest!.split(";")[0]!;
    expect((await as(harness, session).get(`/v1/configurations/${created.body.id}`)).status).toBe(200);
    // The guest can now start an artwork upload.
    const upload = await as(harness, session).post("/v1/files/uploads", { purpose: "ARTWORK", fileName: "logo.png", size: 1000, contentType: "image/png" });
    expect(upload.status).toBe(201);
  });
}, 180_000);
