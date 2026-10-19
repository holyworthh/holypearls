import { adminQuoteListSchema, adminRequestListSchema, opsHomeSchema, productionBoardSchema } from "@holypearls/contracts";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { as, expectHidden, signInActors, type Actors } from "../testing/actors.js";
import { orderFlows } from "../testing/flows.js";
import { createHarness, type Harness } from "../testing/harness.js";
import { FakeGateway } from "@holypearls/testkit";
import { eq, schema } from "@holypearls/db";

/*
 * T13-03: operations home (PRD-06 §17; Pen 95). Done when: each queue opens
 * its filtered list.
 */

vi.setConfig({ testTimeout: 300_000 });

let harness: Harness;
let gateway: FakeGateway;
let actors: Partial<Actors>;
const flows = orderFlows(
  () => harness,
  () => gateway,
);
const home = async (person: keyof Actors) => opsHomeSchema.parse((await as(harness, actors[person]!).get("/v1/admin/home")).body);

beforeAll(async () => {
  gateway = new FakeGateway();
  harness = await createHarness({ payments: gateway });
  await harness.database.db.update(schema.paymentSettings).set({ onlinePayments: true }).where(eq(schema.paymentSettings.id, 1));
  actors = await signInActors(harness, ["adminAda", "adminTunde", "financeFolake", "customerChidi"]);
});

afterAll(async () => {
  await harness?.close();
});

describe("operations home (PRD-06 §17)", () => {
  it("each queue's count is the list it opens", async () => {
    // Some work: a paid order (into production) and a quote request.
    await flows.paidOrder();
    const b = flows.browser();
    const design = (await b.post("/v1/configurations", { productSlug: "polo-shirt", choices: { colour: "navy", fabric: "pique-cotton" }, quantity: 30 })).body as { id: string };
    expect((await b.post(`/v1/configurations/${design.id}/quote-request`, { email: "ops.home@example.com", name: "Ops Home (TEST DATA)" })).status).toBe(200);

    const queues = (await home("adminAda")).queues;
    expect(queues.map((queue) => queue.key)).toEqual(["NEW_REQUESTS", "QUOTES_TO_PREPARE", "PROOFS", "BLOCKED_ORDERS", "PRODUCTION", "QUALITY_CHECK", "READY_TO_DISPATCH", "PAYMENTS", "HELP", "PROBLEMS"]);
    const byKey = Object.fromEntries(queues.map((queue) => [queue.key, queue]));
    const ada = as(harness, actors.adminAda!);

    // New Requests → the requests queue; Quotes to Prepare → quotes waiting for a first version.
    const requests = adminRequestListSchema.parse((await ada.get("/v1/admin/requests")).body);
    expect(byKey.NEW_REQUESTS).toMatchObject({ count: requests.items.length, href: "/projects" });
    expect(requests.items.length).toBeGreaterThanOrEqual(1);
    const pending = adminQuoteListSchema.parse((await ada.get("/v1/admin/quotes?status=PENDING_REVIEW")).body);
    expect(byKey.QUOTES_TO_PREPARE).toMatchObject({ count: pending.items.length, href: "/quotes?status=PENDING_REVIEW" });

    // The production queues are the board's groups, opened as a filtered list.
    const board = productionBoardSchema.parse((await ada.get("/v1/admin/production")).body);
    const size = (...groups: string[]) => board.groups.filter((group) => groups.includes(group.group)).reduce((sum, group) => sum + group.items.length, 0);
    expect(byKey.BLOCKED_ORDERS).toMatchObject({ count: size("WAITING", "ON_HOLD"), href: "/production?view=list&group=WAITING,ON_HOLD" });
    expect(byKey.PRODUCTION).toMatchObject({ count: size("QUEUED", "IN_PRODUCTION"), href: "/production?view=list&group=QUEUED,IN_PRODUCTION" });
    expect(byKey.QUALITY_CHECK).toMatchObject({ count: size("QUALITY_CHECK"), href: "/production?view=list&group=QUALITY_CHECK" });
    expect(size("WAITING", "ON_HOLD", "QUEUED", "IN_PRODUCTION")).toBeGreaterThanOrEqual(1);

    // The rest point at their own lists.
    expect(byKey.PROOFS!.href).toBe("/proofs");
    expect(byKey.READY_TO_DISPATCH!.href).toBe("/shipments");
    expect(byKey.PAYMENTS!.href).toBe("/payments/reviews");
    expect(byKey.HELP!.href).toBe("/help?status=OPEN");
    expect(byKey.PROBLEMS!.href).toBe("/problems");
  });

  it("each person sees only their queues; hidden ones aren't counted or sent", async () => {
    expect((await home("financeFolake")).queues.map((queue) => queue.key)).toEqual(["PAYMENTS"]);
    expect((await home("adminTunde")).queues).toEqual([]);
    expectHidden(await as(harness, actors.customerChidi!).get("/v1/admin/home"));
  });
});
