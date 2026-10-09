import { insertTestPerson, TEST_PEOPLE } from "@holypearls/auth";
import {
  adminOrganizationListSchema,
  adminOrganizationRequestSchema,
  adminOrganizationSchema,
  apiErrorSchema,
  invitationPreviewSchema,
  locationDetailSchema,
  locationListSchema,
  myOrganizationSchema,
  myOrganizationsSchema,
  type OrganizationRole,
  organizationRequestSchema,
  ROLE_PRESETS,
  teamMemberSchema,
  teamSchema,
} from "@holypearls/contracts";
import { and, desc, eq, schema, sql } from "@holypearls/db";
import { unseal } from "@holypearls/email";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { expireInvitations } from "../identity/invitations.js";
import { type Actors, as, expectForbidden, expectHidden, signInActors } from "../testing/actors.js";
import { createHarness, type Harness, TEST_AUTH_SECRET, TEST_HELP_INBOX, TEST_SEAL_KEY, TEST_WEB_ORIGIN } from "../testing/harness.js";
import { grantFor } from "./members.js";
import { createOrganization } from "./organizations.js";

/*
 * T10-01: organizations, locations, permissions, team and invitations
 * (PRD-05 B2B-FR-001–003, 090–093; PRD-06 OPS-FR-080–081; TECH-03 §7, §9,
 * §11, §12, §17), and workspace requests (owner decision 2026-10-08).
 * Done when: cross-organization and cross-location attack tests pass; the
 * last owner can't be removed; a deactivated member loses access immediately.
 */

vi.setConfig({ testTimeout: 300_000 });

let harness: Harness;
let actors: Partial<Actors>;
let acme: string;
let lekki: string;
let victoriaIsland: string;
let other: { organizationId: string; membershipId: string; locationId: string };
const db = () => harness.database.db;
const PASSWORD = "a-long-test-password-123";

const api = (key: keyof Actors) => as(harness, actors[key] ?? "");
const cookieOf = (response: request.Response) =>
  ((response.headers["set-cookie"] as unknown as string[] | undefined) ?? []).map((line) => line.split(";")[0]).filter((pair) => !pair!.endsWith("=")).join("; ");

/** A new signed-in person with a verified email: a cookie and their user ID. */
async function newPerson(label: string) {
  const email = `${label}.${randomUUID().slice(0, 8)}@people.test`;
  const userId = await db().transaction((tx) => insertTestPerson(tx, { key: label, name: `${label} (TEST DATA)`, email, password: PASSWORD }, TEST_AUTH_SECRET));
  const response = await request(harness.url).post("/v1/auth/sign-in/email").set("origin", TEST_WEB_ORIGIN).send({ email, password: PASSWORD });
  expect(response.status).toBe(200);
  return { email, userId, cookie: cookieOf(response) };
}

/** Puts a person straight into an organization (test setup only; the product adds members by invitation). */
async function addMember(organizationId: string, userId: string, role: OrganizationRole, locations: readonly string[] | "ALL") {
  const allLocations = locations === "ALL" || role === "OWNER";
  const [row] = await db().insert(schema.memberships).values({ organizationId, userId, role, allLocations }).returning({ id: schema.memberships.id });
  await db().insert(schema.membershipPermissions).values(grantFor(role, null).map((permission) => ({ membershipId: row!.id, permission })));
  if (!allLocations) {
    for (const locationId of locations as readonly string[]) await db().insert(schema.membershipLocations).values({ membershipId: row!.id, organizationId, locationId });
  }
  return row!.id;
}

async function membershipOf(organizationId: string, email: string) {
  const [row] = await db()
    .select({ membership: schema.memberships })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(and(eq(schema.memberships.organizationId, organizationId), eq(schema.users.email, email)));
  return row!.membership;
}

const latestMail = async (template: string, to: string) => {
  const [mail] = await db()
    .select()
    .from(schema.notifications)
    .where(and(eq(schema.notifications.template, template), eq(schema.notifications.recipient, to.toLowerCase())))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(1);
  return mail ? { ...mail, data: unseal(mail.sealedData!, TEST_SEAL_KEY) as Record<string, string> } : null;
};

/** Requests and enters an email code in this session (TECH-03 §5, §9). */
async function confirmEmail(cookie: string, email: string) {
  const client = as(harness, cookie);
  expect((await client.post("/v1/email-codes", { purpose: "VERIFY_ACTION" })).status).toBe(201);
  const mail = await latestMail("email_code", email);
  expect((await client.post("/v1/email-codes/verify", { purpose: "VERIFY_ACTION", code: mail!.data.code })).status).toBe(200);
}

const reasonOf = (response: request.Response) => (apiErrorSchema.parse(response.body).context as { reason?: string } | undefined)?.reason;
const expectRule = (response: request.Response, reason: string) => {
  expect({ status: response.status, reason: reasonOf(response) }).toEqual({ status: 422, reason });
};

const change = (cookie: string, organizationId: string, membershipId: string, body: object) =>
  as(harness, cookie).patch(`/v1/organizations/${organizationId}/members/${membershipId}`).send(body);

async function teamOf(key: keyof Actors, organizationId = acme) {
  const response = await api(key).get(`/v1/organizations/${organizationId}/members`);
  expect(response.status).toBe(200);
  return teamSchema.parse(response.body);
}

beforeAll(async () => {
  harness = await createHarness();
  actors = await signInActors(harness, ["acmeOwner", "acmeAdmin", "acmeBuyer", "acmeLekkiManager", "acmeApprover", "acmeViewer", "customerChidi", "customerAmaka", "adminAda", "financeFolake"]);
  const [organization] = await db().select().from(schema.organizations).where(sql`${schema.organizations.name} like 'ACME%'`);
  acme = organization!.id;
  const locations = await db().select().from(schema.locations).where(eq(schema.locations.organizationId, acme));
  lekki = locations.find((location) => location.name === "Lekki")!.id;
  victoriaIsland = locations.find((location) => location.name === "Victoria Island")!.id;
  // Organization B: Chidi's business, for the cross-organization tests.
  const [chidi] = await db().select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, TEST_PEOPLE.customerChidi.email));
  const created = await db().transaction((tx) => createOrganization(tx, { name: "Bolt Foods (TEST DATA)", locations: [{ name: "Ikeja", city: "Lagos" }], ownerUserId: chidi!.id }));
  const [location] = await db().select().from(schema.locations).where(eq(schema.locations.organizationId, created.organizationId));
  other = { ...created, locationId: location!.id };
});

afterAll(async () => {
  await harness?.close();
});

describe("organizations and location scope (TECH-03 §7, §12, §17)", () => {
  it("lists a person's workspaces with their role and locations", async () => {
    const mine = myOrganizationsSchema.parse((await api("acmeLekkiManager").get("/v1/me/organizations")).body);
    expect(mine.organizations).toHaveLength(1);
    expect(mine.organizations[0]!.me).toMatchObject({ role: "LOCATION_MANAGER", allLocations: false, locations: [{ id: lekki, name: "Lekki" }] });
    expect(mine.organizations[0]!.me.permissions).toEqual([...ROLE_PRESETS.LOCATION_MANAGER]);
    const owner = myOrganizationSchema.parse((await api("acmeOwner").get(`/v1/organizations/${acme}`)).body);
    expect(owner.me.locations.map((location) => location.name)).toEqual(["Lekki", "Victoria Island"]);
    expect((await api("customerAmaka").get("/v1/me/organizations")).body).toEqual({ organizations: [] });
    expect((await api("signedOut").get("/v1/me/organizations")).status).toBe(401);
  });

  it("organization A cannot read or change organization B's data", async () => {
    const owner = api("acmeOwner");
    const base = `/v1/organizations/${other.organizationId}`;
    for (const response of [
      await owner.get(base),
      await owner.get(`${base}/locations`),
      await owner.get(`${base}/locations/${other.locationId}`),
      await owner.get(`${base}/members`),
      await owner.post(`${base}/invitations`, { email: "x@acme.test", role: "VIEWER", allLocations: true }),
      await owner.post(`${base}/locations`, { name: "Yaba", city: "Lagos" }),
      await change(actors.acmeOwner!, other.organizationId, other.membershipId, { role: "VIEWER", allLocations: true, version: 1, confirmed: true }),
      await owner.post(`${base}/members/${other.membershipId}/deactivate`, { version: 1, confirmed: true }),
      await owner.post(`${base}/ownership-transfer`, { membershipId: other.membershipId, stepDown: false, confirmed: true }),
    ]) {
      expectHidden(response);
    }
    // B's membership and location under ACME's own path are just as missing.
    expectHidden(await change(actors.acmeOwner!, acme, other.membershipId, { role: "VIEWER", allLocations: true, version: 1, confirmed: true }));
    expectHidden(await owner.get(`/v1/organizations/${acme}/locations/${other.locationId}`));
    const invite = await owner.post(`/v1/organizations/${acme}/invitations`, { email: "cross@acme.test", role: "BUYER", allLocations: false, locationIds: [other.locationId] });
    expect(invite.status).toBe(400);
    expect(apiErrorSchema.parse(invite.body).fieldErrors).toHaveProperty("locationIds");
    // Someone in no organization learns nothing either; signed out is 401.
    expectHidden(await api("customerAmaka").get(`/v1/organizations/${acme}`));
    expect((await api("signedOut").get(`/v1/organizations/${acme}/locations`)).status).toBe(401);
  });

  it("a Lekki Location Manager cannot see Victoria Island", async () => {
    const manager = api("acmeLekkiManager");
    const list = locationListSchema.parse((await manager.get(`/v1/organizations/${acme}/locations`)).body);
    expect(list.locations.map((location) => location.name)).toEqual(["Lekki"]);
    expectHidden(await manager.get(`/v1/organizations/${acme}/locations/${victoriaIsland}`));
    const detail = locationDetailSchema.parse((await manager.get(`/v1/organizations/${acme}/locations/${lekki}`)).body);
    // The Lekki manager and Viewer, plus the three members with All locations.
    expect(detail.members.map((member) => member.role).sort()).toEqual(["ADMIN", "APPROVER", "LOCATION_MANAGER", "OWNER", "VIEWER"]);
    expect(detail.memberCount).toBe(5);
    expectForbidden(await manager.get(`/v1/organizations/${acme}/members`), "MANAGE_TEAM");
  });

  it("a team manager limited to Lekki can't reach beyond Lekki or grant more than they hold", async () => {
    const lagos = await newPerson("lekkiadmin");
    const membershipId = await addMember(acme, lagos.userId, "ADMIN", [lekki]);
    const client = as(harness, lagos.cookie);
    const team = teamSchema.parse((await client.get(`/v1/organizations/${acme}/members`)).body);
    // The Victoria Island Buyer is outside Lekki, so not listed; everyone with All locations is.
    expect(team.members.map((member) => member.role)).not.toContain("BUYER");
    expect(team.members.find((member) => member.membershipId === membershipId)?.isYou).toBe(true);
    expect(team.invitations.map((invitation) => invitation.status)).toEqual(["EXPIRED"]);

    expectForbidden(await client.post(`/v1/organizations/${acme}/invitations`, { email: "vi@acme.test", role: "VIEWER", allLocations: false, locationIds: [victoriaIsland] }), "OUTSIDE_YOUR_LOCATIONS");
    expectForbidden(await client.post(`/v1/organizations/${acme}/invitations`, { email: "all@acme.test", role: "VIEWER", allLocations: true }), "CANNOT_GRANT_ALL_LOCATIONS");
    const buyer = await membershipOf(acme, TEST_PEOPLE.acmeBuyer.email);
    expectHidden(await change(lagos.cookie, acme, buyer.id, { role: "VIEWER", allLocations: false, locationIds: [victoriaIsland], version: buyer.version, confirmed: true }));
    const viewer = await membershipOf(acme, TEST_PEOPLE.acmeViewer.email);
    expectForbidden(await change(lagos.cookie, acme, viewer.id, { role: "VIEWER", allLocations: false, locationIds: [lekki, victoriaIsland], version: viewer.version, confirmed: true }), "OUTSIDE_YOUR_LOCATIONS");
    // Admins don't hold "approve organization requests", so they can't make an Approver.
    expectForbidden(await change(lagos.cookie, acme, viewer.id, { role: "APPROVER", allLocations: false, locationIds: [lekki], version: viewer.version, confirmed: true }), "CANNOT_GRANT_WHAT_YOU_DONT_HOLD");
    const owner = await membershipOf(acme, TEST_PEOPLE.acmeOwner.email);
    expectForbidden(await client.post(`/v1/organizations/${acme}/members/${owner.id}/deactivate`, { version: owner.version, confirmed: true }), "OWNER_REQUIRED");
    expectForbidden(await client.post(`/v1/organizations/${acme}/locations`, { name: "Ajah", city: "Lagos" }), "ALL_LOCATIONS_REQUIRED");
  });

  it("a Viewer cannot change anything", async () => {
    const viewer = api("acmeViewer");
    const target = await membershipOf(acme, TEST_PEOPLE.acmeBuyer.email);
    const writes = [
      await viewer.post(`/v1/organizations/${acme}/invitations`, { email: "v@acme.test", role: "VIEWER", allLocations: false, locationIds: [lekki] }),
      await viewer.post(`/v1/organizations/${acme}/locations`, { name: "Ajah", city: "Lagos" }),
      await viewer.patch(`/v1/organizations/${acme}/locations/${lekki}`).send({ name: "Lekki Phase 1", city: "Lagos", version: 1 }),
      await change(actors.acmeViewer!, acme, target.id, { role: "VIEWER", allLocations: true, version: target.version, confirmed: true }),
      await viewer.post(`/v1/organizations/${acme}/members/${target.id}/deactivate`, { version: target.version, confirmed: true }),
      await viewer.post(`/v1/organizations/${acme}/members/${target.id}/reactivate`, { version: target.version, confirmed: true }),
      await viewer.post(`/v1/organizations/${acme}/ownership-transfer`, { membershipId: target.id, stepDown: false, confirmed: true }),
    ];
    for (const response of writes) expectForbidden(response);
    expect((await viewer.get(`/v1/organizations/${acme}/locations`)).status).toBe(200);
  });

  it("an Approver can't give themselves more, and a Buyer can't open the team", async () => {
    expectForbidden(await api("acmeApprover").get(`/v1/organizations/${acme}/members`), "MANAGE_TEAM");
    expectForbidden(await api("acmeBuyer").get(`/v1/organizations/${acme}/members`), "MANAGE_TEAM");
    const buyerLocations = locationListSchema.parse((await api("acmeBuyer").get(`/v1/organizations/${acme}/locations`)).body);
    expect(buyerLocations.locations.map((location) => location.name)).toEqual(["Victoria Island"]);
  });
});

describe("raising permissions is high-risk (B2B-FR-091, TECH-03 §9)", () => {
  it("needs confirmation, then a recent email code, and is audited and emailed", async () => {
    const person = await newPerson("raise");
    const membershipId = await addMember(acme, person.userId, "VIEWER", [lekki]);
    const owner = await newPerson("raiseowner");
    await addMember(acme, owner.userId, "OWNER", "ALL");
    const body = { role: "APPROVER", allLocations: false, locationIds: [lekki], version: 1 };

    const unconfirmed = await change(owner.cookie, acme, membershipId, body);
    expectRule(unconfirmed, "CONFIRMATION_REQUIRED");
    expect(apiErrorSchema.parse(unconfirmed.body).context).toMatchObject({ raises: true, addedPermissions: [{ permission: "APPROVE_REQUESTS" }] });

    const noCode = await change(owner.cookie, acme, membershipId, { ...body, confirmed: true });
    expect({ status: noCode.status, code: noCode.body.code }).toEqual({ status: 403, code: "RECENT_EMAIL_CODE_REQUIRED" });
    expect((await membershipOf(acme, person.email)).role).toBe("VIEWER");

    await confirmEmail(owner.cookie, owner.email);
    const done = await change(owner.cookie, acme, membershipId, { ...body, confirmed: true });
    expect(done.status).toBe(200);
    expect(teamMemberSchema.parse(done.body)).toMatchObject({ role: "APPROVER", version: 2, permissions: [...ROLE_PRESETS.APPROVER], adjusted: false });
    const [entry] = await db().select().from(schema.auditLog).where(and(eq(schema.auditLog.action, "organization.member_changed"), eq(schema.auditLog.recordId, membershipId)));
    expect(entry!.after).toMatchObject({ role: "APPROVER", highRisk: true });
    expect(JSON.stringify(entry)).not.toContain(person.email);
    expect((await latestMail("organization_role_changed", person.email))?.data.role).toBe("Approver");

    // A stale version is refused.
    const stale = await change(owner.cookie, acme, membershipId, { ...body, role: "VIEWER", version: 1, confirmed: true });
    expect({ status: stale.status, code: stale.body.code }).toEqual({ status: 409, code: "VERSION_CONFLICT" });
  });

  it("lowering needs confirmation but no email code; Owners alone adjust a role's permissions", async () => {
    const person = await newPerson("lower");
    // Location Manager → Viewer only removes. (Buyer → Viewer would add "view organization records".)
    const membershipId = await addMember(acme, person.userId, "LOCATION_MANAGER", [victoriaIsland]);
    const body = { role: "VIEWER", allLocations: false, locationIds: [victoriaIsland], version: 1 };
    expectRule(await change(actors.acmeAdmin!, acme, membershipId, body), "CONFIRMATION_REQUIRED");
    expect((await change(actors.acmeAdmin!, acme, membershipId, { ...body, confirmed: true })).status).toBe(200);

    expectForbidden(await change(actors.acmeAdmin!, acme, membershipId, { ...body, permissions: ["VIEW_RECORDS", "VIEW_BILLING"], version: 2, confirmed: true }), "OWNER_REQUIRED_TO_ADJUST");
    expectForbidden(await change(actors.acmeAdmin!, acme, membershipId, { role: "OWNER", allLocations: true, version: 2, confirmed: true }), "OWNER_REQUIRED");
    const owner = await membershipOf(acme, TEST_PEOPLE.acmeOwner.email);
    expectForbidden(await change(actors.acmeAdmin!, acme, owner.id, { role: "ADMIN", allLocations: true, version: owner.version, confirmed: true }), "OWNER_REQUIRED");

    await confirmEmail(actors.acmeOwner!, TEST_PEOPLE.acmeOwner.email);
    const adjusted = await change(actors.acmeOwner!, acme, membershipId, { ...body, permissions: ["VIEW_RECORDS", "VIEW_BILLING"], version: 2, confirmed: true });
    expect(adjusted.status).toBe(200);
    expect(teamMemberSchema.parse(adjusted.body)).toMatchObject({ role: "VIEWER", permissions: ["VIEW_RECORDS", "VIEW_BILLING"], adjusted: true });
  });
});

describe("the last Owner (B2B-FR-092)", () => {
  it("can't be deactivated, downgraded or removed by anyone", async () => {
    const solo = await newPerson("solo");
    const created = await db().transaction((tx) => createOrganization(tx, { name: "Solo Studio (TEST DATA)", locations: [{ name: "Yaba", city: "Lagos" }], ownerUserId: solo.userId }));
    const helper = await newPerson("soloadmin");
    await addMember(created.organizationId, helper.userId, "ADMIN", "ALL");
    await confirmEmail(solo.cookie, solo.email);
    expectRule(await change(solo.cookie, created.organizationId, created.membershipId, { role: "ADMIN", allLocations: true, version: 1, confirmed: true }), "LAST_OWNER");
    expectRule(await as(harness, solo.cookie).post(`/v1/organizations/${created.organizationId}/members/${created.membershipId}/deactivate`, { version: 1, confirmed: true }), "SELF");
    expectForbidden(await as(harness, helper.cookie).post(`/v1/organizations/${created.organizationId}/members/${created.membershipId}/deactivate`, { version: 1, confirmed: true }), "OWNER_REQUIRED");
    const [row] = await db().select().from(schema.memberships).where(eq(schema.memberships.id, created.membershipId));
    expect(row).toMatchObject({ role: "OWNER", status: "ACTIVE" });
  });

  it("two Owners demoting each other at once leave one Owner", async () => {
    const first = await newPerson("ownera");
    const created = await db().transaction((tx) => createOrganization(tx, { name: "Twin Owners (TEST DATA)", locations: [{ name: "Surulere", city: "Lagos" }], ownerUserId: first.userId }));
    const second = await newPerson("ownerb");
    const secondId = await addMember(created.organizationId, second.userId, "OWNER", "ALL");
    await confirmEmail(first.cookie, first.email);
    await confirmEmail(second.cookie, second.email);
    const results = await Promise.all([
      change(first.cookie, created.organizationId, secondId, { role: "ADMIN", allLocations: true, version: 1, confirmed: true }),
      change(second.cookie, created.organizationId, created.membershipId, { role: "ADMIN", allLocations: true, version: 1, confirmed: true }),
    ]);
    const statuses = results.map((response) => response.status).sort();
    // One wins; the other is refused (last owner) or no longer allowed (it was demoted first).
    expect(statuses[0]).toBe(200);
    expect([403, 422]).toContain(statuses[1]);
    const owners = await db()
      .select()
      .from(schema.memberships)
      .where(and(eq(schema.memberships.organizationId, created.organizationId), eq(schema.memberships.role, "OWNER"), eq(schema.memberships.status, "ACTIVE")));
    expect(owners).toHaveLength(1);
  });

  it("ownership moves by transfer: confirmation, a recent email code and an audit entry", async () => {
    const owner = await newPerson("transfer");
    const created = await db().transaction((tx) => createOrganization(tx, { name: "Handover Ltd (TEST DATA)", locations: [{ name: "Ikoyi", city: "Lagos" }], ownerUserId: owner.userId }));
    const next = await newPerson("transfernext");
    const nextId = await addMember(created.organizationId, next.userId, "ADMIN", "ALL");
    const path = `/v1/organizations/${created.organizationId}/ownership-transfer`;
    expectForbidden(await as(harness, next.cookie).post(path, { membershipId: created.membershipId, stepDown: false, confirmed: true }), "OWNER_REQUIRED");
    expectRule(await as(harness, owner.cookie).post(path, { membershipId: nextId, stepDown: true }), "CONFIRMATION_REQUIRED");
    const noCode = await as(harness, owner.cookie).post(path, { membershipId: nextId, stepDown: true, confirmed: true });
    expect(noCode.body.code).toBe("RECENT_EMAIL_CODE_REQUIRED");
    await confirmEmail(owner.cookie, owner.email);
    const done = await as(harness, owner.cookie).post(path, { membershipId: nextId, stepDown: true, confirmed: true });
    expect(done.status).toBe(200);
    const team = teamSchema.parse(done.body);
    expect(team.members.map((member) => [member.isYou, member.role])).toEqual([
      [false, "OWNER"],
      [true, "ADMIN"],
    ]);
    expect(team.activeOwners).toBe(1);
    const [entry] = await db().select().from(schema.auditLog).where(and(eq(schema.auditLog.action, "organization.ownership_transferred"), eq(schema.auditLog.recordId, created.organizationId)));
    expect(entry!.after).toMatchObject({ newOwnerRole: "OWNER", previousOwnerRole: "ADMIN", highRisk: true });
  });
});

describe("deactivation (B2B-FR-093)", () => {
  it("a deactivated member loses access on their very next request; their history stays", async () => {
    const person = await newPerson("leaver");
    const membershipId = await addMember(acme, person.userId, "VIEWER", [lekki]);
    const client = as(harness, person.cookie);
    expect((await client.get(`/v1/organizations/${acme}/locations`)).status).toBe(200);

    expectRule(await api("acmeOwner").post(`/v1/organizations/${acme}/members/${membershipId}/deactivate`, { version: 1 }), "CONFIRMATION_REQUIRED");
    const deactivated = await api("acmeOwner").post(`/v1/organizations/${acme}/members/${membershipId}/deactivate`, { version: 1, confirmed: true });
    expect(teamMemberSchema.parse(deactivated.body).status).toBe("DEACTIVATED");

    // Same session, next request.
    expectHidden(await client.get(`/v1/organizations/${acme}`));
    expectHidden(await client.get(`/v1/organizations/${acme}/locations/${lekki}`));
    expect((await client.get("/v1/me/organizations")).body).toEqual({ organizations: [] });
    const [row] = await db().select().from(schema.memberships).where(eq(schema.memberships.id, membershipId));
    expect(row).toMatchObject({ status: "DEACTIVATED", userId: person.userId });
    expect((await teamOf("acmeOwner")).members.find((member) => member.membershipId === membershipId)?.status).toBe("DEACTIVATED");

    // Bringing them back raises their access: confirmation and an email code.
    const admin = await newPerson("reactivator");
    await addMember(acme, admin.userId, "ADMIN", "ALL");
    const noCode = await as(harness, admin.cookie).post(`/v1/organizations/${acme}/members/${membershipId}/reactivate`, { version: 2, confirmed: true });
    expect(noCode.body.code).toBe("RECENT_EMAIL_CODE_REQUIRED");
    await confirmEmail(admin.cookie, admin.email);
    expect((await as(harness, admin.cookie).post(`/v1/organizations/${acme}/members/${membershipId}/reactivate`, { version: 2, confirmed: true })).status).toBe(200);
    expect((await client.get(`/v1/organizations/${acme}`)).status).toBe(200);
  });
});

describe("invitations (B2B-FR-090, TECH-03 §11)", () => {
  const latestInvitation = async (email: string) => {
    const mail = await latestMail("organization_invitation", email);
    return mail!.data.url!.split("/invitations#")[1]!;
  };

  it("invite, open, and accept only with the invited, verified email; one use", async () => {
    const email = `new.${randomUUID().slice(0, 8)}@people.test`;
    const invite = await api("acmeOwner").post(`/v1/organizations/${acme}/invitations`, { email: email.toUpperCase(), role: "BUYER", allLocations: false, locationIds: [victoriaIsland] });
    expect(invite.status).toBe(200);
    expect(invite.body).toMatchObject({ email, role: "BUYER", status: "PENDING", locations: [{ name: "Victoria Island" }] });
    const token = await latestInvitation(email);
    // Only the hash is stored, and the audit entry never names the person.
    const [row] = await db().select().from(schema.invitations).where(eq(schema.invitations.id, invite.body.id));
    expect(row!.secretHash).not.toContain(token);
    expect(row!.expiresAt.getTime() - row!.createdAt.getTime()).toBeGreaterThan(6.9 * 86_400_000);
    const [entry] = await db().select().from(schema.auditLog).where(eq(schema.auditLog.action, "organization.member_invited")).orderBy(desc(schema.auditLog.occurredAt)).limit(1);
    expect(JSON.stringify(entry)).not.toContain(email);

    expectRule(await api("acmeOwner").post(`/v1/organizations/${acme}/invitations`, { email, role: "VIEWER", allLocations: true }), "ALREADY_INVITED");
    expectRule(await api("acmeOwner").post(`/v1/organizations/${acme}/invitations`, { email: TEST_PEOPLE.acmeViewer.email, role: "VIEWER", allLocations: true }), "ALREADY_MEMBER");
    expect((await api("acmeOwner").post(`/v1/organizations/${acme}/invitations`, { email: "owner@acme.test", role: "OWNER", allLocations: true })).status).toBe(400);

    const preview = invitationPreviewSchema.parse((await request(harness.url).get("/v1/invitations/preview").set("x-hp-invitation", token)).body);
    expect(preview).toMatchObject({ status: "PENDING", organizationName: "ACME Hospitality Group (TEST DATA)", role: "BUYER" });
    expect(preview.invitedEmail).not.toBe(email);
    expect((await request(harness.url).get("/v1/invitations/preview").set("x-hp-invitation", "x".repeat(43))).status).toBe(404);

    expect((await api("signedOut").post("/v1/invitations/accept", { token })).status).toBe(401);
    expectRule(await api("customerAmaka").post("/v1/invitations/accept", { token }), "WRONG_ACCOUNT");

    // The right email, not yet verified.
    const signUp = await request(harness.url).post("/v1/auth/sign-up/email").set("origin", TEST_WEB_ORIGIN).send({ name: "New Buyer (TEST DATA)", email, password: PASSWORD });
    expect(signUp.status).toBe(200);
    const unverified = cookieOf(signUp);
    expectRule(await as(harness, unverified).post("/v1/invitations/accept", { token }), "VERIFY_EMAIL_FIRST");
    await db().update(schema.users).set({ emailVerified: true }).where(eq(schema.users.email, email));
    const accepted = await as(harness, unverified).post("/v1/invitations/accept", { token });
    expect(accepted.status).toBe(200);
    expect(accepted.body).toEqual({ organizationId: acme });
    const mine = myOrganizationsSchema.parse((await as(harness, unverified).get("/v1/me/organizations")).body);
    expect(mine.organizations[0]!.me).toMatchObject({ role: "BUYER", allLocations: false, locations: [{ name: "Victoria Island" }], permissions: [...ROLE_PRESETS.BUYER] });
    expectRule(await as(harness, unverified).post("/v1/invitations/accept", { token }), "INVITATION_ACCEPTED");
  });

  it("revoked and expired invitations fail; the daily job marks expiry", async () => {
    const revokedEmail = `revoked.${randomUUID().slice(0, 8)}@people.test`;
    const revoked = await api("acmeAdmin").post(`/v1/organizations/${acme}/invitations`, { email: revokedEmail, role: "VIEWER", allLocations: true });
    const revokedToken = await latestInvitation(revokedEmail);
    expectForbidden(await api("acmeViewer").post(`/v1/organizations/${acme}/invitations/${revoked.body.id}/revoke`));
    expectHidden(await as(harness, actors.customerChidi!).post(`/v1/organizations/${other.organizationId}/invitations/${revoked.body.id}/revoke`));
    expect((await api("acmeAdmin").post(`/v1/organizations/${acme}/invitations/${revoked.body.id}/revoke`)).status).toBe(200);
    const revokedPerson = await newPerson("revokedperson");
    await db().update(schema.invitations).set({ emailNormalized: revokedPerson.email }).where(eq(schema.invitations.id, revoked.body.id));
    expectRule(await as(harness, revokedPerson.cookie).post("/v1/invitations/accept", { token: revokedToken }), "INVITATION_REVOKED");

    const late = await newPerson("late");
    const expired = await api("acmeOwner").post(`/v1/organizations/${acme}/invitations`, { email: late.email, role: "VIEWER", allLocations: true });
    const expiredToken = await latestInvitation(late.email);
    await db().update(schema.invitations).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.invitations.id, expired.body.id));
    expect(invitationPreviewSchema.parse((await request(harness.url).get("/v1/invitations/preview").set("x-hp-invitation", expiredToken)).body).status).toBe("EXPIRED");
    expectRule(await as(harness, late.cookie).post("/v1/invitations/accept", { token: expiredToken }), "INVITATION_EXPIRED");
    expect(await expireInvitations(db(), new Date())).toBeGreaterThanOrEqual(1);
    const [row] = await db().select().from(schema.invitations).where(eq(schema.invitations.id, expired.body.id));
    expect(row!.status).toBe("EXPIRED");
    // A new invitation can replace an expired one.
    expect((await api("acmeOwner").post(`/v1/organizations/${acme}/invitations`, { email: late.email, role: "VIEWER", allLocations: true })).status).toBe(200);
  });

  it("re-inviting a deactivated member brings them back with the new role", async () => {
    const person = await newPerson("returner");
    const membershipId = await addMember(acme, person.userId, "VIEWER", [lekki]);
    expect((await api("acmeOwner").post(`/v1/organizations/${acme}/members/${membershipId}/deactivate`, { version: 1, confirmed: true })).status).toBe(200);
    expect((await api("acmeOwner").post(`/v1/organizations/${acme}/invitations`, { email: person.email, role: "LOCATION_MANAGER", allLocations: false, locationIds: [lekki] })).status).toBe(200);
    const token = await latestInvitation(person.email);
    expect((await as(harness, person.cookie).post("/v1/invitations/accept", { token })).status).toBe(200);
    const [row] = await db().select().from(schema.memberships).where(eq(schema.memberships.id, membershipId));
    expect(row).toMatchObject({ status: "ACTIVE", role: "LOCATION_MANAGER" });
  });
});

describe("locations (B2B-FR-002)", () => {
  it("team managers with All locations add and rename locations; names stay unique", async () => {
    const created = await api("acmeAdmin").post(`/v1/organizations/${acme}/locations`, { name: "Ikeja", city: "Lagos" });
    expect(created.status).toBe(200);
    const location = locationDetailSchema.parse(created.body);
    expect(location).toMatchObject({ name: "Ikeja", city: "Lagos", version: 1 });
    const duplicate = await api("acmeAdmin").post(`/v1/organizations/${acme}/locations`, { name: "ikeja", city: "Lagos" });
    expect(apiErrorSchema.parse(duplicate.body).fieldErrors).toHaveProperty("name");
    const renamed = await api("acmeAdmin").patch(`/v1/organizations/${acme}/locations/${location.id}`).send({ name: "Ikeja GRA", city: "Lagos", version: 1 });
    expect(locationDetailSchema.parse(renamed.body)).toMatchObject({ name: "Ikeja GRA", version: 2 });
    const stale = await api("acmeAdmin").patch(`/v1/organizations/${acme}/locations/${location.id}`).send({ name: "Ikeja", city: "Lagos", version: 1 });
    expect(stale.body.code).toBe("VERSION_CONFLICT");
    expectForbidden(await api("acmeLekkiManager").post(`/v1/organizations/${acme}/locations`, { name: "Ajah", city: "Lagos" }), "MANAGE_TEAM");
  });
});

describe("workspace requests (owner decision 2026-10-08)", () => {
  it("a verified customer asks; staff with ORGANIZATION_APPROVE approve; the requester becomes Owner", async () => {
    const unverifiedEmail = `unverified.${randomUUID().slice(0, 8)}@people.test`;
    const signUp = await request(harness.url).post("/v1/auth/sign-up/email").set("origin", TEST_WEB_ORIGIN).send({ name: "Unverified (TEST DATA)", email: unverifiedEmail, password: PASSWORD });
    const body = { companyName: "Amaka Events (TEST DATA)", locations: [{ name: "Lekki", city: "Lagos" }, { name: "Abuja", city: "Abuja" }], teamSize: "11-50", note: "Uniforms for 40 people" };
    expectRule(await as(harness, cookieOf(signUp)).post("/v1/me/organization-request", body), "VERIFY_EMAIL_FIRST");
    expect((await api("customerAmaka").post("/v1/me/organization-request", { ...body, locations: [] })).status).toBe(400);

    const submitted = await api("customerAmaka").post("/v1/me/organization-request", body);
    expect(submitted.status).toBe(200);
    const pending = organizationRequestSchema.parse(submitted.body);
    expect(pending.status).toBe("PENDING");
    expectRule(await api("customerAmaka").post("/v1/me/organization-request", body), "REQUEST_PENDING");
    expect((await latestMail("organization_request_staff", TEST_HELP_INBOX))?.data.company).toBe(body.companyName);
    expect((await api("customerAmaka").get("/v1/me/organization-request")).body.request).toMatchObject({ id: pending.id, status: "PENDING" });

    // Staff without the permission get 403; non-staff never learn the route exists.
    expectForbidden(await api("financeFolake").get("/v1/admin/organization-requests"), "ORGANIZATION_APPROVE");
    expectHidden(await api("customerChidi").get("/v1/admin/organization-requests"));
    expectHidden(await api("customerChidi").post(`/v1/admin/organization-requests/${pending.id}/approve`));

    const queue = (await api("adminAda").get("/v1/admin/organization-requests?status=PENDING")).body.requests as unknown[];
    expect(queue.map((row) => adminOrganizationRequestSchema.parse(row).id)).toContain(pending.id);
    const approved = adminOrganizationRequestSchema.parse((await api("adminAda").post(`/v1/admin/organization-requests/${pending.id}/approve`)).body);
    expect(approved).toMatchObject({ status: "APPROVED", decidedBy: TEST_PEOPLE.adminAda.name });
    expectRule(await api("adminAda").post(`/v1/admin/organization-requests/${pending.id}/approve`), "ALREADY_DECIDED");

    const mine = myOrganizationsSchema.parse((await api("customerAmaka").get("/v1/me/organizations")).body);
    expect(mine.organizations).toHaveLength(1);
    expect(mine.organizations[0]).toMatchObject({ id: approved.organizationId, name: body.companyName, me: { role: "OWNER", allLocations: true } });
    expect(mine.organizations[0]!.me.locations.map((location) => location.name)).toEqual(["Abuja", "Lekki"]);
    expect((await latestMail("organization_request_approved", TEST_PEOPLE.customerAmaka.email))?.data.url).toContain(`/workspace/${approved.organizationId}/team`);
    const [entry] = await db().select().from(schema.auditLog).where(and(eq(schema.auditLog.action, "organization.request_approved"), eq(schema.auditLog.recordId, pending.id)));
    expect(entry!.permission).toBe("ORGANIZATION_APPROVE");
  });

  it("declining needs a reason, emails the requester, and lets them ask again", async () => {
    const person = await newPerson("declined");
    const client = as(harness, person.cookie);
    const body = { companyName: "Maybe Ltd (TEST DATA)", locations: [{ name: "Yaba", city: "Lagos" }], teamSize: "1-10", note: null };
    const pending = organizationRequestSchema.parse((await client.post("/v1/me/organization-request", body)).body);
    expect((await api("adminAda").post(`/v1/admin/organization-requests/${pending.id}/decline`, { reason: "" })).status).toBe(400);
    const declined = await api("adminAda").post(`/v1/admin/organization-requests/${pending.id}/decline`, { reason: "We couldn't confirm the company details." });
    expect(adminOrganizationRequestSchema.parse(declined.body)).toMatchObject({ status: "DECLINED", declineReason: "We couldn't confirm the company details.", organizationId: null });
    expect((await latestMail("organization_request_declined", person.email))?.data.reason).toContain("confirm");
    expect((await client.get("/v1/me/organizations")).body).toEqual({ organizations: [] });
    expect((await client.post("/v1/me/organization-request", body)).status).toBe(200);
  });
});

describe("staff support view (OPS-FR-080–081)", () => {
  it("is read only and needs ORGANIZATION_SUPPORT", async () => {
    const list = adminOrganizationListSchema.parse((await api("adminAda").get("/v1/admin/organizations?q=acme")).body);
    expect(list.organizations.map((organization) => organization.name)).toEqual(["ACME Hospitality Group (TEST DATA)"]);
    expect(list.organizations[0]).toMatchObject({ locationCount: expect.any(Number), activeMembers: expect.any(Number) });
    const detail = adminOrganizationSchema.parse((await api("adminAda").get(`/v1/admin/organizations/${acme}`)).body);
    expect(detail.members.map((member) => member.role)).toContain("LOCATION_MANAGER");
    expect(detail.invitations.length).toBeGreaterThan(0);
    expect(JSON.stringify(detail)).not.toMatch(/secret/i);

    expectForbidden(await api("financeFolake").get("/v1/admin/organizations"), "ORGANIZATION_SUPPORT");
    expectHidden(await api("acmeOwner").get(`/v1/admin/organizations/${acme}`));
    expectHidden(await api("signedOut").get("/v1/admin/organizations"));
    // There are no staff write routes for organizations: staff never act as the customer.
    expectHidden(await api("adminAda").patch(`/v1/admin/organizations/${acme}`).send({ name: "Changed" }));
    expectHidden(await api("adminAda").post(`/v1/admin/organizations/${acme}/members`, {}));
    expectHidden(await api("adminAda").post(`/v1/organizations/${acme}/invitations`, { email: "staff@acme.test", role: "VIEWER", allLocations: true }));
  });
});
