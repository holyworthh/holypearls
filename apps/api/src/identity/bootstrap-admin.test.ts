import { and, eq, schema, withTransaction } from "@holypearls/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "../testing/harness.js";
import { bootstrapStaffAdmin } from "./bootstrap-admin.js";

let harness: Harness;
beforeAll(async () => {
  harness = await createHarness();
});
afterAll(() => harness?.close());

class Rollback extends Error {}

describe("first staff admin (ATTENTION 2)", () => {
  it("refuses while an active STAFF_ADMIN exists", async () => {
    await expect(bootstrapStaffAdmin(harness.database.db, { email: "first@example.com", name: "First Admin" })).rejects.toThrow(/already has an active staff admin/);
  });

  it("refuses an invalid email or a blank name", async () => {
    await expect(bootstrapStaffAdmin(harness.database.db, { email: "not-an-email", name: "A" })).rejects.toThrow(/email/i);
    await expect(bootstrapStaffAdmin(harness.database.db, { email: "a@example.com", name: "  " })).rejects.toThrow(/name/i);
  });

  it("creates one STAFF_ADMIN without an authenticator and a one-time password, then refuses a second", async () => {
    await expect(
      withTransaction(harness.database.db, async (tx) => {
        await tx.update(schema.staffProfiles).set({ status: "DEACTIVATED" });
        const result = await bootstrapStaffAdmin(tx, { email: "First@Example.com", name: "First Admin" });
        expect(result.password.length).toBeGreaterThanOrEqual(20);
        const [user] = await tx.select().from(schema.users).where(eq(schema.users.email, "first@example.com"));
        expect(user?.twoFactorEnabled).toBeFalsy();
        const grants = await tx
          .select({ permission: schema.staffPermissionGrants.permission })
          .from(schema.staffPermissionGrants)
          .innerJoin(schema.staffProfiles, eq(schema.staffProfiles.id, schema.staffPermissionGrants.staffProfileId))
          .where(and(eq(schema.staffProfiles.userId, user!.id), eq(schema.staffProfiles.status, "ACTIVE")));
        expect(grants.map((grant) => grant.permission)).toEqual(["STAFF_ADMIN"]);
        const [audit] = await tx.select().from(schema.auditLog).where(eq(schema.auditLog.action, "staff.bootstrap_admin"));
        expect(audit?.actorType).toBe("SYSTEM");
        expect(JSON.stringify(audit)).not.toContain(result.password);
        await expect(bootstrapStaffAdmin(tx, { email: "second@example.com", name: "Second" })).rejects.toThrow(/already has an active staff admin/);
        throw new Rollback();
      }),
    ).rejects.toBeInstanceOf(Rollback);
  });

  it("refuses an email that already has an account", async () => {
    await expect(
      withTransaction(harness.database.db, async (tx) => {
        await tx.update(schema.staffProfiles).set({ status: "DEACTIVATED" });
        const [someone] = await tx.select({ email: schema.users.email }).from(schema.users).limit(1);
        await expect(bootstrapStaffAdmin(tx, { email: someone!.email, name: "Dup" })).rejects.toThrow(/already has an account/);
        throw new Rollback();
      }),
    ).rejects.toBeInstanceOf(Rollback);
  });
});
