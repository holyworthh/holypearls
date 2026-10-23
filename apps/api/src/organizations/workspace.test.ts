import { TEST_PEOPLE } from "@holypearls/auth";
import {
  accountHistorySchema,
  adminQuoteSchema,
  checkoutSchema,
  configurationSchema,
  orderSchema,
  paymentStartSchema,
  projectSchema,
  quoteVersionSchema,
  workspaceBillingSchema,
  workspaceOrderListSchema,
  workspaceOverviewSchema,
  workspaceProjectListSchema,
  workspaceSearchSchema,
} from "@holypearls/contracts";
import { and, desc, eq, schema, sql } from "@holypearls/db";
import { unseal } from "@holypearls/email";
import { FakeGateway } from "@holypearls/testkit";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { checkPaymentAttempt } from "../payments/payments.js";
import { type Actors, as, expectForbidden, expectHidden, signInActors } from "../testing/actors.js";
import { createHarness, type Harness, TEST_SEAL_KEY, TEST_WEB_ORIGIN } from "../testing/harness.js";
import { createOrganization } from "./organizations.js";

/*
 * T10-03: the workspace overview, lists, billing and search (PRD-05
 * B2B-FR-004, 010–013; TECH-03 §7, §12, §17). Done when: a single-location
 * member sees no switcher; a Lekki manager only sees Lekki; billing only for
 * Owner and Admin; search never shows another location.
 */

vi.setConfig({ testTimeout: 300_000 });

let harness: Harness;
let gateway: FakeGateway;
let actors: Partial<Actors>;
let acme: string;
let lekki: string;
let victoriaIsland: string;
let other: { organizationId: string; locationId: string };
const db = () => harness.database.db;
const api = (key: keyof Actors) => as(harness, actors[key] ?? "");
const base = () => `/v1/organizations/${acme}`;

/** A signed-in member's paid business-cards order, placed for an organization location (or personal with null). */
async function memberOrder(key: keyof Actors, placedFor: { organizationId: string; locationId: string } | null) {
  const client = api(key);
  const created = configurationSchema.parse(
    (await client.post("/v1/configurations", { productSlug: "business-cards", choices: { paper: "350gsm-matte", sides: "both-sides" } })).body,
  );
  const cards = configurationSchema.parse((await client.patch(`/v1/configurations/${created.id}`).send({ version: created.version, quantity: 250 })).body.draft);
  await client.post("/v1/cart/items", { configurationId: cards.id });
  let checkout = checkoutSchema.parse((await client.post("/v1/checkouts")).body);
  const placed = await client.put(`/v1/checkouts/${checkout.id}/placed-for`, { placedFor, version: checkout.version });
  expect(placed.status).toBe(200);
  checkout = checkoutSchema.parse(placed.body);
  const contact = { name: "Workspace Tester (TEST DATA)", email: TEST_PEOPLE[key as keyof typeof TEST_PEOPLE].email, phone: "0800 000 0000" };
  checkout = checkoutSchema.parse((await client.put(`/v1/checkouts/${checkout.id}/contact`, { ...contact, version: checkout.version })).body);
  checkout = checkoutSchema.parse(
    (
      await client.put(`/v1/checkouts/${checkout.id}/address`, {
        country: "NG",
        name: contact.name,
        phone: contact.phone,
        street: "12 Admiralty Way",
        area: "Eti-Osa",
        state: "Lagos",
        landmark: "",
        version: checkout.version,
      })
    ).body,
  );
  checkout = checkoutSchema.parse((await client.put(`/v1/checkouts/${checkout.id}/delivery`, { option: "STANDARD", version: checkout.version })).body);
  checkout = checkoutSchema.parse((await client.put(`/v1/checkouts/${checkout.id}/billing`, { sameAsDelivery: true, version: checkout.version })).body);
  const started = paymentStartSchema.parse((await client.post(`/v1/checkouts/${checkout.id}/payments`)).body);
  gateway.settle(started.reference, { status: "success" });
  const [attempt] = await db().select().from(schema.paymentAttempts).where(eq(schema.paymentAttempts.reference, started.reference));
  await checkPaymentAttempt({ db: db(), gateway, notify: { db: db(), jobs: harness.jobs, sealKey: TEST_SEAL_KEY, webOrigin: TEST_WEB_ORIGIN } }, attempt!.id, 1);
  const view = checkoutSchema.parse((await client.get(`/v1/checkouts/${checkout.id}`)).body);
  return { checkout: view, orderId: view.order!.id };
}

const orders = async (key: keyof Actors, query = "") => workspaceOrderListSchema.parse((await api(key).get(`${base()}/orders${query}`)).body);

let lekkiOrder: string;
let viOrder: string;

beforeAll(async () => {
  gateway = new FakeGateway();
  harness = await createHarness({ payments: gateway });
  await db().update(schema.paymentSettings).set({ onlinePayments: true }).where(eq(schema.paymentSettings.id, 1));
  actors = await signInActors(harness, ["acmeOwner", "acmeAdmin", "acmeBuyer", "acmeLekkiManager", "acmeApprover", "acmeViewer", "customerChidi", "customerAmaka", "adminAda"]);
  const [organization] = await db()
    .select()
    .from(schema.organizations)
    .where(sql`${schema.organizations.name} like 'ACME%'`);
  acme = organization!.id;
  const locations = await db().select().from(schema.locations).where(eq(schema.locations.organizationId, acme));
  lekki = locations.find((location) => location.name === "Lekki")!.id;
  victoriaIsland = locations.find((location) => location.name === "Victoria Island")!.id;
  const [chidi] = await db().select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, TEST_PEOPLE.customerChidi.email));
  const created = await db().transaction((tx) => createOrganization(tx, { name: "Bolt Foods (TEST DATA)", locations: [{ name: "Ikeja", city: "Lagos" }], ownerUserId: chidi!.id }));
  const [location] = await db().select().from(schema.locations).where(eq(schema.locations.organizationId, created.organizationId));
  other = { organizationId: created.organizationId, locationId: location!.id };
  lekkiOrder = (await memberOrder("acmeLekkiManager", { organizationId: acme, locationId: lekki })).orderId;
  viOrder = (await memberOrder("acmeBuyer", { organizationId: acme, locationId: victoriaIsland })).orderId;
  await memberOrder("customerChidi", { organizationId: other.organizationId, locationId: other.locationId });
});

afterAll(async () => {
  await harness?.close();
});

describe("placing orders for the organization and location", () => {
  it("only members who can create requests, and only in their own locations", async () => {
    const client = api("acmeViewer");
    // A fresh checkout per person: each needs something in the cart.
    const start = async (key: keyof Actors) => {
      const person = api(key);
      const created = configurationSchema.parse(
        (await person.post("/v1/configurations", { productSlug: "business-cards", choices: { paper: "350gsm-matte", sides: "both-sides" } })).body,
      );
      const cards = configurationSchema.parse((await person.patch(`/v1/configurations/${created.id}`).send({ version: created.version, quantity: 250 })).body.draft);
      await person.post("/v1/cart/items", { configurationId: cards.id });
      return checkoutSchema.parse((await person.post("/v1/checkouts")).body);
    };
    const amaka = await start("customerAmaka");
    expectHidden(await api("customerAmaka").put(`/v1/checkouts/${amaka.id}/placed-for`, { placedFor: { organizationId: acme, locationId: lekki }, version: amaka.version }));
    const viewer = await start("acmeViewer");
    expectForbidden(
      await client.put(`/v1/checkouts/${viewer.id}/placed-for`, { placedFor: { organizationId: acme, locationId: lekki }, version: viewer.version }),
      "CREATE_REQUESTS",
    );
    const manager = await start("acmeLekkiManager");
    expectHidden(
      await api("acmeLekkiManager").put(`/v1/checkouts/${manager.id}/placed-for`, { placedFor: { organizationId: acme, locationId: victoriaIsland }, version: manager.version }),
    );
    expectHidden(
      await api("acmeLekkiManager").put(`/v1/checkouts/${manager.id}/placed-for`, { placedFor: { organizationId: acme, locationId: other.locationId }, version: manager.version }),
    );
    const placed = checkoutSchema.parse(
      (await api("acmeLekkiManager").put(`/v1/checkouts/${manager.id}/placed-for`, { placedFor: { organizationId: acme, locationId: lekki }, version: manager.version })).body,
    );
    expect(placed.placedFor).toEqual({ organizationId: acme, locationId: lekki, organizationName: "ACME Hospitality Group (TEST DATA)", locationName: "Lekki" });
    const personal = checkoutSchema.parse((await api("acmeLekkiManager").put(`/v1/checkouts/${manager.id}/placed-for`, { placedFor: null, version: placed.version })).body);
    expect(personal.placedFor).toBeNull();
    // Someone else's checkout stays theirs.
    expectHidden(await api("acmeOwner").put(`/v1/checkouts/${manager.id}/placed-for`, { placedFor: null, version: personal.version }));
  });

  it("the order keeps the checkout's organization and location", async () => {
    const [row] = await db().select().from(schema.orders).where(eq(schema.orders.id, lekkiOrder));
    expect({ organizationId: row!.organizationId, locationId: row!.locationId }).toEqual({ organizationId: acme, locationId: lekki });
  });

  it("a project placed for Lekki gives its quote and order the same place, and a balance shows in billing", async () => {
    const manager = api("acmeLekkiManager");
    let project = projectSchema.parse((await manager.post("/v1/projects", { type: "EVENT", title: "Lekki launch (TEST DATA)" })).body);
    project = projectSchema.parse((await manager.patch(`/v1/projects/${project.id}`).send({ version: project.version, answers: { attendees: 200, crew: 20 } })).body);
    expectHidden(await manager.put(`/v1/projects/${project.id}/placed-for`, { placedFor: { organizationId: acme, locationId: victoriaIsland }, version: project.version }));
    project = projectSchema.parse(
      (await manager.put(`/v1/projects/${project.id}/placed-for`, { placedFor: { organizationId: acme, locationId: lekki }, version: project.version })).body,
    );
    expect(project.placedFor?.locationName).toBe("Lekki");
    project = projectSchema.parse((await manager.post(`/v1/projects/${project.id}/submit`, { version: project.version })).body);
    const quoteId = project.quote!.id;
    const [quote] = await db().select().from(schema.quotes).where(eq(schema.quotes.id, quoteId));
    expect({ organizationId: quote!.organizationId, locationId: quote!.locationId }).toEqual({ organizationId: acme, locationId: lekki });

    // The Owner sees the submitted project but can't open another member's builder.
    const owned = workspaceProjectListSchema.parse((await api("acmeOwner").get(`${base()}/projects`)).body).projects.find((row) => row.id === project.id);
    expect(owned).toMatchObject({ group: "QUOTE_PENDING", locationName: "Lekki", href: null });
    const mine = workspaceProjectListSchema.parse((await manager.get(`${base()}/projects`)).body).projects.find((row) => row.id === project.id);
    expect(mine?.href).toBe(`/start/${project.id}`);

    // Staff send a quote with a 60% deposit; the manager accepts it as a signed-in customer.
    const ada = api("adminAda");
    const built = adminQuoteSchema.parse((await ada.post(`/v1/admin/quotes/${quoteId}/versions`)).body);
    const draft = built.versions.find((version) => version.status === "DRAFT")!;
    const lines = built.candidates
      .slice(0, 1)
      .map((candidate) => ({
        source: candidate.source,
        sourceKey: candidate.sourceKey,
        title: candidate.title,
        summary: candidate.summary,
        quantity: candidate.quantity ?? 1,
        unitMinor: "500000",
      }));
    const fees = { designMinor: "0", deliveryMinor: "0", deliveryNote: "", installationMinor: "0", installationNote: "", otherMinor: "0", otherLabel: "" };
    const schedule = [
      { label: "Deposit", kind: "PERCENT", value: "6000", trigger: "ON_ACCEPTANCE" },
      { label: "Balance", kind: "PERCENT", value: "4000", trigger: "BEFORE_DISPATCH" },
    ];
    const saved = quoteVersionSchema.parse(
      (
        await ada.put(`/v1/admin/quotes/${quoteId}/versions/${draft.id}`, {
          version: draft.version,
          currency: "NGN",
          lines,
          fees,
          validDays: 14,
          terms: "Terms",
          assumptions: "",
          productionSequence: "",
          schedule,
        })
      ).body,
    );
    await ada.post(`/v1/admin/quotes/${quoteId}/versions/${draft.id}/send`, { version: saved.version });

    // A quote waiting on the customer is on the overview.
    const overview = workspaceOverviewSchema.parse((await manager.get(`${base()}/overview`)).body);
    expect(overview.needsAttention.map((item) => item.kind)).toContain("QUOTE");

    // Accepting an organization's quote needs "Accept HolyPearls quotes" (B2B-FR-044, T11-04b): not the Location Manager, the Owner.
    const refused = await manager.post(`/v1/quotes/${quoteId}/accept`, { versionNumber: 1, acknowledged: true });
    expect(refused.status).toBe(403);
    expect(refused.body.context).toMatchObject({ reason: "ACCEPT_QUOTES_REQUIRED" });
    const owner = api("acmeOwner");
    await owner.post("/v1/email-codes", { purpose: "ACCEPT_QUOTE" });
    const [codeMail] = await db()
      .select()
      .from(schema.notifications)
      .where(and(eq(schema.notifications.recipient, TEST_PEOPLE.acmeOwner.email), eq(schema.notifications.template, "email_code")))
      .orderBy(desc(schema.notifications.createdAt))
      .limit(1);
    const { code } = unseal(codeMail!.sealedData!, TEST_SEAL_KEY) as { code: string };
    await owner.post("/v1/email-codes/verify", { purpose: "ACCEPT_QUOTE", code });
    const accepted = await owner.post(`/v1/quotes/${quoteId}/accept`, { versionNumber: 1, acknowledged: true });
    expect(accepted.status).toBe(200);
    const [order] = await db().select().from(schema.orders).where(eq(schema.orders.id, accepted.body.id));
    expect({ organizationId: order!.organizationId, locationId: order!.locationId }).toEqual({ organizationId: acme, locationId: lekki });

    // The deposit is due: it needs the customer, and billing shows it for the Owner.
    const attention = await orders("acmeLekkiManager", "?view=attention");
    expect(attention.orders.find((row) => row.id === order!.id)?.nextStep).toContain("Pay the deposit");
    const billing = workspaceBillingSchema.parse((await api("acmeOwner").get(`${base()}/billing`)).body);
    const due = billing.balancesDue.find((row) => row.orderId === order!.id);
    expect(due).toMatchObject({ locationName: "Lekki", paymentStatus: "DEPOSIT_DUE" });
    expect(BigInt(billing.totals.find((row) => row.currency === due!.currency)!.dueMinor)).toBeGreaterThanOrEqual(BigInt(due!.amountMinor));
  });
});

describe("location scope in every view (TECH-03 §7, §17)", () => {
  it("a Lekki manager only sees Lekki; the Owner sees both, or one with the switcher", async () => {
    const managerOrders = (await orders("acmeLekkiManager")).orders.map((row) => row.id);
    expect(managerOrders).toContain(lekkiOrder);
    expect(managerOrders).not.toContain(viOrder);
    const ownerOrders = (await orders("acmeOwner")).orders.map((row) => row.id);
    expect(ownerOrders).toEqual(expect.arrayContaining([lekkiOrder, viOrder]));
    const viOnly = (await orders("acmeOwner", `?location=${victoriaIsland}`)).orders;
    expect(viOnly.map((row) => row.id)).toContain(viOrder);
    expect(viOnly.every((row) => row.locationName === "Victoria Island")).toBe(true);

    // Choosing a location outside your own is 404, never an empty list.
    expectHidden(await api("acmeLekkiManager").get(`${base()}/orders?location=${victoriaIsland}`));
    expectHidden(await api("acmeLekkiManager").get(`${base()}/overview?location=${victoriaIsland}`));
    expectHidden(await api("acmeLekkiManager").get(`${base()}/search?q=business&location=${victoriaIsland}`));
    expectHidden(await api("acmeOwner").get(`${base()}/orders?location=${other.locationId}`));
  });

  it("a Buyer sees only what they placed", async () => {
    const buyer = (await orders("acmeBuyer")).orders;
    expect(buyer.length).toBeGreaterThan(0);
    expect(buyer.every((row) => row.placedByYou)).toBe(true);
  });

  it("search never shows another location or organization", async () => {
    const manager = workspaceSearchSchema.parse((await api("acmeLekkiManager").get(`${base()}/search?q=business`)).body);
    expect(manager.orders.map((row) => row.id)).toContain(lekkiOrder);
    expect(manager.orders.every((row) => row.locationName === "Lekki")).toBe(true);
    const [viNumber] = await db().select({ number: schema.orders.number }).from(schema.orders).where(eq(schema.orders.id, viOrder));
    expect(workspaceSearchSchema.parse((await api("acmeLekkiManager").get(`${base()}/search?q=${viNumber!.number}`)).body).orders).toEqual([]);
    expect(workspaceSearchSchema.parse((await api("acmeOwner").get(`${base()}/search?q=${viNumber!.number}`)).body).orders.map((row) => row.id)).toEqual([viOrder]);
    // Organization B's order isn't in ACME's search, and B's workspace is 404 for ACME.
    const owner = workspaceSearchSchema.parse((await api("acmeOwner").get(`${base()}/search?q=business`)).body);
    const [bolt] = await db().select({ id: schema.orders.id }).from(schema.orders).where(eq(schema.orders.organizationId, other.organizationId));
    expect(owner.orders.map((row) => row.id)).not.toContain(bolt!.id);
    for (const path of ["overview", "orders", "projects", "billing", "search?q=business"])
      expectHidden(await api("acmeOwner").get(`/v1/organizations/${other.organizationId}/${path}`));
    expect((await api("signedOut").get(`${base()}/overview`)).status).toBe(401);
  });

  it("billing is only for Owner and Admin", async () => {
    expect((await api("acmeOwner").get(`${base()}/billing`)).status).toBe(200);
    const admin = workspaceBillingSchema.parse((await api("acmeAdmin").get(`${base()}/billing`)).body);
    expect(admin.receipts.length).toBeGreaterThan(0);
    for (const key of ["acmeLekkiManager", "acmeBuyer", "acmeApprover", "acmeViewer"] as const) expectForbidden(await api(key).get(`${base()}/billing`), "VIEW_BILLING");
  });

  it("a member who can see an organization order can open it; others get 404", async () => {
    // The Owner reads the Buyer's Victoria Island order (read only).
    const view = orderSchema.parse((await api("acmeOwner").get(`/v1/orders/${viOrder}`)).body);
    expect(view.id).toBe(viOrder);
    // The Approver has All locations; the Lekki manager doesn't reach Victoria Island; strangers see nothing.
    expect((await api("acmeApprover").get(`/v1/orders/${viOrder}`)).status).toBe(200);
    expectHidden(await api("acmeLekkiManager").get(`/v1/orders/${viOrder}`));
    expectHidden(await api("customerAmaka").get(`/v1/orders/${viOrder}`));
    expectHidden(await api("customerChidi").get(`/v1/orders/${viOrder}`));
    // Reading isn't acting: the Owner can't report a problem or reorder on someone else's order.
    expectHidden(await api("acmeOwner").post(`/v1/orders/${viOrder}/reorder`, { itemPosition: 1, mode: "EXACT" }));
    // A deactivated member loses that access at once.
    const approver = await db()
      .select()
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
      .where(eq(schema.users.email, TEST_PEOPLE.acmeApprover.email));
    await db().update(schema.memberships).set({ status: "DEACTIVATED" }).where(eq(schema.memberships.id, approver[0]!.memberships.id));
    expectHidden(await api("acmeApprover").get(`/v1/orders/${viOrder}`));
    await db().update(schema.memberships).set({ status: "ACTIVE" }).where(eq(schema.memberships.id, approver[0]!.memberships.id));
  });

  it("the overview lists active work in scope", async () => {
    const response = await api("acmeLekkiManager").get(`${base()}/overview`);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const overview = workspaceOverviewSchema.parse(response.body);
    expect(overview.canCreate).toBe(true);
    expect(overview.activeOrders.every((row) => row.locationName === "Lekki")).toBe(true);
    expect(workspaceOverviewSchema.parse((await api("acmeViewer").get(`${base()}/overview`)).body).canCreate).toBe(false);
  });
});

describe("record ownership never bypasses current organization scope", () => {
  it("hides an owner's organization order, receipt and account history after deactivation", async () => {
    const [order] = await db().select().from(schema.orders).where(eq(schema.orders.id, viOrder));
    const [membership] = await db()
      .select()
      .from(schema.memberships)
      .where(and(eq(schema.memberships.organizationId, acme), eq(schema.memberships.userId, order!.ownerUserId!)));
    const [receipt] = await db().select().from(schema.receipts).where(eq(schema.receipts.orderId, viOrder));
    await db().update(schema.memberships).set({ status: "DEACTIVATED" }).where(eq(schema.memberships.id, membership!.id));
    try {
      expectHidden(await api("acmeBuyer").get(`/v1/orders/${viOrder}`));
      expectHidden(await api("acmeBuyer").get(`/v1/orders/${viOrder}/receipts/${receipt!.id}`));
      expectHidden(await api("acmeBuyer").post(`/v1/orders/${viOrder}/reorder`, { itemPosition: 1, mode: "EXACT" }));
      const history = accountHistorySchema.parse((await api("acmeBuyer").get("/v1/me/history")).body);
      expect(history.orders.some((row) => row.id === viOrder)).toBe(false);
      expect(history.receipts.some((row) => row.orderId === viOrder)).toBe(false);
    } finally {
      await db().update(schema.memberships).set({ status: "ACTIVE" }).where(eq(schema.memberships.id, membership!.id));
    }
  });

  it("hides an owner's order and account lists after their location scope is reduced", async () => {
    const [order] = await db().select().from(schema.orders).where(eq(schema.orders.id, viOrder));
    const [membership] = await db()
      .select()
      .from(schema.memberships)
      .where(and(eq(schema.memberships.organizationId, acme), eq(schema.memberships.userId, order!.ownerUserId!)));
    const locations = await db().select().from(schema.membershipLocations).where(eq(schema.membershipLocations.membershipId, membership!.id));
    await db().delete(schema.membershipLocations).where(eq(schema.membershipLocations.membershipId, membership!.id));
    await db().insert(schema.membershipLocations).values({ membershipId: membership!.id, organizationId: acme, locationId: lekki });
    await db().update(schema.memberships).set({ allLocations: false }).where(eq(schema.memberships.id, membership!.id));
    try {
      expectHidden(await api("acmeBuyer").get(`/v1/orders/${viOrder}`));
      const history = accountHistorySchema.parse((await api("acmeBuyer").get("/v1/me/history")).body);
      expect(history.orders.some((row) => row.id === viOrder)).toBe(false);
    } finally {
      await db().delete(schema.membershipLocations).where(eq(schema.membershipLocations.membershipId, membership!.id));
      if (locations.length) await db().insert(schema.membershipLocations).values(locations);
      await db().update(schema.memberships).set({ allLocations: membership!.allLocations }).where(eq(schema.memberships.id, membership!.id));
    }
  });
});

it("revocation also hides retained order artwork from the member who uploaded it", async () => {
  const [order] = await db().select().from(schema.orders).where(eq(schema.orders.id, viOrder));
  const [item] = await db().select().from(schema.orderItems).where(eq(schema.orderItems.orderId, viOrder));
  const [membership] = await db()
    .select()
    .from(schema.memberships)
    .where(and(eq(schema.memberships.organizationId, acme), eq(schema.memberships.userId, order!.ownerUserId!)));
  const [file] = await db()
    .insert(schema.files)
    .values({
      purpose: "ARTWORK",
      status: "READY",
      ownerType: "CONFIGURATION",
      ownerId: item!.configurationId!,
      uploadedByUserId: order!.ownerUserId,
      uploadedByCustomerId: order!.customerId,
      originalName: "order-logo.svg",
      safeName: "order-logo.svg",
      declaredSize: 1,
      declaredType: "image/svg+xml",
      storageKey: `test/order-artwork/${crypto.randomUUID()}`,
    })
    .returning();
  await harness.storage.write(file!.storageKey, Buffer.from("x"), "image/svg+xml");
  await db().insert(schema.configurationFiles).values({ configurationId: item!.configurationId!, fileId: file!.id, role: "ARTWORK" });
  expect((await api("acmeBuyer").get(`/v1/files/${file!.id}/download`)).status).toBe(200);
  await db().update(schema.memberships).set({ status: "DEACTIVATED" }).where(eq(schema.memberships.id, membership!.id));
  try {
    expectHidden(await api("acmeBuyer").get(`/v1/files/${file!.id}/download`));
  } finally {
    await db().update(schema.memberships).set({ status: "ACTIVE" }).where(eq(schema.memberships.id, membership!.id));
  }
});

it("an open review takes priority over a paid receipt on the order and workspace card", async () => {
  const [receipt] = await db().select().from(schema.receipts).where(eq(schema.receipts.orderId, viOrder));
  const [review] = await db()
    .insert(schema.paymentReviews)
    .values({ intentId: receipt!.intentId, attemptId: receipt!.attemptId, reason: "DUPLICATE_PAYMENT", details: { expected: "one payment" } })
    .returning();
  try {
    expect(orderSchema.parse((await api("acmeBuyer").get(`/v1/orders/${viOrder}`)).body).paymentStatus).toBe("PAYMENT_RESOLUTION_REQUIRED");
    expect((await orders("acmeOwner")).orders.find((row) => row.id === viOrder)?.paymentStatus).toBe("PAYMENT_RESOLUTION_REQUIRED");
    expect((await orders("acmeOwner", "?view=attention")).orders.some((row) => row.id === viOrder)).toBe(true);
    const billing = (await api("acmeOwner").get(`${base()}/billing`)).body;
    expect(billing.needsResolution).toBeGreaterThanOrEqual(1);
    expect(billing.receipts.find((row: { id: string }) => row.id === receipt!.id)?.status).toBe("PAYMENT_RESOLUTION_REQUIRED");
  } finally {
    await db().update(schema.paymentReviews).set({ status: "RESOLVED" }).where(eq(schema.paymentReviews.id, review!.id));
  }
});

it("doesn't reopen a cached organization checkout after membership revocation", async () => {
  const cards = configurationSchema.parse(
    (await api("acmeBuyer").post("/v1/configurations", { productSlug: "business-cards", choices: { paper: "350gsm-matte", sides: "both-sides" }, quantity: 250 })).body,
  );
  await api("acmeBuyer").post("/v1/cart/items", { configurationId: cards.id });
  const checkout = checkoutSchema.parse((await api("acmeBuyer").post("/v1/checkouts")).body);
  const placed = await api("acmeBuyer").put(`/v1/checkouts/${checkout.id}/placed-for`, {
    placedFor: { organizationId: acme, locationId: victoriaIsland },
    version: checkout.version,
  });
  expect(placed.status).toBe(200);
  const [member] = await db()
    .select({ row: schema.memberships })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(and(eq(schema.memberships.organizationId, acme), eq(schema.users.email, TEST_PEOPLE.acmeBuyer.email)));
  await db().update(schema.memberships).set({ status: "DEACTIVATED" }).where(eq(schema.memberships.id, member!.row.id));
  try {
    expectHidden(await api("acmeBuyer").post("/v1/checkouts"));
  } finally {
    await db().update(schema.memberships).set({ status: "ACTIVE" }).where(eq(schema.memberships.id, member!.row.id));
  }
});
