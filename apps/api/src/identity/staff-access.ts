import type { StaffAccess, StaffPermission } from "@holypearls/contracts";
import { and, type Database, eq, schema, withTransaction } from "@holypearls/db";
import { AppError } from "../errors.js";
import { recordAudit } from "../platform/audit.js";
import { enforce } from "../platform/policy.js";
import type { ActorContext } from "./actor.js";
import { canManageStaffAccess, canResetStaffMfa, canRevokePermission } from "./policies.js";

async function loadStaff(db: Database, staffProfileId: string) {
  const rows = await db
    .select({
      staffProfileId: schema.staffProfiles.id,
      userId: schema.staffProfiles.userId,
      displayName: schema.staffProfiles.displayName,
      mfaEnabled: schema.users.twoFactorEnabled,
      permission: schema.staffPermissionGrants.permission,
    })
    .from(schema.staffProfiles)
    .innerJoin(schema.users, eq(schema.users.id, schema.staffProfiles.userId))
    .leftJoin(schema.staffPermissionGrants, eq(schema.staffPermissionGrants.staffProfileId, schema.staffProfiles.id))
    .where(eq(schema.staffProfiles.id, staffProfileId));
  const first = rows[0];
  if (!first) throw new AppError("NOT_FOUND");
  return {
    staffProfileId: first.staffProfileId,
    userId: first.userId,
    displayName: first.displayName,
    mfaEnabled: first.mfaEnabled,
    permissions: rows.flatMap((row) => (row.permission ? [row.permission] : [])).sort(),
  };
}

const toAccess = (staff: Awaited<ReturnType<typeof loadStaff>>): StaffAccess => ({
  staffProfileId: staff.staffProfileId,
  displayName: staff.displayName,
  permissions: staff.permissions,
  mfaEnabled: staff.mfaEnabled,
});

export async function getStaffAccess(db: Database, actor: ActorContext, staffProfileId: string) {
  enforce(canManageStaffAccess(actor));
  return toAccess(await loadStaff(db, staffProfileId));
}

/** Raising someone's permissions is a high-risk action (TECH-03 §9); the caller checks MFA recency. */
export async function grantStaffPermission(db: Database, actor: ActorContext, staffProfileId: string, permission: StaffPermission) {
  enforce(canManageStaffAccess(actor));
  const before = await loadStaff(db, staffProfileId);
  if (before.permissions.includes(permission)) return toAccess(before);
  await withTransaction(db, async (tx) => {
    await tx.insert(schema.staffPermissionGrants).values({
      staffProfileId,
      permission,
      grantedByStaffId: actor.type === "user" ? (actor.staff?.staffProfileId ?? null) : null,
    });
    await recordAudit(tx, actor, {
      action: "staff.permission_granted",
      summary: `Permission granted: ${permission}`,
      recordType: "STAFF",
      recordId: staffProfileId,
      recordLabel: before.displayName,
      before: { permissions: before.permissions },
      after: { permissions: [...before.permissions, permission].sort() },
      permission: "STAFF_ADMIN",
    });
  });
  return toAccess(await loadStaff(db, staffProfileId));
}

export async function revokeStaffPermission(db: Database, actor: ActorContext, staffProfileId: string, permission: StaffPermission) {
  const before = await loadStaff(db, staffProfileId);
  const admins = await db
    .select({ id: schema.staffPermissionGrants.id })
    .from(schema.staffPermissionGrants)
    .innerJoin(schema.staffProfiles, eq(schema.staffProfiles.id, schema.staffPermissionGrants.staffProfileId))
    .where(and(eq(schema.staffPermissionGrants.permission, "STAFF_ADMIN"), eq(schema.staffProfiles.status, "ACTIVE")));
  enforce(canRevokePermission(actor, permission, admins.length));
  if (!before.permissions.includes(permission)) return toAccess(before);
  await withTransaction(db, async (tx) => {
    await tx
      .delete(schema.staffPermissionGrants)
      .where(and(eq(schema.staffPermissionGrants.staffProfileId, staffProfileId), eq(schema.staffPermissionGrants.permission, permission)));
    await recordAudit(tx, actor, {
      action: "staff.permission_revoked",
      summary: `Permission removed: ${permission}`,
      recordType: "STAFF",
      recordId: staffProfileId,
      recordLabel: before.displayName,
      before: { permissions: before.permissions },
      after: { permissions: before.permissions.filter((item) => item !== permission) },
      permission: "STAFF_ADMIN",
    });
  });
  return toAccess(await loadStaff(db, staffProfileId));
}

/**
 * Resets a staff member's authenticator: removes it, ends their sessions and
 * makes them set it up again on next sign-in (TECH-03 §10). Audited.
 */
export async function resetStaffMfa(db: Database, actor: ActorContext, staffProfileId: string) {
  const staff = await loadStaff(db, staffProfileId);
  enforce(canResetStaffMfa(actor, staff));
  await withTransaction(db, async (tx) => {
    await tx.delete(schema.twoFactors).where(eq(schema.twoFactors.userId, staff.userId));
    await tx.update(schema.users).set({ twoFactorEnabled: false }).where(eq(schema.users.id, staff.userId));
    await tx.delete(schema.sessions).where(eq(schema.sessions.userId, staff.userId));
    await recordAudit(tx, actor, {
      action: "staff.mfa_reset",
      summary: `MFA reset for ${staff.displayName}`,
      recordType: "STAFF",
      recordId: staffProfileId,
      recordLabel: staff.displayName,
      before: { mfaEnabled: staff.mfaEnabled },
      after: { mfaEnabled: false, sessionsEnded: true },
      permission: "STAFF_ADMIN",
    });
  });
  return toAccess(await loadStaff(db, staffProfileId));
}
