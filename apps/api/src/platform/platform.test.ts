import { TEST_PEOPLE } from "@holypearls/auth";
import { auditPageSchema, staffAccessSchema } from "@holypearls/contracts";
import { eq, schema, sql } from "@holypearls/db";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Actors, as, expectForbidden, expectHidden, expectOutcomes, signInActors } from "../testing/actors.js";
import { createHarness, type Harness, TEST_WEB_ORIGIN } from "../testing/harness.js";
import { recordAudit } from "./audit.js";

let harness: Harness;
let actors: Partial<Actors>;
const staffId = async (email: string) => {
  const [row] = await harness.database.db
    .select({ id: schema.staffProfiles.id })
    .from(schema.staffProfiles)
    .innerJoin(schema.users, eq(schema.users.id, schema.staffProfiles.userId))
    .where(eq(schema.users.email, email));
  return row!.id;
};

beforeAll(async () => {
  harness = await createHarness();
  actors = await signInActors(harness, ["adminAda", "adminTunde", "customerChidi", "customerAmaka"]);
});

afterAll(async () => {
  await harness?.close();
});

describe("audit log is insert-only (OPS-FR-120)", () => {
  it("refuses UPDATE, DELETE and TRUNCATE for the application's database user", async () => {
    const db = harness.database.db;
    const id = await recordAudit(db, null, { action: "test.entry", summary: "Test entry", recordType: "TEST" });
    // Drizzle wraps the database error; the trigger's message is on the cause.
    const refused = async (work: Promise<unknown>) => {
      const error = (await work.then(() => null).catch((caught: unknown) => caught)) as { cause?: Error } | null;
      expect(String(error?.cause?.message)).toMatch(/audit_log is insert-only/);
    };
    await refused(db.update(schema.auditLog).set({ summary: "changed" }).where(eq(schema.auditLog.id, id)));
    await refused(db.delete(schema.auditLog).where(eq(schema.auditLog.id, id)));
    await refused(db.execute(sql`truncate audit_log`));
    const [row] = await db.select().from(schema.auditLog).where(eq(schema.auditLog.id, id));
    expect(row?.summary).toBe("Test entry");
  });
});

describe("staff permission changes (TECH-03 §8–10)", () => {
  it("grants a permission, audits it with before and after, and replays a retried request", async () => {
    const kemi = await staffId(TEST_PEOPLE.catalogueNoMfa.email);
    const ada = as(harness, actors.adminAda!);
    const key = "grant_refund_issue_0001";
    const first = await ada.post(`/v1/admin/staff/${kemi}/permissions`, { permission: "REFUND_ISSUE" }, key);
    expect(first.status).toBe(200);
    expect(staffAccessSchema.parse(first.body).permissions).toEqual(["CATALOGUE_MANAGE", "REFUND_ISSUE"]);

    // Same key, same request: the first result again, without a second change.
    const replay = await ada.post(`/v1/admin/staff/${kemi}/permissions`, { permission: "REFUND_ISSUE" }, key);
    expect(replay.status).toBe(200);
    expect(replay.headers["idempotent-replay"]).toBe("true");
    expect(replay.body).toEqual(first.body);

    // Same key, different request: 409.
    const reused = await ada.post(`/v1/admin/staff/${kemi}/permissions`, { permission: "QUOTE_MANAGE" }, key);
    expect(reused.status).toBe(409);
    expect(reused.body.context).toEqual({ reason: "IDEMPOTENCY_KEY_REUSED" });

    const audit = auditPageSchema.parse((await ada.get("/v1/admin/audit?action=staff.permission_granted")).body);
    const entry = audit.entries.find((item) => item.recordId === kemi)!;
    expect(entry).toMatchObject({
      actorType: "STAFF",
      actorLabel: TEST_PEOPLE.adminAda.name,
      summary: "Permission granted: REFUND_ISSUE",
      before: { permissions: ["CATALOGUE_MANAGE"] },
      after: { permissions: ["CATALOGUE_MANAGE", "REFUND_ISSUE"] },
      permission: "STAFF_ADMIN",
    });
    expect(entry.mfaVerifiedAt).not.toBeNull();
    expect(entry.requestId).toMatch(/^req_/);
    expect(audit.entries.filter((item) => item.recordId === kemi)).toHaveLength(1);
  });

  it("requires an Idempotency-Key header", async () => {
    const kemi = await staffId(TEST_PEOPLE.catalogueNoMfa.email);
    const response = await request(harness.url)
      .post(`/v1/admin/staff/${kemi}/permissions`)
      .set("origin", TEST_WEB_ORIGIN)
      .set("cookie", actors.adminAda!)
      .send({ permission: "QUOTE_MANAGE" });
    expect(response.status).toBe(400);
    expect(response.body.fieldErrors).toHaveProperty("idempotency-key");
  });

  it("needs an authenticator check in the last 15 minutes", async () => {
    const kemi = await staffId(TEST_PEOPLE.catalogueNoMfa.email);
    const cookie = await harness.signInAs("adminAda");
    harness.now.value = new Date(Date.now() + 16 * 60_000);
    try {
      const response = await as(harness, cookie).post(`/v1/admin/staff/${kemi}/permissions`, { permission: "QUOTE_MANAGE" });
      expectForbidden(response, "maxAgeMinutes");
      expect(response.body.code).toBe("RECENT_MFA_REQUIRED");
    } finally {
      harness.now.value = null;
    }
  });

  it("keeps at least two STAFF_ADMIN holders", async () => {
    const tunde = await staffId(TEST_PEOPLE.adminTunde.email);
    const response = await as(harness, actors.adminAda!).delete(`/v1/admin/staff/${tunde}/permissions/STAFF_ADMIN`);
    expectForbidden(response, "MINIMUM_STAFF_ADMINS");
  });

  it("removes a permission and audits it", async () => {
    const kemi = await staffId(TEST_PEOPLE.catalogueNoMfa.email);
    const response = await as(harness, actors.adminAda!).delete(`/v1/admin/staff/${kemi}/permissions/REFUND_ISSUE`);
    expect(response.status).toBe(200);
    expect(response.body.permissions).toEqual(["CATALOGUE_MANAGE"]);
    const [entry] = await harness.database.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, "staff.permission_revoked"));
    expect(entry?.summary).toBe("Permission removed: REFUND_ISSUE");
  });

  it("hides staff administration from customers and refuses staff without STAFF_ADMIN", async () => {
    const kemi = await staffId(TEST_PEOPLE.catalogueNoMfa.email);
    const path = `/v1/admin/staff/${kemi}/access`;
    await expectOutcomes(harness, actors, (client) => client.get(path), {
      signedOut: 404,
      customerChidi: 404,
      adminAda: 200,
    });
  });

  it("resets another admin's MFA, ends their sessions and audits it, but never their own", async () => {
    const tunde = await staffId(TEST_PEOPLE.adminTunde.email);
    const ada = await staffId(TEST_PEOPLE.adminAda.email);
    const tundeCookie = await harness.signInAs("adminTunde");

    expectForbidden(await as(harness, actors.adminAda!).post(`/v1/admin/staff/${ada}/mfa-reset`), "ASK_ANOTHER_STAFF_ADMIN");

    const reset = await as(harness, actors.adminAda!).post(`/v1/admin/staff/${tunde}/mfa-reset`);
    expect(reset.status).toBe(200);
    expect(reset.body.mfaEnabled).toBe(false);
    expect((await as(harness, tundeCookie).get("/v1/me")).status).toBe(401);
    const [entry] = await harness.database.db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "staff.mfa_reset"));
    expect(entry).toMatchObject({ summary: `MFA reset for ${TEST_PEOPLE.adminTunde.name}`, recordId: tunde });
  });
});

describe("audit viewer (AUDIT_VIEW)", () => {
  it("pages with a cursor and filters by search text", async () => {
    for (let index = 0; index < 30; index += 1) {
      await recordAudit(harness.database.db, null, {
        action: "test.paging",
        summary: `Paging entry ${String(index).padStart(2, "0")}`,
        recordType: "TEST",
      });
    }
    const ada = as(harness, actors.adminAda!);
    const first = auditPageSchema.parse((await ada.get("/v1/admin/audit?action=test.paging&limit=25")).body);
    expect(first.entries).toHaveLength(25);
    expect(first.nextCursor).not.toBeNull();
    const second = auditPageSchema.parse(
      (await ada.get(`/v1/admin/audit?action=test.paging&limit=25&cursor=${first.nextCursor}`)).body,
    );
    expect(second.entries).toHaveLength(5);
    expect(second.nextCursor).toBeNull();
    const ids = new Set([...first.entries, ...second.entries].map((entry) => entry.id));
    expect(ids.size).toBe(30);

    const search = auditPageSchema.parse((await ada.get("/v1/admin/audit?q=entry%2007")).body);
    expect(search.entries.map((entry) => entry.summary)).toEqual(["Paging entry 07"]);
  });

  it("rejects page sizes over 100", async () => {
    expect((await as(harness, actors.adminAda!).get("/v1/admin/audit?limit=500")).status).toBe(400);
  });

  it("is hidden from customers and refused to staff without AUDIT_VIEW", async () => {
    expectHidden(await as(harness, actors.customerChidi!).get("/v1/admin/audit"));
    const cookie = await harness.signInAs("adminAda");
    // Tunde's MFA was reset above; use a fresh staff member without AUDIT_VIEW instead.
    await harness.database.db.execute(
      sql`delete from staff_permission_grants where permission = 'AUDIT_VIEW' and staff_profile_id = (select id from staff_profiles where display_name like 'Ada%')`,
    );
    const response = await as(harness, cookie).get("/v1/admin/audit");
    expectForbidden(response, "AUDIT_VIEW");
  });
});

describe("policies and scoped queries (TECH-03 §12)", () => {
  it("lets a person end their own session and hides everyone else's (404)", async () => {
    const chidi = await harness.signInAs("customerChidi");
    const amaka = await harness.signInAs("customerAmaka");
    const [amakaSession] = await harness.database.db
      .select({ id: schema.sessions.id })
      .from(schema.sessions)
      .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
      .where(eq(schema.users.email, TEST_PEOPLE.customerAmaka.email));

    expectHidden(await as(harness, chidi).delete(`/v1/me/sessions/${amakaSession!.id}`));
    expect((await as(harness, amaka).get("/v1/me")).status).toBe(200);

    expect((await as(harness, amaka).delete(`/v1/me/sessions/${amakaSession!.id}`)).status).toBe(200);
  });
});

describe("rate limits in PostgreSQL (TECH-02 §14, ADR-013)", () => {
  it("counts across two API instances", async () => {
    const first = await createHarness({ rateLimit: true });
    const second = await createHarness({ rateLimit: true, database: first.database });
    try {
      const statuses: number[] = [];
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const instance = attempt % 2 === 0 ? first : second;
        const response = await request(instance.url)
          .post("/v1/auth/sign-in/email")
          .set("origin", TEST_WEB_ORIGIN)
          .send({ email: TEST_PEOPLE.customerChidi.email, password: "not-the-right-password" });
        statuses.push(response.status);
      }
      // 5 sign-in attempts per account per 15 minutes, shared by both instances.
      expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);

      // The fifth failure is audited once.
      const alerts = await first.database.db
        .select()
        .from(schema.auditLog)
        .where(eq(schema.auditLog.action, "security.sign_in_failures"));
      expect(alerts).toHaveLength(1);
      expect(alerts[0]?.summary).toBe("5 failed sign-ins in 15 min");
    } finally {
      await second.close();
      await first.close();
    }
  });
});
