import { eq, schema, sql } from "@holypearls/db";
import { FakeGateway } from "@holypearls/testkit";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { reportAlert } from "../monitoring.js";
import { orderFlows } from "../testing/flows.js";
import { createHarness, type Harness } from "../testing/harness.js";
import { type Alert, checkAlerts, recordRequest, requestAlerts } from "./alerts.js";

/* T15-05: the TECH-07 §12 alert signals. */

vi.setConfig({ testTimeout: 300_000 });

let harness: Harness;
let gateway: FakeGateway;
const db = () => harness.database.db;
const signals = (alerts: Alert[], signal: Alert["signal"]) => alerts.filter((alert) => alert.signal === signal);

beforeAll(async () => {
  gateway = new FakeGateway();
  harness = await createHarness({ payments: gateway });
  await db().update(schema.paymentSettings).set({ onlinePayments: true }).where(eq(schema.paymentSettings.id, 1));
});

afterAll(async () => {
  await harness?.close();
});

describe("request alerts (A1, A2)", () => {
  const send = (count: number, at: number, status: (index: number) => number, ms: (index: number) => number) => {
    for (let index = 0; index < count; index += 1) recordRequest(status(index), ms(index), at);
  };

  it("needs 20 requests before the error rate counts, then alerts above 2%", () => {
    send(19, 1e12, () => 500, () => 50);
    expect(requestAlerts(1e12)).toEqual([]);
    send(100, 2e12, (index) => (index < 3 ? 500 : 200), () => 50);
    expect(requestAlerts(2e12).map((alert) => alert.signal)).toEqual(["API_ERROR_RATE"]);
  });

  it("alerts when the 95th percentile is over 1.5 seconds", () => {
    send(100, 3e12, () => 200, (index) => (index < 10 ? 3000 : 100));
    expect(requestAlerts(3e12).map((alert) => alert.signal)).toEqual(["API_LATENCY"]);
  });
});

describe("reportAlert", () => {
  it("sends one alert per signal and key an hour", () => {
    expect(reportAlert("TEST", "k", {}, 1000)).toBe(true);
    expect(reportAlert("TEST", "k", {}, 2000)).toBe(false);
    expect(reportAlert("TEST", "other", {}, 2000)).toBe(true);
    expect(reportAlert("TEST", "k", {}, 1000 + 3_600_001)).toBe(true);
  });
});

describe("alerts from the database (A4 to A9)", () => {
  it("email failures: five in an hour is fine, six alerts", async () => {
    const fail = () => db().insert(schema.notifications).values({ template: "test", recipient: "x@holypearls.test", status: "FAILED", maxAttempts: 1 });
    for (let index = 0; index < 5; index += 1) await fail();
    expect(signals(await checkAlerts(db(), new Date()), "EMAIL_FAILURES")).toHaveLength(0);
    await fail();
    expect(signals(await checkAlerts(db(), new Date()), "EMAIL_FAILURES")).toHaveLength(1);
  });

  it("file failures: more than ten needing review alerts", async () => {
    const add = () => {
      const id = randomUUID();
      return db().insert(schema.files).values({ purpose: "ARTWORK", status: "NEEDS_REVIEW", originalName: "a.png", safeName: "a.png", declaredType: "image/png", declaredSize: 1, storageKey: `alerts-test/${id}` });
    };
    for (let index = 0; index < 10; index += 1) await add();
    expect(signals(await checkAlerts(db(), new Date()), "FILE_FAILURES")).toHaveLength(0);
    await add();
    expect(signals(await checkAlerts(db(), new Date()), "FILE_FAILURES")).toHaveLength(1);
  });

  it("a new payment review alerts once per review; a silent Paystack alerts in business hours only", async () => {
    const flows = orderFlows(() => harness, () => gateway);
    await flows.paidOrder();
    const [attempt] = await db().select().from(schema.paymentAttempts).limit(1);
    const [review] = await db().insert(schema.paymentReviews).values({ intentId: attempt!.intentId, attemptId: attempt!.id, reason: "DUPLICATE_PAYMENT", details: {} }).returning();
    const opened = signals(await checkAlerts(db(), new Date()), "PAYMENT_REVIEW");
    expect(opened.map((alert) => alert.key)).toContain(review!.id);

    // Wednesday 10:00 in Lagos (09:00 UTC), an attempt an hour ago and no webhook ever.
    const startedAt = (now: Date) => db().update(schema.paymentAttempts).set({ createdAt: new Date(now.getTime() - 3_600_000) });
    const wednesday = new Date("2026-10-21T09:00:00Z");
    await startedAt(wednesday);
    expect(signals(await checkAlerts(db(), wednesday), "PAYSTACK_WEBHOOKS_SILENT")).toHaveLength(1);
    const sunday = new Date("2026-10-25T09:00:00Z");
    await startedAt(sunday);
    expect(signals(await checkAlerts(db(), sunday), "PAYSTACK_WEBHOOKS_SILENT")).toHaveLength(0);

    // A recent webhook keeps it quiet.
    await startedAt(wednesday);
    await db().insert(schema.paystackEvents).values({ eventKey: `evt-${randomUUID()}`, event: "charge.success", reference: "HPPAY-x", rawBody: "{}", receivedAt: new Date(wednesday.getTime() - 60_000) });
    expect(signals(await checkAlerts(db(), wednesday), "PAYSTACK_WEBHOOKS_SILENT")).toHaveLength(0);
    await db().update(schema.paymentAttempts).set({ createdAt: sql`now()` });
  });

  it("a job that has waited more than 15 minutes is a backlog", async () => {
    const id = await harness.jobs.send("search.refresh", { v: 1, requestId: "req_test" });
    expect(signals(await checkAlerts(db(), new Date()), "JOB_BACKLOG").map((alert) => alert.key)).not.toContain("search.refresh");
    await db().execute(sql`update pgboss.job set start_after = now() - interval '20 minutes' where id = ${id}`);
    expect(signals(await checkAlerts(db(), new Date()), "JOB_BACKLOG").map((alert) => alert.key)).toContain("search.refresh");
  });
});
