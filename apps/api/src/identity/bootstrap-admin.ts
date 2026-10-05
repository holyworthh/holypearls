import { hashPassword } from "@holypearls/auth";
import { and, type Database, eq, newId, schema, type Transaction } from "@holypearls/db";
import { randomBytes } from "node:crypto";
import { recordAudit } from "../platform/audit.js";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Creates the first STAFF_ADMIN on an environment with none (ATTENTION 2).
 * The account has a one-time random password and no authenticator, so the
 * first sign-in makes them set one up (TECH-03 §3). Refused once any active
 * STAFF_ADMIN exists: after that, staff are added from the admin.
 */
export async function bootstrapStaffAdmin(db: Database | Transaction, input: { email: string; name: string }) {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!EMAIL.test(email)) throw new Error("Enter a valid email address.");
  if (!name) throw new Error("Enter the admin's name.");

  const run = async (tx: Transaction) => {
    const [admin] = await tx
      .select({ id: schema.staffProfiles.id })
      .from(schema.staffPermissionGrants)
      .innerJoin(schema.staffProfiles, eq(schema.staffProfiles.id, schema.staffPermissionGrants.staffProfileId))
      .where(and(eq(schema.staffPermissionGrants.permission, "STAFF_ADMIN"), eq(schema.staffProfiles.status, "ACTIVE")))
      .limit(1);
    if (admin) throw new Error("This environment already has an active staff admin. Add staff from the admin instead.");
    const [existing] = await tx.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email));
    if (existing) throw new Error("That email already has an account.");

    const password = randomBytes(18).toString("base64url");
    const userId = newId();
    await tx.insert(schema.users).values({ id: userId, name, email, emailVerified: true, twoFactorEnabled: false });
    await tx.insert(schema.accounts).values({ userId, accountId: userId, providerId: "credential", password: await hashPassword(password) });
    const [profile] = await tx.insert(schema.staffProfiles).values({ userId, displayName: name }).returning({ id: schema.staffProfiles.id });
    await tx.insert(schema.staffPermissionGrants).values({ staffProfileId: profile!.id, permission: "STAFF_ADMIN" });
    await recordAudit(tx, null, {
      action: "staff.bootstrap_admin",
      summary: `First staff admin ${name} created from the command line`,
      recordType: "staff_profile",
      recordId: profile!.id,
      after: { permissions: ["STAFF_ADMIN"] },
      permission: "STAFF_ADMIN",
    });
    return { staffProfileId: profile!.id, password };
  };
  return db.transaction(run);
}
