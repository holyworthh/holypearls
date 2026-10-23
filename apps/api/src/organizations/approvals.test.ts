import { approvalPolicySchema, configurationSchema, orderRequestListSchema, orderRequestSchema, templateOrderResultSchema, templateSchema } from "@holypearls/contracts";
import { desc, eq, schema, sql } from "@holypearls/db";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { type Actors, as, expectForbidden, expectHidden, signInActors } from "../testing/actors.js";
import { no5xx, STRESS_RUNS } from "../testing/flows.js";
import { createHarness, type Harness } from "../testing/harness.js";

/*
 * T11-04: internal approval (PRD-05 B2B-FR-040–042, 044; TECH-01 §4; frames
 * 72–73). Done when: a Buyer can't self-approve when separation is on;
 * approvals can't be edited.
 */

vi.setConfig({ testTimeout: 300_000 });

let harness: Harness;
let actors: Partial<Actors>;
let acme: string;
let lekki: string;
let victoriaIsland: string;
const db = () => harness.database.db;
const api = (key: keyof Actors) => as(harness, actors[key] ?? "");
const base = () => `/v1/organizations/${acme}`;
/** ₦250,000 in kobo: frame 72's "orders above ₦250,000 need an approver". */
const LIMIT = "25000000";

async function setPolicy(body: Record<string, unknown>) {
  const current = approvalPolicySchema.parse((await api("acmeOwner").get(`${base()}/approvals/policy`)).body);
  const response = await api("acmeOwner").put(`${base()}/approvals/policy`, { requesterMembershipIds: [], thresholdMinor: null, separateRequesterApprover: true, ...body, version: current.version });
  expect(response.status).toBe(200);
  return approvalPolicySchema.parse(response.body);
}

/** An approved business-cards template for every location. */
async function approvedTemplate() {
  const draft = configurationSchema.parse((await api("acmeOwner").post("/v1/configurations", { productSlug: "business-cards", choices: { paper: "350gsm-matte", sides: "both-sides" }, quantity: 500 })).body);
  let template = templateSchema.parse((await api("acmeOwner").post(`${base()}/templates`, { name: `Cards ${crypto.randomUUID().slice(0, 6)}`, configurationId: draft.id, assetVersionIds: [], allLocations: true })).body);
  template = templateSchema.parse((await api("acmeOwner").post(`${base()}/templates/${template.id}/submit`, { version: template.version })).body);
  const staff = (await api("adminAda").get(`/v1/admin/templates/${template.id}`)).body as { version: number };
  await api("adminAda").post(`/v1/admin/templates/${template.id}/decision`, { decision: "APPROVE", note: null, version: staff.version });
  return templateSchema.parse((await api("acmeOwner").get(`${base()}/templates/${template.id}`)).body);
}

/** 3,000 cards is about ₦355,000 with VAT: over the ₦250,000 limit. */
async function requestFor(person: keyof Actors, locationId: string, quantity = 3_000) {
  const template = await approvedTemplate();
  const result = templateOrderResultSchema.parse((await api(person).post(`${base()}/templates/${template.id}/orders`, { choices: {}, quantity, locationId, templateVersion: template.version })).body);
  expect(result.route).toBe("APPROVAL");
  const id = result.next.split("/").pop()!;
  return orderRequestSchema.parse((await api(person).get(`${base()}/order-requests/${id}`)).body);
}

const decide = (person: keyof Actors, request: { id: string; version: number }, body: Record<string, unknown>) =>
  api(person).post(`${base()}/order-requests/${request.id}/decision`, { amountMinor: null, note: null, version: request.version, ...body });

beforeAll(async () => {
  harness = await createHarness();
  actors = await signInActors(harness, ["acmeOwner", "acmeAdmin", "acmeBuyer", "acmeLekkiManager", "acmeApprover", "acmeViewer", "adminAda"]);
  const [organization] = await db().select().from(schema.organizations).where(sql`${schema.organizations.name} like 'ACME%'`);
  acme = organization!.id;
  const locations = await db().select().from(schema.locations).where(eq(schema.locations.organizationId, acme));
  lekki = locations.find((location) => location.name === "Lekki")!.id;
  victoriaIsland = locations.find((location) => location.name !== "Lekki")!.id;
});

afterEach(async () => {
  await setPolicy({ rule: "NONE" });
});

afterAll(async () => {
  await harness?.close();
});

describe("approval policy (B2B-FR-040)", () => {
  it("only an Owner sets the rule; everyone in the workspace can read it", async () => {
    const policy = await setPolicy({ rule: "ABOVE_AMOUNT", thresholdMinor: LIMIT });
    expect(policy).toMatchObject({ rule: "ABOVE_AMOUNT", thresholdMinor: LIMIT, separateRequesterApprover: true, canManage: true });
    expect(approvalPolicySchema.parse((await api("acmeViewer").get(`${base()}/approvals/policy`)).body)).toMatchObject({ rule: "ABOVE_AMOUNT", canManage: false });
    const admin = await api("acmeAdmin").put(`${base()}/approvals/policy`, { rule: "NONE", separateRequesterApprover: false, version: policy.version });
    expect(admin.status).toBe(403);
    expect(admin.body.context?.reason).toBe("OWNER_REQUIRED");
    // Above an amount needs the amount.
    expect((await api("acmeOwner").put(`${base()}/approvals/policy`, { rule: "ABOVE_AMOUNT", separateRequesterApprover: true, version: policy.version })).status).toBe(400);
  });

  it("under the limit goes straight through; over it becomes an order request held for approval", async () => {
    await setPolicy({ rule: "ABOVE_AMOUNT", thresholdMinor: LIMIT });
    const template = await approvedTemplate();
    const small = templateOrderResultSchema.parse((await api("acmeLekkiManager").post(`${base()}/templates/${template.id}/orders`, { choices: {}, quantity: 500, locationId: lekki, templateVersion: template.version })).body);
    expect(small.route).toBe("CHECKOUT");
    await db().delete(schema.cartItems).where(eq(schema.cartItems.configurationId, small.configurationId));

    const request = await requestFor("acmeLekkiManager", lekki);
    expect(request).toMatchObject({ status: "PENDING_APPROVAL", locationName: "Lekki", items: [{ productName: "Business Cards", quantity: 3_000 }], canCancel: true, canDecide: false });
    expect(request.policyNote).toMatch(/policy: orders above ₦250,000(\.00)? need an approver\. This one is ₦[\d,.]+ over\./);
    // The design is held: nobody changes it while it waits.
    const design = configurationSchema.parse((await api("acmeLekkiManager").get(`/v1/configurations/${request.items[0]!.configurationId}`)).body);
    expect(design.status).toBe("AWAITING_APPROVAL");
    expect((await api("acmeLekkiManager").patch(`/v1/configurations/${design.id}`).send({ version: design.version, quantity: 2_100, confirmRemovals: false })).status).toBe(409);
    // The approver for every location is emailed.
    const [mail] = await db().select().from(schema.notifications).where(eq(schema.notifications.template, "order_request_submitted")).orderBy(desc(schema.notifications.createdAt)).limit(1);
    expect(mail).toBeDefined();
  });
});

describe("decisions (B2B-FR-041–042)", () => {
  it("with separation on nobody approves their own request; an Approver approves, which sends it to HolyPearls", async () => {
    await setPolicy({ rule: "ABOVE_AMOUNT", thresholdMinor: LIMIT, separateRequesterApprover: true });
    // The Owner can create and approve, but not their own request while separation is on.
    const own = await requestFor("acmeOwner", lekki);
    expect(own).toMatchObject({ canDecide: false, decideBlockedReason: "You can't approve your own request. Someone else with approval rights needs to decide." });
    const self = await decide("acmeOwner", own, { decision: "APPROVE" });
    expect(self.status).toBe(403);
    expect(self.body.context?.reason).toBe("SELF_APPROVAL");
    // A Buyer can never approve, even a request they can see.
    const buyers = await requestFor("acmeBuyer", victoriaIsland);
    expectForbidden(await decide("acmeBuyer", buyers, { decision: "APPROVE" }), "APPROVE_REQUESTS");

    // The Approver sees it waiting and approves the estimate.
    const list = orderRequestListSchema.parse((await api("acmeApprover").get(`${base()}/order-requests`)).body);
    expect(list.requests.find((row) => row.id === own.id)).toMatchObject({ needsMyDecision: true });
    const approved = orderRequestSchema.parse((await decide("acmeApprover", own, { decision: "APPROVE" })).body);
    expect(approved).toMatchObject({ status: "SENT_TO_HOLYPEARLS", quoteReference: expect.stringMatching(/^HP-Q-/), approvals: [{ decision: "APPROVED", amountMinor: own.estimatedTotalMinor }] });
    // The quote belongs to the requester, for the request's location.
    const [quote] = await db().select().from(schema.quotes).where(eq(schema.quotes.reference, approved.quoteReference!));
    expect(quote).toMatchObject({ organizationId: acme, locationId: lekki, configurationId: own.items[0]!.configurationId });
    const [customer] = await db().select().from(schema.customers).where(eq(schema.customers.id, quote!.customerId));
    expect(customer!.email).toMatch(/acme-owner@/);
    // It can't be decided twice.
    expect((await decide("acmeApprover", approved, { decision: "DECLINE", note: "No" })).body.context?.reason).toBe("NOT_PENDING");

    // With separation off, the Owner may approve their own request.
    await setPolicy({ rule: "ABOVE_AMOUNT", thresholdMinor: LIMIT, separateRequesterApprover: false });
    const second = await requestFor("acmeOwner", lekki);
    expect((await decide("acmeOwner", second, { decision: "APPROVE" })).status).toBe(200);
  });

  it("approvals can't be edited: there's no route, and the database refuses changes", async () => {
    await setPolicy({ rule: "ALL" });
    const request = await requestFor("acmeLekkiManager", lekki, 500);
    const approved = orderRequestSchema.parse((await decide("acmeApprover", request, { decision: "APPROVE", amountMinor: "10000000" })).body);
    const approvalId = approved.approvals[0]!.id;
    expect(approved.approvals[0]!.amountMinor).toBe("10000000");
    expect((await api("acmeApprover").put(`${base()}/order-requests/${request.id}/approvals/${approvalId}`, { amountMinor: "99999999" })).status).toBe(404);
    await expect(db().update(schema.organizationApprovals).set({ approvedAmountMinor: 99_999_999n }).where(eq(schema.organizationApprovals.id, approvalId))).rejects.toThrow();
    await expect(db().delete(schema.organizationApprovals).where(eq(schema.organizationApprovals.id, approvalId))).rejects.toThrow();
    const [row] = await db().select().from(schema.organizationApprovals).where(eq(schema.organizationApprovals.id, approvalId));
    expect(row!.approvedAmountMinor).toBe(10_000_000n);
  });

  it("makes one approval and one quote however many approvers press at once", async () => {
    await setPolicy({ rule: "ALL" });
    const request = await requestFor("acmeLekkiManager", lekki, 500);
    const presses = await Promise.all(Array.from({ length: STRESS_RUNS }, () => decide("acmeApprover", request, { decision: "APPROVE" })));
    no5xx(presses);
    expect(presses.filter((response) => response.status === 200)).toHaveLength(1);
    expect(presses.filter((response) => response.status !== 200).every((response) => response.status === 409 || response.status === 422)).toBe(true);
    const approvals = await db().select().from(schema.organizationApprovals).where(eq(schema.organizationApprovals.orderRequestId, request.id));
    expect(approvals.map((row) => row.decision)).toEqual(["APPROVED"]);
    const approved = orderRequestSchema.parse((await api("acmeApprover").get(`${base()}/order-requests/${request.id}`)).body);
    expect(await db().select().from(schema.quotes).where(eq(schema.quotes.reference, approved.quoteReference!))).toHaveLength(1);
  });

  it("request changes gives the design back; it's sent again; decline needs a note; the requester can cancel", async () => {
    await setPolicy({ rule: "ALL" });
    const request = await requestFor("acmeLekkiManager", lekki, 500);
    expect((await decide("acmeApprover", request, { decision: "REQUEST_CHANGES" })).status).toBe(400);
    const returned = orderRequestSchema.parse((await decide("acmeApprover", request, { decision: "REQUEST_CHANGES", note: "Make it 400." })).body);
    expect(returned).toMatchObject({ status: "DRAFT", canResubmit: false, approvals: [{ decision: "CHANGES_REQUESTED", note: "Make it 400." }] });
    expect(orderRequestSchema.parse((await api("acmeLekkiManager").get(`${base()}/order-requests/${request.id}`)).body).canResubmit).toBe(true);
    const design = configurationSchema.parse((await api("acmeLekkiManager").get(`/v1/configurations/${request.items[0]!.configurationId}`)).body);
    expect(design.status).toBe("DRAFT");
    expect((await api("acmeLekkiManager").patch(`/v1/configurations/${design.id}`).send({ version: design.version, quantity: 400, confirmRemovals: false })).status).toBe(200);
    const again = orderRequestSchema.parse((await api("acmeLekkiManager").post(`${base()}/order-requests/${request.id}/resubmit`, { version: returned.version })).body);
    expect(again).toMatchObject({ status: "PENDING_APPROVAL", items: [{ quantity: 400 }] });
    expect(BigInt(again.estimatedTotalMinor!)).toBeLessThan(BigInt(request.estimatedTotalMinor!));

    const declined = orderRequestSchema.parse((await decide("acmeApprover", again, { decision: "DECLINE", note: "Not this quarter." })).body);
    expect(declined.status).toBe("REJECTED");
    expect(declined.approvals.map((approval) => approval.decision)).toEqual(["CHANGES_REQUESTED", "REJECTED"]);

    const other = await requestFor("acmeLekkiManager", lekki, 500);
    expectForbidden(await api("acmeApprover").post(`${base()}/order-requests/${other.id}/cancel`, { version: other.version }), "REQUESTER_ONLY");
    const cancelled = orderRequestSchema.parse((await api("acmeLekkiManager").post(`${base()}/order-requests/${other.id}/cancel`, { version: other.version })).body);
    expect(cancelled.status).toBe("CANCELLED");
  });

  it("people see requests for their locations; Buyers see only their own", async () => {
    await setPolicy({ rule: "ALL" });
    const lekkiRequest = await requestFor("acmeLekkiManager", lekki, 500);
    expect((await api("acmeViewer").get(`${base()}/order-requests/${lekkiRequest.id}`)).status).toBe(200);
    expectForbidden(await decide("acmeViewer", lekkiRequest, { decision: "APPROVE" }), "APPROVE_REQUESTS");
    // The Victoria Island Buyer can't see Lekki's request, and isn't listed it.
    expectHidden(await api("acmeBuyer").get(`${base()}/order-requests/${lekkiRequest.id}`));
    const buyerList = orderRequestListSchema.parse((await api("acmeBuyer").get(`${base()}/order-requests`)).body);
    expect(buyerList.requests.map((row) => row.id)).not.toContain(lekkiRequest.id);
  });
});

it("puts actionable approvals on the overview without exposing another location or self-approval", async () => {
  await setPolicy({ rule: "ALL" });
  const request = await requestFor("acmeBuyer", victoriaIsland);
  const owner = (await api("acmeOwner").get(`${base()}/overview`)).body;
  expect(owner.needsAttention).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "APPROVAL", href: `/workspace/${acme}/approvals/${request.id}` })]));
  const own = (await api("acmeBuyer").get(`${base()}/overview`)).body;
  expect(own.needsAttention.some((row: { kind: string }) => row.kind === "APPROVAL")).toBe(false);
  const lekkiOnly = (await api("acmeOwner").get(`${base()}/overview?location=${lekki}`)).body;
  expect(lekkiOnly.needsAttention.some((row: { href: string }) => row.href.endsWith(request.id))).toBe(false);
});

it("revokes the requester's direct approval-record access when their location is removed", async () => {
  await setPolicy({ rule: "ALL" });
  const request = await requestFor("acmeBuyer", victoriaIsland);
  const [row] = await db().select().from(schema.orderRequests).where(eq(schema.orderRequests.id, request.id));
  const [member] = await db().select().from(schema.memberships).where(eq(schema.memberships.userId, row!.requestedByUserId!));
  const grants = await db().select().from(schema.membershipLocations).where(eq(schema.membershipLocations.membershipId, member!.id));
  await db().delete(schema.membershipLocations).where(eq(schema.membershipLocations.membershipId, member!.id));
  await db().insert(schema.membershipLocations).values({ organizationId: acme, membershipId: member!.id, locationId: lekki });
  try { expectHidden(await api("acmeBuyer").get(`${base()}/order-requests/${request.id}`)); }
  finally {
    await db().delete(schema.membershipLocations).where(eq(schema.membershipLocations.membershipId, member!.id));
    if (grants.length) await db().insert(schema.membershipLocations).values(grants);
  }
});
