import { apiErrorSchema, staffInvitationPreviewSchema, staffInvitationSchema, staffListSchema, staffMemberSchema } from "@holypearls/contracts";
import { and, desc, eq, schema, sql } from "@holypearls/db";
import { insertTestPerson } from "@holypearls/auth";
import { unseal } from "@holypearls/email";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { as, expectHidden, signInActors, type Actors } from "../testing/actors.js";
import { createHarness, type Harness, TEST_AUTH_SECRET, TEST_SEAL_KEY, TEST_WEB_ORIGIN } from "../testing/harness.js";

/*
 * T13-05b: staff user administration (PRD-06 §2, §18; TECH-03 §8–11; Pen
 * 122). Done when: the last two STAFF_ADMIN can't be reduced to one.
 */

vi.setConfig({ testTimeout: 300_000 });

let harness: Harness;
let actors: Partial<Actors>;
const PASSWORD = "a-long-test-password-123";
const db = () => harness.database.db;
const ada = () => as(harness, actors.adminAda!);
const profileOf = async (email: string) =>
  (await db().select({ id: schema.staffProfiles.id }).from(schema.staffProfiles).innerJoin(schema.users, eq(schema.users.id, schema.staffProfiles.userId)).where(eq(schema.users.email, email)))[0]!.id;
const reason = (response: request.Response) => apiErrorSchema.parse(response.body).context?.reason;
const secretFor = async (email: string) => {
  const [mail] = await db().select().from(schema.notifications).where(and(eq(schema.notifications.template, "staff_invitation"), eq(schema.notifications.recipient, email))).orderBy(desc(schema.notifications.createdAt)).limit(1);
  return (unseal(mail!.sealedData!, TEST_SEAL_KEY) as { url: string }).url.split("/invitations#")[1]!;
};
/** A signed-in customer account with a verified email. */
async function person(label: string) {
  const email = `${label}.${randomUUID().slice(0, 8)}@holypearls.test`;
  await db().transaction((tx) => insertTestPerson(tx, { key: label, name: `${label} (TEST DATA)`, email, password: PASSWORD }, TEST_AUTH_SECRET));
  const response = await request(harness.url).post("/v1/auth/sign-in/email").set("origin", TEST_WEB_ORIGIN).send({ email, password: PASSWORD });
  const cookie = ((response.headers["set-cookie"] as unknown as string[]) ?? []).map((line) => line.split(";")[0]).join("; ");
  return { email, cookie };
}

beforeAll(async () => {
  harness = await createHarness();
  actors = await signInActors(harness, ["adminAda", "adminTunde", "financeFolake", "customerChidi"]);
});

afterAll(async () => {
  await harness?.close();
});

describe("staff administration (TECH-03 §8–11)", () => {
  it("Done when: the last two STAFF_ADMIN can't be reduced to one", async () => {
    const tunde = await profileOf("tunde.staff@holypearls.test");
    const list = staffListSchema.parse((await ada().get("/v1/admin/staff")).body);
    expect(list.members.filter((member) => member.permissions.includes("STAFF_ADMIN") && member.status === "ACTIVE").map((member) => member.name)).toEqual(["Ada Okafor (TEST DATA)", "Tunde Bello (TEST DATA)"]);
    expect(staffMemberSchema.parse((await ada().get(`/v1/admin/staff/${tunde}`)).body).activeStaffAdmins).toHaveLength(2);

    // Removing STAFF_ADMIN, or deactivating its holder, is refused at two.
    const revoke = await ada().delete(`/v1/admin/staff/${tunde}/permissions/STAFF_ADMIN`);
    expect(revoke.status).toBe(403);
    expect(reason(revoke)).toBe("MINIMUM_STAFF_ADMINS");
    const deactivate = await ada().post(`/v1/admin/staff/${tunde}/deactivate`);
    expect(deactivate.status).toBe(403);
    expect(apiErrorSchema.parse(deactivate.body)).toMatchObject({ context: { reason: "MINIMUM_STAFF_ADMINS" }, message: expect.stringMatching(/are the only STAFF_ADMIN/) });
    // Nobody deactivates themselves.
    expect((await ada().post(`/v1/admin/staff/${await profileOf("ada.staff@holypearls.test")}/deactivate`)).status).toBe(403);

    // A third STAFF_ADMIN joins by invitation; then one can be removed, and the floor holds again at two.
    const third = await person("thirdadmin");
    const invited = await ada().post("/v1/admin/staff/invitations", { email: third.email, name: "Third Admin (TEST DATA)", permissions: ["STAFF_ADMIN"] });
    expect(invited.status).toBe(201);
    expect((await as(harness, third.cookie).post("/v1/staff-invitations/accept", { token: await secretFor(third.email) })).status).toBe(200);
    expect((await ada().delete(`/v1/admin/staff/${tunde}/permissions/STAFF_ADMIN`)).status).toBe(200);
    const thirdId = await profileOf(third.email);
    expect(reason(await ada().post(`/v1/admin/staff/${thirdId}/deactivate`))).toBe("MINIMUM_STAFF_ADMINS");
    // Two removals at once can't both pass the count.
    await ada().post(`/v1/admin/staff/${tunde}/permissions`, { permission: "STAFF_ADMIN" });
    const both = await Promise.all([ada().delete(`/v1/admin/staff/${tunde}/permissions/STAFF_ADMIN`), ada().delete(`/v1/admin/staff/${thirdId}/permissions/STAFF_ADMIN`)]);
    expect(both.map((response) => response.status).sort()).toEqual([200, 403]);
    expect((await db().execute<{ n: number }>(sql`select count(*)::int as n from staff_permission_grants g join staff_profiles p on p.id = g.staff_profile_id where g.permission = 'STAFF_ADMIN' and p.status = 'ACTIVE'`)).rows[0]!.n).toBe(2);
  });

  it("invites by email with permissions (MFA), accepts with the invited verified email, deactivates and ends sessions", async () => {
    const newcomer = await person("segun");
    // Inviting with permissions raises access: an old MFA check isn't enough.
    await db().execute(sql`update sessions set mfa_verified_at = now() - interval '16 minutes'`);
    const stale = await ada().post("/v1/admin/staff/invitations", { email: newcomer.email, name: "Segun (TEST DATA)", permissions: ["PRODUCTION_MANAGE"] });
    expect(apiErrorSchema.parse(stale.body).code).toBe("RECENT_MFA_REQUIRED");
    await db().execute(sql`update sessions set mfa_verified_at = now()`);
    const invitation = staffInvitationSchema.parse((await ada().post("/v1/admin/staff/invitations", { email: newcomer.email.toUpperCase(), name: "Segun (TEST DATA)", permissions: ["PRODUCTION_MANAGE"] })).body);
    expect(invitation).toMatchObject({ status: "PENDING", email: newcomer.email, permissions: ["PRODUCTION_MANAGE"] });
    expect(reason(await ada().post("/v1/admin/staff/invitations", { email: newcomer.email, name: "Segun", permissions: [] }))).toBe("ALREADY_INVITED");
    expect(staffListSchema.parse((await ada().get("/v1/admin/staff")).body).invitations.map((entry) => entry.id)).toContain(invitation.id);
    const [audit] = await db().select().from(schema.auditLog).where(and(eq(schema.auditLog.action, "staff.invited"), eq(schema.auditLog.recordId, invitation.id)));
    expect(audit).toMatchObject({ permission: "STAFF_ADMIN" });

    // Only STAFF_ADMIN manages staff; customers never see the routes.
    expect((await as(harness, actors.financeFolake!).get("/v1/admin/staff")).status).toBe(403);
    expectHidden(await as(harness, actors.customerChidi!).get("/v1/admin/staff"));

    const token = await secretFor(newcomer.email);
    const preview = staffInvitationPreviewSchema.parse((await request(harness.url).get("/v1/staff-invitations/preview").set("x-hp-invitation", token)).body);
    expect(preview).toMatchObject({ status: "PENDING", permissions: ["PRODUCTION_MANAGE"] });
    expect(preview.invitedEmail).not.toBe(newcomer.email);
    // Someone else's account can't take it.
    expect(reason(await as(harness, actors.customerChidi!).post("/v1/staff-invitations/accept", { token }))).toBe("WRONG_ACCOUNT");
    expect((await as(harness, newcomer.cookie).post("/v1/staff-invitations/accept", { token })).status).toBe(200);
    expect(reason(await as(harness, newcomer.cookie).post("/v1/staff-invitations/accept", { token }))).toBe("INVITATION_ACCEPTED");
    const segun = await profileOf(newcomer.email);
    const member = staffMemberSchema.parse((await ada().get(`/v1/admin/staff/${segun}`)).body);
    expect(member).toMatchObject({ name: "Segun (TEST DATA)", permissions: ["PRODUCTION_MANAGE"], mfaEnabled: false, status: "ACTIVE" });
    expect(member.activeSessions).toBeGreaterThanOrEqual(1);

    // Deactivating ends access and every session; history is kept.
    const deactivated = staffMemberSchema.parse((await ada().post(`/v1/admin/staff/${segun}/deactivate`)).body);
    expect(deactivated).toMatchObject({ status: "DEACTIVATED", activeSessions: 0 });
    expect((await as(harness, newcomer.cookie).get("/v1/me")).status).toBe(401);
    expect((await db().select().from(schema.auditLog).where(and(eq(schema.auditLog.action, "staff.deactivated"), eq(schema.auditLog.recordId, segun)))).length).toBe(1);

    // Invited again, they come back with the new permissions.
    const again = staffInvitationSchema.parse((await ada().post("/v1/admin/staff/invitations", { email: newcomer.email, name: "Segun (TEST DATA)", permissions: ["FULFILMENT_MANAGE"] })).body);
    const back = await request(harness.url).post("/v1/auth/sign-in/email").set("origin", TEST_WEB_ORIGIN).send({ email: newcomer.email, password: PASSWORD });
    const cookie = ((back.headers["set-cookie"] as unknown as string[]) ?? []).map((line) => line.split(";")[0]).join("; ");
    expect((await as(harness, cookie).post("/v1/staff-invitations/accept", { token: await secretFor(newcomer.email) })).status).toBe(200);
    expect(staffMemberSchema.parse((await ada().get(`/v1/admin/staff/${segun}`)).body)).toMatchObject({ status: "ACTIVE", permissions: ["FULFILMENT_MANAGE"] });
    expect(again.status).toBe("PENDING");

    // A cancelled invitation can't be used.
    const later = await person("later");
    const cancelled = staffInvitationSchema.parse((await ada().post("/v1/admin/staff/invitations", { email: later.email, name: "Later (TEST DATA)", permissions: [] })).body);
    expect((await ada().post(`/v1/admin/staff/invitations/${cancelled.id}/revoke`)).status).toBe(200);
    expect(reason(await as(harness, later.cookie).post("/v1/staff-invitations/accept", { token: await secretFor(later.email) }))).toBe("INVITATION_REVOKED");
  });

  it("an MFA reset shows on the member with who did it", async () => {
    const tunde = await profileOf("tunde.staff@holypearls.test");
    expect((await ada().post(`/v1/admin/staff/${tunde}/mfa-reset`)).status).toBe(200);
    const member = staffMemberSchema.parse((await ada().get(`/v1/admin/staff/${tunde}`)).body);
    expect(member).toMatchObject({ mfaEnabled: false, activeSessions: 0, lastMfaReset: { by: "Ada Okafor (TEST DATA)" } });
  });
});
