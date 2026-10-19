import { apiErrorSchema, exportDownloadSchema, exportItemSchema, exportListSchema } from "@holypearls/contracts";
import { and, desc, eq, schema, sql } from "@holypearls/db";
import { FakeGateway } from "@holypearls/testkit";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { as, expectHidden, signInActors, type Actors } from "../testing/actors.js";
import { orderFlows } from "../testing/flows.js";
import { createHarness, type Harness } from "../testing/harness.js";
import { expireExports, generateExport, markExportFailed, toCsv } from "./exports.js";

/*
 * T13-03b: exports (PRD-06 §19; TECH-07 §16; Pen 120). Done when:
 * personal-data export needs permission and MFA.
 */

vi.setConfig({ testTimeout: 300_000 });

let harness: Harness;
let gateway: FakeGateway;
let actors: Partial<Actors>;
const flows = orderFlows(
  () => harness,
  () => gateway,
);
const db = () => harness.database.db;
// Today in Lagos, the range every dated export below uses.
const today = new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
const staleMfa = () => db().execute(sql`update sessions set mfa_verified_at = now() - interval '16 minutes'`);
const freshMfa = () => db().execute(sql`update sessions set mfa_verified_at = now()`);
const ask = (person: keyof Actors, type: string, range: { from: string | null; to: string | null } = { from: today, to: today }) =>
  as(harness, actors[person]!).post("/v1/admin/exports", { type, ...range });
const build = async (id: string) => {
  expect(await generateExport({ db: db(), storage: harness.storage }, id)).toBe("ready");
  const [row] = await db().select().from(schema.exports).where(eq(schema.exports.id, id));
  return { row: row!, csv: (await harness.storage.read(row!.fileKey!)).toString("utf8") };
};
const audits = (action: string, id: string) => db().select().from(schema.auditLog).where(and(eq(schema.auditLog.action, action), eq(schema.auditLog.recordId, id))).orderBy(desc(schema.auditLog.occurredAt));

beforeAll(async () => {
  gateway = new FakeGateway();
  harness = await createHarness({ payments: gateway });
  await db().update(schema.paymentSettings).set({ onlinePayments: true }).where(eq(schema.paymentSettings.id, 1));
  actors = await signInActors(harness, ["adminAda", "adminTunde", "financeFolake", "customerChidi"]);
});

afterAll(async () => {
  await harness?.close();
});

describe("exports (PRD-06 §19)", () => {
  it("Done when: personal-data export needs permission and MFA", async () => {
    // Finance may export orders and payments, not customers.
    const denied = await ask("financeFolake", "CUSTOMERS");
    expect(denied.status).toBe(403);
    expect(apiErrorSchema.parse(denied.body)).toMatchObject({ code: "FORBIDDEN", context: { reason: "PERMISSION_REQUIRED", permission: "EXPORT_PERSONAL_DATA" } });
    expect((await ask("financeFolake", "PAYMENTS")).status).toBe(201);
    expect(exportListSchema.parse((await as(harness, actors.financeFolake!).get("/v1/admin/exports")).body).allowed).toEqual(["ORDERS", "PAYMENTS"]);
    // No export permission at all: no list. A customer never sees the route.
    expect((await as(harness, actors.adminTunde!).get("/v1/admin/exports")).status).toBe(403);
    expectHidden(await as(harness, actors.customerChidi!).get("/v1/admin/exports"));

    // With the permission but an old MFA check: personal data waits for a fresh one; other types don't.
    await staleMfa();
    const stale = await ask("adminAda", "CUSTOMERS");
    expect(stale.status).toBe(403);
    expect(apiErrorSchema.parse(stale.body).code).toBe("RECENT_MFA_REQUIRED");
    expect((await ask("adminAda", "ORDERS")).status).toBe(201);
    await freshMfa();

    const created = exportItemSchema.parse((await ask("adminAda", "CUSTOMERS")).body);
    expect(created).toMatchObject({ type: "CUSTOMERS", status: "GENERATING", requestedBy: "Ada Okafor (TEST DATA)", from: today, to: today });
    const [entry] = await audits("export.requested", created.id);
    expect(entry).toMatchObject({ permission: "EXPORT_PERSONAL_DATA", summary: `Export requested: Customers · ${today} to ${today} (personal data)` });
    expect(entry!.mfaVerifiedAt).not.toBeNull();
    // Finance never sees it in the list, and can't download it.
    expect(exportListSchema.parse((await as(harness, actors.financeFolake!).get("/v1/admin/exports")).body).items.map((item) => item.type)).not.toContain("CUSTOMERS");
    await build(created.id);
    expect((await as(harness, actors.financeFolake!).post(`/v1/admin/exports/${created.id}/download`)).status).toBe(403);
  });

  it("built by the worker into private storage; a 5-minute link; logged; neutralised formulas", async () => {
    const { orderId } = await flows.paidOrder();
    const [order] = await db().select().from(schema.orders).where(eq(schema.orders.id, orderId));
    const item = exportItemSchema.parse((await ask("adminAda", "ORDERS")).body);
    const { row, csv } = await build(item.id);
    expect(csv.startsWith("\uFEFFOrder,Placed,Currency,Goods,Delivery,VAT,Total,Items,Workspace order,Cancelled,Refund due\r\n")).toBe(true);
    expect(csv).toContain(`${order!.number},`);
    expect(row.rowCount).toBeGreaterThanOrEqual(1);
    // Contact details are personal data: never in the orders export.
    expect(csv).not.toContain("@example.com");

    const list = exportListSchema.parse((await as(harness, actors.adminAda!).get("/v1/admin/exports")).body);
    expect(list.items.find((entry) => entry.id === item.id)).toMatchObject({ status: "READY", rows: row.rowCount });
    const link = exportDownloadSchema.parse((await as(harness, actors.adminAda!).post(`/v1/admin/exports/${item.id}/download`)).body);
    expect(link.expiresInSeconds).toBe(300);
    // The local test storage signs a token carrying the key, file name and expiry.
    const token = JSON.parse(Buffer.from(link.url.split("/local-storage/")[1]!.split(".")[0]!, "base64url").toString("utf8")) as { fileName: string; expires: number };
    expect(token.fileName).toBe(`holypearls-orders-${today}-to-${today}.csv`);
    expect(token.expires - Date.now()).toBeLessThanOrEqual(300_000);
    expect(await audits("export.downloaded", item.id)).toHaveLength(1);

    // A name that starts a formula is kept as text (CSV injection).
    expect(toCsv([["=HYPERLINK(\"x\")", "a,b", "+1", "plain"]])).toBe(`"'=HYPERLINK(""x"")","a,b",'+1,plain\r\n`);

    // Payments and production follow the same range; the catalogue has none.
    for (const type of ["PAYMENTS", "PRODUCTION", "COLLECTION_TOTALS"]) {
      const built = await build(exportItemSchema.parse((await ask("adminAda", type)).body).id);
      expect(built.row.status).toBe("READY");
    }
    expect((await build(exportItemSchema.parse((await ask("adminAda", "PRODUCTION")).body).id)).csv).toContain(order!.number);
    const catalogue = exportItemSchema.parse((await ask("adminAda", "CATALOGUE", { from: null, to: null })).body);
    expect((await build(catalogue.id)).csv).toContain("Business Cards");
    // A dated type needs its dates, in order.
    expect((await ask("adminAda", "ORDERS", { from: null, to: null })).status).toBe(400);
    expect((await ask("adminAda", "ORDERS", { from: today, to: "2020-01-01" })).status).toBe(400);
  });

  it("expires after 24 hours; a failed export can be retried", async () => {
    const item = exportItemSchema.parse((await ask("adminAda", "PAYMENTS")).body);
    const { row } = await build(item.id);
    // Running the job again does nothing.
    expect(await generateExport({ db: db(), storage: harness.storage }, item.id)).toBe("skipped");

    // 24 hours on: listed as expired and no longer downloadable, even before the clean-up runs.
    expect(row.expiresAt!.getTime() - row.readyAt!.getTime()).toBe(24 * 3_600_000);
    await db().update(schema.exports).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.exports.id, item.id));
    expect(exportListSchema.parse((await as(harness, actors.adminAda!).get("/v1/admin/exports")).body).items.find((entry) => entry.id === item.id)?.status).toBe("EXPIRED");
    expect((await as(harness, actors.adminAda!).post(`/v1/admin/exports/${item.id}/download`)).status).toBe(422);
    expect(await expireExports({ db: db(), storage: harness.storage }, new Date())).toBeGreaterThanOrEqual(1);
    expect(await harness.storage.head(row.fileKey!)).toBeNull();
    const [gone] = await db().select().from(schema.exports).where(eq(schema.exports.id, item.id));
    expect(gone).toMatchObject({ status: "EXPIRED", fileKey: null });

    const failing = exportItemSchema.parse((await ask("adminAda", "ORDERS")).body);
    await markExportFailed(db(), failing.id);
    expect(exportListSchema.parse((await as(harness, actors.adminAda!).get("/v1/admin/exports")).body).items.find((entry) => entry.id === failing.id)).toMatchObject({
      status: "FAILED",
      failure: "We couldn't build this file. Try again.",
    });
    const retried = await as(harness, actors.adminAda!).post(`/v1/admin/exports/${failing.id}/retry`);
    expect(exportItemSchema.parse(retried.body).status).toBe("GENERATING");
    expect((await as(harness, actors.adminAda!).post(`/v1/admin/exports/${failing.id}/retry`)).status).toBe(409);
    expect(await audits("export.retried", failing.id)).toHaveLength(1);
  });
});
