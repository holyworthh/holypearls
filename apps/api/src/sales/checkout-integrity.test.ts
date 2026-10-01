import { TEST_PEOPLE } from "@holypearls/auth";
import { checkoutSchema, configurationSchema } from "@holypearls/contracts";
import { and, desc, eq, schema } from "@holypearls/db";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createHarness, type Harness, TEST_WEB_ORIGIN } from "../testing/harness.js";
import type { OrderableConfigurationSnapshotV1 } from "./snapshot.js";

/*
 * Review P1-05 (every change to a design closes its open checkout), P1-06 (the
 * checkout freezes everything needed to make and charge the order), P1-07 (an
 * old checkout closes even when nothing is ready any more), P2-01 (the contact
 * step is one transaction) and P2-04 (database rules for carts and checkouts).
 */

vi.setConfig({ testTimeout: 240_000 });

let harness: Harness;
let chidi: string;
let chidiId: string;

const send = (req: request.Test) => req.set("origin", TEST_WEB_ORIGIN).set("cookie", chidi);
const post = (path: string, body: object = {}) => send(request(harness.url).post(path).set("idempotency-key", `test_${randomUUID().replaceAll("-", "")}`).send(body));
const get = (path: string) => send(request(harness.url).get(path));
const put = (path: string, body: object) => send(request(harness.url).put(path).send(body));
const patch = (path: string, body: object) => send(request(harness.url).patch(path).send(body));
const del = (path: string) => send(request(harness.url).delete(path));

const draftOf = (body: unknown) => configurationSchema.parse((body as { draft?: unknown }).draft ?? body);
const db = () => harness.database.db;

/** Business cards in the cart, with an open checkout. */
async function cardsCheckout() {
  const created = configurationSchema.parse((await post("/v1/configurations", { productSlug: "business-cards", choices: { paper: "350gsm-matte", sides: "both-sides" } })).body);
  const cards = draftOf((await patch(`/v1/configurations/${created.id}`, { version: created.version, quantity: 250 })).body);
  expect((await post("/v1/cart/items", { configurationId: cards.id })).status).toBeLessThan(300);
  const checkout = checkoutSchema.parse((await post("/v1/checkouts")).body);
  return { cards, checkout };
}

async function readyFile(name = "logo.png") {
  const [file] = await db()
    .insert(schema.files)
    .values({ purpose: "ARTWORK", status: "READY", bucket: "private", originalName: name, safeName: name, declaredType: "image/png", detectedType: "image/png", declaredSize: 10, sizeBytes: 10, storageKey: `k-${randomUUID()}`, uploadedByUserId: chidiId, metadata: { width: 4000, height: 4000 } })
    .returning();
  return file!.id;
}

async function csvFile(rows: number, prefix = "Staff") {
  const lines = ["name,number,department,size", ...Array.from({ length: rows }, (_, index) => `${prefix} ${index + 1},${index + 1},Front of house,M`)];
  const key = `files/source/${randomUUID()}`;
  await harness.storage.write(key, Buffer.from(lines.join("\n")), "text/csv");
  const [file] = await db()
    .insert(schema.files)
    .values({ purpose: "CSV_IMPORT", status: "READY", bucket: "private", originalName: "team.csv", safeName: "team.csv", declaredType: "text/csv", declaredSize: 10, storageKey: key, uploadedByUserId: chidiId })
    .returning();
  return file!.id;
}

/**
 * Rules are insert-only and the newest one in effect wins, so a test's rule must
 * start just after the newest one, however quickly earlier tests ran (CI is fast),
 * and not in the future.
 */
async function after(latest: Date) {
  const at = Math.max(latest.getTime() + 1, Date.now() - 1000);
  while (Date.now() <= at) await new Promise((resolve) => setTimeout(resolve, 5));
  return new Date(at);
}
const currentRule = async (productId: string) =>
  (await db().select().from(schema.priceRules).where(eq(schema.priceRules.productId, productId)).orderBy(desc(schema.priceRules.effectiveFrom)).limit(1))[0]!;
const currentTax = async () => (await db().select().from(schema.taxSettings).orderBy(desc(schema.taxSettings.effectiveFrom)).limit(1))[0]!;

const statusOf = async (checkoutId: string) => (await db().select({ status: schema.checkouts.status }).from(schema.checkouts).where(eq(schema.checkouts.id, checkoutId)))[0]!.status;
/** One design's frozen item (the account's cart may hold others from earlier tests). */
const snapshotOf = async (checkoutId: string, configurationId: string) =>
  ((await db().select({ items: schema.checkouts.items }).from(schema.checkouts).where(eq(schema.checkouts.id, checkoutId)))[0]!.items as { snapshot: OrderableConfigurationSnapshotV1 }[])
    .map((item) => item.snapshot)
    .find((snapshot) => snapshot.configuration.id === configurationId)!;

beforeAll(async () => {
  harness = await createHarness();
  chidi = await harness.signInAs("customerChidi");
  chidiId = (await db().select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, TEST_PEOPLE.customerChidi.email)))[0]!.id;
});

afterAll(async () => {
  await harness?.close();
});

describe("every change to a design in the cart closes its open checkout (review P1-05)", () => {
  it("adding artwork, choosing a low-resolution fix and removing artwork each close it, and the next checkout has the new state", async () => {
    const { cards, checkout } = await cardsCheckout();
    const attached = configurationSchema.parse((await post(`/v1/configurations/${cards.id}/files`, { fileId: await readyFile(), role: "ARTWORK" })).body);
    expect(await statusOf(checkout.id)).toBe("ABANDONED");
    const withArtwork = checkoutSchema.parse((await post("/v1/checkouts")).body);
    expect((await snapshotOf(withArtwork.id, cards.id)).files).toHaveLength(1);

    await post(`/v1/configurations/${cards.id}/files/${attached.files[0]!.id}/low-resolution`, { action: "CLEANUP" });
    expect(await statusOf(withArtwork.id)).toBe("ABANDONED");
    const withChoice = checkoutSchema.parse((await post("/v1/checkouts")).body);
    expect((await snapshotOf(withChoice.id, cards.id)).files[0]!.lowResolutionAction).toBe("CLEANUP");

    expect((await del(`/v1/configurations/${cards.id}/files/${attached.files[0]!.id}`)).status).toBe(200);
    expect(await statusOf(withChoice.id)).toBe("ABANDONED");
    const withoutArtwork = checkoutSchema.parse((await post("/v1/checkouts")).body);
    expect((await snapshotOf(withoutArtwork.id, cards.id)).files).toEqual([]);
  });

  it("importing personalisation and changing a choice each close it", async () => {
    const { cards, checkout } = await cardsCheckout();
    expect((await post(`/v1/configurations/${cards.id}/personalization`, { fileId: await csvFile(3) })).body).toMatchObject({ accepted: true, count: 3 });
    expect(await statusOf(checkout.id)).toBe("ABANDONED");
    const named = checkoutSchema.parse((await post("/v1/checkouts")).body);
    expect((await snapshotOf(named.id, cards.id)).personalization).toHaveLength(3);

    const current = configurationSchema.parse((await get(`/v1/configurations/${cards.id}`)).body);
    const changed = await patch(`/v1/configurations/${cards.id}`, { version: current.version, choices: { paper: "350gsm-gloss" }, confirmRemovals: true });
    expect(changed.status, JSON.stringify(changed.body)).toBe(200);
    expect(await statusOf(named.id)).toBe("ABANDONED");
  });

  it("moving between steps doesn't close it", async () => {
    const { cards, checkout } = await cardsCheckout();
    const current = configurationSchema.parse((await get(`/v1/configurations/${cards.id}`)).body);
    expect((await patch(`/v1/configurations/${cards.id}`, { version: current.version, step: "review" })).status).toBe(200);
    expect(await statusOf(checkout.id)).toBe("OPEN");
  });
});

describe("the checkout freezes the whole item (review P1-06)", () => {
  it("records product, answers, files, personalisation, every price line, rule versions and VAT, and none of it changes later", async () => {
    const created = configurationSchema.parse((await post("/v1/configurations", { productSlug: "business-cards", choices: { paper: "350gsm-matte", sides: "both-sides" } })).body);
    let cards = draftOf((await patch(`/v1/configurations/${created.id}`, { version: created.version, quantity: 250 })).body);
    cards = configurationSchema.parse((await post(`/v1/configurations/${cards.id}/files`, { fileId: await readyFile("artwork.png"), role: "ARTWORK" })).body);
    await post(`/v1/configurations/${cards.id}/personalization`, { fileId: await csvFile(2) });
    await post("/v1/cart/items", { configurationId: cards.id });
    const checkout = checkoutSchema.parse((await post("/v1/checkouts")).body);
    const frozen = await snapshotOf(checkout.id, cards.id);
    expect(frozen).toMatchObject({
      schema: "orderable-configuration/v1",
      configuration: { id: cards.id },
      product: { slug: "business-cards", name: "Business Cards" },
      quantity: 250,
      files: [{ role: "ARTWORK", name: "artwork.png" }],
      personalization: [{ row: 1, name: "Staff 1" }, { row: 2, name: "Staff 2" }],
    });
    expect(frozen!.choices).toEqual(expect.arrayContaining([expect.objectContaining({ option: "paper", value: "350gsm-matte" })]));
    expect(frozen!.price.lines.length).toBeGreaterThan(0);
    expect(frozen!.price.ruleVersions.priceRuleId).toBeTruthy();
    expect(frozen!.tax.vatRateBps).toBeGreaterThan(0);
    const before = JSON.stringify((await db().select({ items: schema.checkouts.items }).from(schema.checkouts).where(eq(schema.checkouts.id, checkout.id)))[0]!.items);

    // Change everything around it: the catalogue, prices, VAT and the design itself.
    const [product] = await db().select().from(schema.products).where(eq(schema.products.slug, "business-cards"));
    const rule = await currentRule(product!.id);
    const copy: Omit<typeof rule, "id" | "createdAt"> & { id?: string; createdAt?: Date } = { ...rule };
    delete copy.id;
    delete copy.createdAt;
    const tax = await currentTax();
    const [paper] = await db().select().from(schema.productOptionValues).where(eq(schema.productOptionValues.key, "350gsm-matte"));
    await db().update(schema.products).set({ name: "Renamed Cards" }).where(eq(schema.products.id, product!.id));
    const [doubled] = await db().insert(schema.priceRules).values({ ...copy, effectiveFrom: await after(rule.effectiveFrom), baseMinor: rule.baseMinor * 2n, tiers: [] }).returning();
    const [vat] = await db().insert(schema.taxSettings).values({ effectiveFrom: await after(tax.effectiveFrom), vatRateBps: 1000, vatOnDelivery: true }).returning();
    try {
      await db().update(schema.productOptionValues).set({ label: "Relabelled" }).where(eq(schema.productOptionValues.key, "350gsm-matte"));
      const current = configurationSchema.parse((await get(`/v1/configurations/${cards.id}`)).body);
      await patch(`/v1/configurations/${cards.id}`, { version: current.version, quantity: 500 });
      await post(`/v1/configurations/${cards.id}/personalization`, { fileId: await csvFile(4, "Other") });
      await del(`/v1/configurations/${cards.id}/files/${cards.files[0]!.id}`);

      const after = JSON.stringify((await db().select({ items: schema.checkouts.items }).from(schema.checkouts).where(eq(schema.checkouts.id, checkout.id)))[0]!.items);
      expect(after).toBe(before);
      expect(await statusOf(checkout.id)).toBe("ABANDONED");
    } finally {
      await db().update(schema.products).set({ name: product!.name }).where(eq(schema.products.id, product!.id));
      await db().insert(schema.priceRules).values({ ...copy, effectiveFrom: await after(doubled!.effectiveFrom) });
      await db().insert(schema.taxSettings).values({ effectiveFrom: await after(vat!.effectiveFrom), vatRateBps: tax.vatRateBps, vatOnDelivery: tax.vatOnDelivery });
      await db().update(schema.productOptionValues).set({ label: paper!.label }).where(eq(schema.productOptionValues.key, "350gsm-matte"));
    }
  });
});

describe("an old checkout closes even when nothing is ready any more (review P1-07)", () => {
  it("abandons it, moves the item to the quote group and leaves no open checkout", async () => {
    const { cards, checkout } = await cardsCheckout();
    // A day later, the price needs a review: the product's newest rule is an estimate.
    await db().update(schema.checkouts).set({ createdAt: new Date(Date.now() - 2 * 86_400_000) }).where(eq(schema.checkouts.id, checkout.id));
    const [product] = await db().select().from(schema.products).where(eq(schema.products.slug, "business-cards"));
    const rule = await currentRule(product!.id);
    const copy: Omit<typeof rule, "id" | "createdAt"> & { id?: string; createdAt?: Date } = { ...rule };
    delete copy.id;
    delete copy.createdAt;
    const [estimate] = await db().insert(schema.priceRules).values({ ...copy, effectiveFrom: await after(rule.effectiveFrom), state: "ESTIMATE_READY" }).returning();
    try {
      const refused = await post("/v1/checkouts");
      expect(refused.status).toBe(422);
      expect(refused.body.context.reason).toBe("NOTHING_READY");
      expect(await statusOf(checkout.id)).toBe("ABANDONED");
      const [item] = await db().select().from(schema.cartItems).where(eq(schema.cartItems.configurationId, cards.id));
      expect(item!.group).toBe("QUOTE");
      const [cart] = await db().select().from(schema.carts).where(eq(schema.carts.ownerUserId, chidiId));
      expect(await db().select().from(schema.checkouts).where(and(eq(schema.checkouts.cartId, cart!.id), eq(schema.checkouts.status, "OPEN")))).toHaveLength(0);
    } finally {
      await db().insert(schema.priceRules).values({ ...copy, effectiveFrom: await after(estimate!.effectiveFrom) });
      // Leave the cart empty for the other tests.
      await db().delete(schema.cartItems).where(eq(schema.cartItems.configurationId, cards.id));
      await db().update(schema.configurations).set({ status: "DRAFT" }).where(eq(schema.configurations.id, cards.id));
    }
  });
});

describe("the contact step is one transaction (review P2-01)", () => {
  it("a stale version with a never-seen email leaves no customer record and no change", async () => {
    const { checkout } = await cardsCheckout();
    const stale = await put(`/v1/checkouts/${checkout.id}/contact`, { name: "New Person", email: "never.seen@example.com", phone: "0800 000 0000", version: checkout.version - 1 });
    expect(stale.status).toBe(409);
    expect(await db().select().from(schema.customers).where(eq(schema.customers.emailNormalized, "never.seen@example.com"))).toHaveLength(0);
    const [row] = await db().select().from(schema.checkouts).where(eq(schema.checkouts.id, checkout.id));
    expect(row!.contact).toBeNull();
    expect(row!.version).toBe(checkout.version);
  });
});

describe("database rules for carts and checkouts (review P2-04)", () => {
  it("refuses a cart with no owner or two, a checkout step or currency that doesn't exist, and an unknown VAT setting", async () => {
    await expect(db().insert(schema.carts).values({})).rejects.toThrow();
    await expect(db().insert(schema.carts).values({ ownerUserId: chidiId, ownerDeviceHash: "device" })).rejects.toThrow();
    const { checkout } = await cardsCheckout();
    await expect(db().update(schema.checkouts).set({ step: "payment" }).where(eq(schema.checkouts.id, checkout.id))).rejects.toThrow();
    await expect(db().update(schema.checkouts).set({ currency: "XYZ" }).where(eq(schema.checkouts.id, checkout.id))).rejects.toThrow();
    await expect(db().update(schema.checkouts).set({ taxSettingId: randomUUID() }).where(eq(schema.checkouts.id, checkout.id))).rejects.toThrow();
    await expect(db().update(schema.checkouts).set({ ownerUserId: null, ownerDeviceHash: null }).where(eq(schema.checkouts.id, checkout.id))).rejects.toThrow();
  });
});
