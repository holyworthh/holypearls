import { configurationSchema, orderRequestSchema, type Store, storeOrderResultSchema, storeSchema, templateSchema } from "@holypearls/contracts";
import { and, eq, schema, sql } from "@holypearls/db";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { type Actors, as, expectForbidden, signInActors } from "../testing/actors.js";
import { createHarness, type Harness } from "../testing/harness.js";
import { allowancePeriod } from "./stores.js";

/*
 * T12-06b: Allowances (PRD-05 B2B-FR-084; Pen 32, 78 B–C). Done when: the
 * per-period reset works, and an over-limit request goes to approval.
 */

vi.setConfig({ testTimeout: 600_000 });

let harness: Harness;
let actors: Partial<Actors>;
let acme: string;
let lekki: string;
const db = () => harness.database.db;
const api = (key: keyof Actors) => as(harness, actors[key] ?? "");
const base = () => `/v1/organizations/${acme}`;

/** An approved roll-up banner template: a direct price for one, nothing to choose. */
async function bannerTemplate() {
  const draft = configurationSchema.parse((await api("acmeOwner").post("/v1/configurations", { productSlug: "roll-up-banner", choices: { size: "85-200-cm" }, quantity: 1 })).body);
  let template = templateSchema.parse((await api("acmeOwner").post(`${base()}/templates`, { name: `Lobby Banner ${crypto.randomUUID().slice(0, 4)}`, configurationId: draft.id, assetVersionIds: [], allLocations: true })).body);
  template = templateSchema.parse((await api("acmeOwner").post(`${base()}/templates/${template.id}/submit`, { version: template.version })).body);
  const staff = (await api("adminAda").get(`/v1/admin/templates/${template.id}`)).body as { version: number };
  await api("adminAda").post(`/v1/admin/templates/${template.id}/decision`, { decision: "APPROVE", note: null, version: staff.version });
  return template.id;
}

/** An open self-order store with the banner and this allowance. */
async function storeWith(templateId: string, allowance: Record<string, unknown>) {
  let shop = storeSchema.parse((await api("acmeOwner").post(`${base()}/stores`, { name: "ACME Team Store", mode: "SELF_ORDER" })).body);
  shop = storeSchema.parse((await api("acmeOwner").put(`${base()}/stores/${shop.id}`, { name: shop.name, mode: "SELF_ORDER", routing: "INDIVIDUAL", items: [{ templateId }], version: shop.version })).body);
  const updated = await api("acmeOwner").put(`${base()}/stores/${shop.id}/allowance`, { version: shop.version, ...allowance });
  expect(updated.status).toBe(200);
  shop = storeSchema.parse(updated.body);
  return storeSchema.parse((await api("acmeOwner").post(`${base()}/stores/${shop.id}/activate`, { version: shop.version })).body);
}

const view = async (id: string): Promise<Store> => storeSchema.parse((await api("acmeLekkiManager").get(`${base()}/stores/${id}`)).body);
const pick = async (shop: Store, templateId: string) => storeOrderResultSchema.parse((await api("acmeLekkiManager").post(`${base()}/stores/${shop.id}/picks`, { templateId, answers: { branchLocationId: lekki } })).body);
const at = (iso: string) => {
  harness.now.value = new Date(iso);
};

beforeAll(async () => {
  harness = await createHarness();
  actors = await signInActors(harness, ["acmeOwner", "acmeLekkiManager", "acmeApprover", "adminAda"]);
  const [organization] = await db().select().from(schema.organizations).where(sql`${schema.organizations.name} like 'ACME%'`);
  acme = organization!.id;
  const locations = await db().select().from(schema.locations).where(eq(schema.locations.organizationId, acme));
  lekki = locations.find((location) => location.name === "Lekki")!.id;
});

afterEach(() => {
  harness.now.value = null;
});

afterAll(async () => {
  await harness?.close();
});

describe("allowance periods", () => {
  it("start on the renewal day in Lagos time and step by the period", () => {
    // Yearly from 1 Jan: 23:30 UTC on 31 Dec is already 1 Jan in Lagos.
    expect(allowancePeriod("YEAR", "01-01", new Date("2026-12-31T22:59:00Z")).start).toBe("2026-01-01");
    expect(allowancePeriod("YEAR", "01-01", new Date("2026-12-31T23:30:00Z"))).toEqual({ start: "2027-01-01", next: new Date("2027-12-31T23:00:00Z") });
    // Quarterly from 15 April: quarters start 15 Jan, Apr, Jul and Oct.
    expect(allowancePeriod("QUARTER", "04-15", new Date("2027-03-20T12:00:00Z")).start).toBe("2027-01-15");
    expect(allowancePeriod("QUARTER", "04-15", new Date("2027-01-14T12:00:00Z")).start).toBe("2026-10-15");
    expect(allowancePeriod("QUARTER", "04-15", new Date("2027-01-15T12:00:00Z")).start).toBe("2027-01-15");
    // Monthly on the 28th.
    expect(allowancePeriod("MONTH", "01-28", new Date("2027-03-05T12:00:00Z"))).toEqual({ start: "2027-02-28", next: new Date("2027-03-27T23:00:00Z") });
  });
});

describe("allowances (B2B-FR-084)", () => {
  it("a per-period allowance is used by picks, goes to approval when over, gives back a declined request, and resets on the renewal day", async () => {
    const banner = await bannerTemplate();
    at("2026-12-20T10:00:00Z");
    const shop = await storeWith(banner, { kind: "PER_PERIOD", name: "Uniform allowance", amountMinor: "15000000", period: "YEAR", renewsOn: "01-01" });

    // Pen 32: "₦150,000 of ₦150,000 left · renews 1 Jan"; the banner is covered.
    let screen = await view(shop.id);
    expect(screen.allowance).toMatchObject({ kind: "PER_PERIOD", name: "Uniform allowance", amountMinor: "15000000", usedMinor: "0", remainingMinor: "15000000", renewsAt: "2026-12-31T23:00:00.000Z" });
    expect(screen.items[0]).toMatchObject({ covered: true, note: expect.stringMatching(/^Paid by ACME .* from your uniform allowance$/) });

    // Within the allowance the organization pays: HolyPearls quotes ACME, never the employee's own checkout.
    const first = await pick(shop, banner);
    expect(first).toMatchObject({ route: "QUOTE", message: expect.stringMatching(/^Paid from your uniform allowance\./) });
    const ledger = () => db().select().from(schema.allowanceLedger).where(eq(schema.allowanceLedger.storeId, shop.id));
    const [entry] = await ledger();
    expect(entry).toMatchObject({ periodStart: "2026-01-01" });
    const each = entry!.amountMinor;
    expect(each).toBeGreaterThan(0n);
    screen = await view(shop.id);
    expect(screen.allowance?.remainingMinor).toBe((15_000_000n - each).toString());

    // Picks until the next one won't fit, then the over-limit pick goes to an approver (Pen 78 C).
    const fits = Number(15_000_000n / each);
    for (let index = 1; index < fits; index++) expect((await pick(shop, banner)).route).toBe("QUOTE");
    const left = 15_000_000n - BigInt(fits) * each;
    screen = await view(shop.id);
    expect(screen.allowance?.remainingMinor).toBe(left.toString());
    expect(screen.items[0]!.covered).toBe(false);
    const over = await pick(shop, banner);
    expect(over).toMatchObject({ route: "APPROVAL", message: expect.stringMatching(/over your allowance, so it went to your manager to approve\.$/) });
    const requestId = over.next.split("/").pop()!;
    const request = orderRequestSchema.parse((await api("acmeLekkiManager").get(`${base()}/order-requests/${requestId}`)).body);
    expect(request).toMatchObject({ status: "PENDING_APPROVAL", locationId: lekki });
    expect(request.policyNote).toMatch(/^This order is ₦[\d,.]+ over Adaeze Eze \(TEST DATA\)'s uniform allowance \(₦[\d,.]+ left\)\./);
    expect((await view(shop.id)).allowance?.remainingMinor).toBe("0");

    // Declined: what it held comes back.
    const declined = await api("acmeApprover").post(`${base()}/order-requests/${requestId}/decision`, { decision: "DECLINE", amountMinor: null, note: "Not this year.", version: request.version });
    expect(declined.status).toBe(200);
    expect((await view(shop.id)).allowance?.remainingMinor).toBe(left.toString());

    // The renewal day (Lagos): a new period with the full amount; the old entries stay in last year's period.
    at("2026-12-31T22:59:00Z");
    expect((await view(shop.id)).allowance?.remainingMinor).toBe(left.toString());
    at("2026-12-31T23:30:00Z");
    screen = await view(shop.id);
    expect(screen.allowance).toMatchObject({ usedMinor: "0", remainingMinor: "15000000", renewsAt: "2027-12-31T23:00:00.000Z" });
    expect((await pick(shop, banner)).route).toBe("QUOTE");
    const entries = await ledger();
    expect(entries.filter((row) => row.periodStart === "2027-01-01")).toHaveLength(1);
    expect(entries.filter((row) => row.periodStart === "2026-01-01")).toHaveLength(fits + 1);
  });

  it("a per-order limit sends a pick above it to approval and keeps no balance", async () => {
    const banner = await bannerTemplate();
    const shop = await storeWith(banner, { kind: "PER_ORDER", name: "Uniform allowance", amountMinor: "100" });
    expect((await view(shop.id)).allowance).toMatchObject({ kind: "PER_ORDER", amountMinor: "100", remainingMinor: null, renewsAt: null });
    const over = await pick(shop, banner);
    expect(over.route).toBe("APPROVAL");
    const request = orderRequestSchema.parse((await api("acmeLekkiManager").get(`${base()}/order-requests/${over.next.split("/").pop()}`)).body);
    expect(request.policyNote).toMatch(/^This order is ₦[\d,.]+ over the ₦1 per-order uniform allowance\./);
    expect(await db().select().from(schema.allowanceLedger).where(eq(schema.allowanceLedger.storeId, shop.id))).toHaveLength(0);

    // With room under the limit it goes straight to HolyPearls for ACME to pay.
    const roomy = storeSchema.parse((await api("acmeOwner").get(`${base()}/stores/${shop.id}`)).body);
    await api("acmeOwner").put(`${base()}/stores/${shop.id}/allowance`, { kind: "PER_ORDER", name: "Uniform allowance", amountMinor: "100000000", version: roomy.version });
    expect((await pick(shop, banner)).route).toBe("QUOTE");
  });

  it("only people who manage stores set allowances; a per-period one needs its period", async () => {
    const banner = await bannerTemplate();
    const shop = await storeWith(banner, { kind: "NONE" });
    expect((await view(shop.id)).allowance).toBeNull();
    // Without an allowance, a direct price still goes to the employee's checkout as before (T12-06).
    expect((await pick(shop, banner)).route).toBe("CHECKOUT");
    const current = storeSchema.parse((await api("acmeOwner").get(`${base()}/stores/${shop.id}`)).body);
    expect(current.setup?.allowance).toEqual({ kind: "NONE", name: "Uniform allowance", amountMinor: null, period: null, renewsOn: null });
    expectForbidden(await api("acmeLekkiManager").put(`${base()}/stores/${shop.id}/allowance`, { kind: "PER_ORDER", amountMinor: "100", version: current.version }), "MANAGE_STORES");
    const missing = await api("acmeOwner").put(`${base()}/stores/${shop.id}/allowance`, { kind: "PER_PERIOD", amountMinor: "100", version: current.version });
    expect(missing.body.fieldErrors).toEqual({ period: "Choose how often it renews and from which day" });
    expect((await api("acmeOwner").put(`${base()}/stores/${shop.id}/allowance`, { kind: "PER_PERIOD", amountMinor: "100", period: "YEAR", renewsOn: "02-30", version: current.version })).status).toBe(400);
    const audit = await db().select().from(schema.auditLog).where(and(eq(schema.auditLog.recordId, shop.id), eq(schema.auditLog.action, "store.allowance_updated")));
    expect(audit).toHaveLength(1);
  });
});
