import { TEST_PEOPLE } from "@holypearls/auth";
import { adminQuoteSchema, approvalPolicySchema, configurationSchema, customerQuoteSchema, orderRequestSchema, quoteVersionSchema, templateOrderResultSchema, templateSchema } from "@holypearls/contracts";
import { desc, eq, schema, sql } from "@holypearls/db";
import { unseal } from "@holypearls/email";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { type Actors, as, expectHidden, signInActors } from "../testing/actors.js";
import { createHarness, type Harness, TEST_SEAL_KEY } from "../testing/harness.js";

/*
 * T11-04b: quote authority and organization re-approval (PRD-03
 * QUOTE-FR-020–022; PRD-05 B2B-FR-043–044; frames 48, 73B). Done when:
 * ₦440k passes; ₦485k blocks then passes after re-approval; Approver can't
 * accept. TECH-08 §11's fixture: a ₦450,000 approval.
 */

vi.setConfig({ testTimeout: 300_000 });

let harness: Harness;
let actors: Partial<Actors>;
let acme: string;
let lekki: string;
const db = () => harness.database.db;
const api = (key: keyof Actors) => as(harness, actors[key] ?? "");
const base = () => `/v1/organizations/${acme}`;
const APPROVED = "45000000"; // ₦450,000
const schedule = [{ label: "Payment", kind: "PERCENT", value: "10000", trigger: "ON_ACCEPTANCE" }];
const fees = { designMinor: "0", deliveryMinor: "0", deliveryNote: "", installationMinor: "0", installationNote: "", otherMinor: "0", otherLabel: "" };

/** A Lekki template order the Approver approved for ₦450,000; it's now a quote request with HolyPearls. */
async function approvedRequest() {
  const draft = configurationSchema.parse((await api("acmeOwner").post("/v1/configurations", { productSlug: "business-cards", choices: { paper: "350gsm-matte", sides: "both-sides" }, quantity: 500 })).body);
  let template = templateSchema.parse((await api("acmeOwner").post(`${base()}/templates`, { name: `Uniform ${crypto.randomUUID().slice(0, 6)}`, configurationId: draft.id, assetVersionIds: [], allLocations: true })).body);
  template = templateSchema.parse((await api("acmeOwner").post(`${base()}/templates/${template.id}/submit`, { version: template.version })).body);
  const staffView = (await api("adminAda").get(`/v1/admin/templates/${template.id}`)).body as { version: number };
  await api("adminAda").post(`/v1/admin/templates/${template.id}/decision`, { decision: "APPROVE", note: null, version: staffView.version });
  template = templateSchema.parse((await api("acmeOwner").get(`${base()}/templates/${template.id}`)).body);
  const response = await api("acmeLekkiManager").post(`${base()}/templates/${template.id}/orders`, { choices: {}, quantity: 500, locationId: lekki, templateVersion: template.version });
  const ordered = templateOrderResultSchema.parse(response.body);
  const requestId = ordered.next.split("/").pop()!;
  const pending = orderRequestSchema.parse((await api("acmeApprover").get(`${base()}/order-requests/${requestId}`)).body);
  const sent = orderRequestSchema.parse((await api("acmeApprover").post(`${base()}/order-requests/${requestId}/decision`, { decision: "APPROVE", amountMinor: APPROVED, note: null, version: pending.version })).body);
  const [quote] = await db().select({ id: schema.quotes.id }).from(schema.quotes).where(eq(schema.quotes.reference, sent.quoteReference!));
  return { requestId, quoteId: quote!.id };
}

/** HolyPearls sends a version with one line at `unitMinor`; returns its total with VAT. */
async function sendVersion(quoteId: string, unitMinor: string) {
  const quote = adminQuoteSchema.parse((await api("adminAda").post(`/v1/admin/quotes/${quoteId}/versions`)).body);
  const draft = quote.versions.find((version) => version.status === "DRAFT")!;
  const candidate = quote.candidates[0]!;
  const lines = [{ source: candidate.source, sourceKey: candidate.sourceKey, title: candidate.title, summary: candidate.summary, quantity: 1, unitMinor }];
  const saved = quoteVersionSchema.parse((await api("adminAda").put(`/v1/admin/quotes/${quoteId}/versions/${draft.id}`, { version: draft.version, currency: "NGN", lines, fees, validDays: 14, terms: "Terms", assumptions: "", productionSequence: "", schedule })).body);
  expect((await api("adminAda").post(`/v1/admin/quotes/${quoteId}/versions/${draft.id}/send`, { version: saved.version })).status).toBe(200);
  return { number: saved.number, totalMinor: BigInt(saved.totals.totalMinor) };
}

async function verifyEmail(person: keyof typeof TEST_PEOPLE) {
  await api(person).post("/v1/email-codes", { purpose: "ACCEPT_QUOTE" });
  const [mail] = await db().select().from(schema.notifications).where(sql`${schema.notifications.recipient} = ${TEST_PEOPLE[person].email} and ${schema.notifications.template} = 'email_code'`).orderBy(desc(schema.notifications.createdAt)).limit(1);
  const { code } = unseal(mail!.sealedData!, TEST_SEAL_KEY) as { code: string };
  expect((await api(person).post("/v1/email-codes/verify", { purpose: "ACCEPT_QUOTE", code })).status).toBe(200);
}

const accept = (person: keyof Actors, quoteId: string, versionNumber: number) => api(person).post(`/v1/quotes/${quoteId}/accept`, { versionNumber, acknowledged: true });

beforeAll(async () => {
  harness = await createHarness();
  actors = await signInActors(harness, ["acmeOwner", "acmeLekkiManager", "acmeApprover", "acmeBuyer", "adminAda"]);
  const [organization] = await db().select().from(schema.organizations).where(sql`${schema.organizations.name} like 'ACME%'`);
  acme = organization!.id;
  const [location] = await db().select().from(schema.locations).where(sql`${schema.locations.organizationId} = ${acme} and ${schema.locations.name} = 'Lekki'`);
  lekki = location!.id;
  const policy = approvalPolicySchema.parse((await api("acmeOwner").get(`${base()}/approvals/policy`)).body);
  await api("acmeOwner").put(`${base()}/approvals/policy`, { rule: "ALL", thresholdMinor: null, requesterMembershipIds: [], separateRequesterApprover: true, version: policy.version });
});

afterAll(async () => {
  const policy = approvalPolicySchema.parse((await api("acmeOwner").get(`${base()}/approvals/policy`)).body);
  await api("acmeOwner").put(`${base()}/approvals/policy`, { rule: "NONE", thresholdMinor: null, requesterMembershipIds: [], separateRequesterApprover: true, version: policy.version });
  await harness?.close();
});

describe("quote authority (QUOTE-FR-020–022; B2B-FR-043–044)", () => {
  it("a ₦440,000 quote within the ₦450,000 approval passes; the Approver can't accept, the Owner can", async () => {
    const { quoteId } = await approvedRequest();
    // ₦409,302.33 + 7.5% VAT ≈ ₦440,000.
    const version = await sendVersion(quoteId, "40930233");
    expect(version.totalMinor).toBeLessThanOrEqual(BigInt(APPROVED));
    expect(version.totalMinor).toBeGreaterThan(43_900_000n);

    // The Approver can see the quote but can't accept it: approving and accepting are separate.
    const approverView = customerQuoteSchema.parse((await api("acmeApprover").get(`/v1/quotes/${quoteId}`)).body);
    expect(approverView).toMatchObject({ canAccept: false, blockers: [{ code: "ORGANIZATION_PERMISSION" }], organizationApproval: { approvedMinor: APPROVED, reapprovalRequired: false } });
    const refused = await accept("acmeApprover", quoteId, version.number);
    expect(refused.status).toBe(403);
    expect(refused.body.context).toMatchObject({ reason: "ACCEPT_QUOTES_REQUIRED" });
    // Outside the organization it doesn't open at all.
    expectHidden(await api("acmeBuyer").get(`/v1/quotes/${quoteId}`));

    const ownerView = customerQuoteSchema.parse((await api("acmeOwner").get(`/v1/quotes/${quoteId}`)).body);
    expect(ownerView).toMatchObject({ canAccept: true, blockers: [] });
    await verifyEmail("acmeOwner");
    const order = await accept("acmeOwner", quoteId, version.number);
    expect(order.status).toBe(200);
    const [made] = await db().select().from(schema.orders).where(eq(schema.orders.id, (order.body as { id: string }).id));
    expect(made).toMatchObject({ organizationId: acme, locationId: lekki });
  });

  it("a ₦485,000 quote blocks with Organization re-approval required, then passes after re-approval", async () => {
    const { requestId, quoteId } = await approvedRequest();
    // ₦451,162.79 + 7.5% VAT ≈ ₦485,000.
    const version = await sendVersion(quoteId, "45116279");
    expect(version.totalMinor).toBeGreaterThan(BigInt(APPROVED));

    const blocked = customerQuoteSchema.parse((await api("acmeOwner").get(`/v1/quotes/${quoteId}`)).body);
    expect(blocked.canAccept).toBe(false);
    expect(blocked.blockers).toEqual([{ code: "ORGANIZATION_REAPPROVAL_REQUIRED", message: "Organization re-approval required" }]);
    expect(blocked.organizationApproval).toMatchObject({ approvedMinor: APPROVED, quoteTotalMinor: version.totalMinor.toString(), differenceMinor: (version.totalMinor - BigInt(APPROVED)).toString(), reapprovalRequired: true, canSendForReapproval: true });
    // The quote stays visible and unchanged; accepting is refused.
    await verifyEmail("acmeOwner");
    const refused = await accept("acmeOwner", quoteId, version.number);
    expect(refused.status).toBe(422);
    expect(refused.body.context).toMatchObject({ reason: "ORGANIZATION_REAPPROVAL_REQUIRED" });

    // The requester sends it for re-approval; it waits for the Approver.
    const before = orderRequestSchema.parse((await api("acmeLekkiManager").get(`${base()}/order-requests/${requestId}`)).body);
    const again = orderRequestSchema.parse((await api("acmeLekkiManager").post(`${base()}/order-requests/${requestId}/reapproval`, { note: "Heavier stock confirmed at review.", version: before.version })).body);
    expect(again).toMatchObject({ status: "PENDING_APPROVAL", estimatedTotalMinor: version.totalMinor.toString(), reapproval: { approvedMinor: APPROVED, quoteTotalMinor: version.totalMinor.toString(), note: "Heavier stock confirmed at review." } });
    const waiting = customerQuoteSchema.parse((await api("acmeOwner").get(`/v1/quotes/${quoteId}`)).body);
    expect(waiting.blockers[0]!.message).toMatch(/^Accept unlocks once ACME Hospitality Group \(TEST DATA\) approves ₦/);

    // A new approval for the new total; the first is kept.
    const pending = orderRequestSchema.parse((await api("acmeApprover").get(`${base()}/order-requests/${requestId}`)).body);
    const reapproved = orderRequestSchema.parse((await api("acmeApprover").post(`${base()}/order-requests/${requestId}/decision`, { decision: "APPROVE", amountMinor: null, note: null, version: pending.version })).body);
    expect(reapproved.status).toBe("SENT_TO_HOLYPEARLS");
    expect(reapproved.approvals.map((approval) => [approval.decision, approval.amountMinor])).toEqual([
      ["APPROVED", APPROVED],
      ["APPROVED", version.totalMinor.toString()],
    ]);
    const [quote] = await db().select({ status: schema.quotes.status }).from(schema.quotes).where(eq(schema.quotes.id, quoteId));
    expect(quote!.status).toBe("READY");

    expect(customerQuoteSchema.parse((await api("acmeOwner").get(`/v1/quotes/${quoteId}`)).body).canAccept).toBe(true);
    expect((await accept("acmeOwner", quoteId, version.number)).status).toBe(200);
  });

  it("re-approval is only for a quote above the approved amount", async () => {
    const { requestId, quoteId } = await approvedRequest();
    await sendVersion(quoteId, "10000000");
    const current = orderRequestSchema.parse((await api("acmeLekkiManager").get(`${base()}/order-requests/${requestId}`)).body);
    const refused = await api("acmeLekkiManager").post(`${base()}/order-requests/${requestId}/reapproval`, { note: null, version: current.version });
    expect(refused.body.context?.reason).toBe("WITHIN_APPROVAL");
  });
});
