import { ORGANIZATION_PERMISSIONS, type OrganizationPermission, type OrganizationRole, ROLE_PRESETS } from "@holypearls/contracts";
import { and, type Database, eq, inArray, isNull, schema, type Transaction } from "@holypearls/db";
import { AppError } from "../errors.js";
import { type ActorContext, requireUser } from "../identity/actor.js";

/**
 * The organization part of the ActorContext (TECH-03 §12): the person's
 * ACTIVE membership, its permissions and its locations. Loaded from the
 * database on every request and never kept in the session, so a deactivated
 * member loses access on their next request (B2B-FR-093).
 */
export interface Member {
  membershipId: string;
  organizationId: string;
  organizationName: string;
  userId: string;
  role: OrganizationRole;
  permissions: ReadonlySet<OrganizationPermission>;
  allLocations: boolean;
  locationIds: ReadonlySet<string>;
}

type Db = Database | Transaction;

/** Permissions and locations for many memberships at once (no N+1). */
export async function grantsOf(db: Db, membershipIds: readonly string[]) {
  const permissions = new Map<string, OrganizationPermission[]>();
  const locations = new Map<string, string[]>();
  if (membershipIds.length === 0) return { permissions, locations };
  const ids = [...membershipIds];
  const [permissionRows, locationRows] = await Promise.all([
    db.select().from(schema.membershipPermissions).where(inArray(schema.membershipPermissions.membershipId, ids)),
    db.select({ membershipId: schema.membershipLocations.membershipId, locationId: schema.membershipLocations.locationId }).from(schema.membershipLocations).where(inArray(schema.membershipLocations.membershipId, ids)),
  ]);
  for (const row of permissionRows) permissions.set(row.membershipId, [...(permissions.get(row.membershipId) ?? []), row.permission]);
  for (const row of locationRows) locations.set(row.membershipId, [...(locations.get(row.membershipId) ?? []), row.locationId]);
  return { permissions, locations };
}

/** Scoped query: the user's ACTIVE membership in one live organization, or null. */
export async function findActiveMember(db: Db, organizationId: string, userId: string): Promise<Member | null> {
  const [row] = await db
    .select({ membership: schema.memberships, organizationName: schema.organizations.name })
    .from(schema.memberships)
    .innerJoin(schema.organizations, eq(schema.organizations.id, schema.memberships.organizationId))
    .where(
      and(
        eq(schema.memberships.organizationId, organizationId),
        eq(schema.memberships.userId, userId),
        eq(schema.memberships.status, "ACTIVE"),
        isNull(schema.organizations.archivedAt),
      ),
    );
  if (!row) return null;
  const { permissions, locations } = await grantsOf(db, [row.membership.id]);
  return {
    membershipId: row.membership.id,
    organizationId,
    organizationName: row.organizationName,
    userId,
    role: row.membership.role,
    permissions: new Set(permissions.get(row.membership.id) ?? []),
    allLocations: row.membership.allLocations,
    locationIds: new Set(locations.get(row.membership.id) ?? []),
  };
}

const memo = new WeakMap<ActorContext, Map<string, Promise<Member | null>>>();

/**
 * The signed-in person as a member of this organization. Not a member, or
 * deactivated: 404, so they can't learn the organization exists (TECH-03 §12).
 * Signed out: 401. Memoized for this request only.
 */
export async function requireMember(db: Database, actor: ActorContext, organizationId: string): Promise<Member> {
  const user = requireUser(actor);
  let byOrganization = memo.get(actor);
  if (!byOrganization) memo.set(actor, (byOrganization = new Map()));
  let member = byOrganization.get(organizationId);
  if (!member) byOrganization.set(organizationId, (member = findActiveMember(db, organizationId, user.session.userId)));
  const found = await member;
  if (!found) throw new AppError("NOT_FOUND");
  return found;
}

/** Every ACTIVE membership of a user, for the workspace switcher and the account page. */
export async function activeMembershipsOf(db: Database, userId: string) {
  const rows = await db
    .select({ membership: schema.memberships, organizationName: schema.organizations.name })
    .from(schema.memberships)
    .innerJoin(schema.organizations, eq(schema.organizations.id, schema.memberships.organizationId))
    .where(and(eq(schema.memberships.userId, userId), eq(schema.memberships.status, "ACTIVE"), isNull(schema.organizations.archivedAt)))
    .orderBy(schema.organizations.name);
  const { permissions, locations } = await grantsOf(db, rows.map((row) => row.membership.id));
  return rows.map(
    (row): Member => ({
      membershipId: row.membership.id,
      organizationId: row.membership.organizationId,
      organizationName: row.organizationName,
      userId,
      role: row.membership.role,
      permissions: new Set(permissions.get(row.membership.id) ?? []),
      allLocations: row.membership.allLocations,
      locationIds: new Set(locations.get(row.membership.id) ?? []),
    }),
  );
}

/** What a role grants: Owners always hold every permission and every location. */
export function grantFor(role: OrganizationRole, adjusted: readonly OrganizationPermission[] | null) {
  if (role === "OWNER") return [...ORGANIZATION_PERMISSIONS];
  return [...new Set(adjusted ?? ROLE_PRESETS[role])].sort((a, b) => ORGANIZATION_PERMISSIONS.indexOf(a) - ORGANIZATION_PERMISSIONS.indexOf(b));
}

export const isPreset = (role: OrganizationRole, permissions: readonly OrganizationPermission[]) => {
  const preset = new Set(grantFor(role, null));
  return permissions.length === preset.size && permissions.every((permission) => preset.has(permission));
};

/** Writes a membership's permissions and locations, replacing what it had. */
export async function writeGrants(
  tx: Transaction,
  membership: { id: string; organizationId: string },
  grant: { permissions: readonly OrganizationPermission[]; allLocations: boolean; locationIds: readonly string[] },
) {
  await tx.delete(schema.membershipPermissions).where(eq(schema.membershipPermissions.membershipId, membership.id));
  await tx.delete(schema.membershipLocations).where(eq(schema.membershipLocations.membershipId, membership.id));
  if (grant.permissions.length > 0) {
    await tx.insert(schema.membershipPermissions).values(grant.permissions.map((permission) => ({ membershipId: membership.id, permission })));
  }
  if (!grant.allLocations && grant.locationIds.length > 0) {
    await tx
      .insert(schema.membershipLocations)
      .values(grant.locationIds.map((locationId) => ({ membershipId: membership.id, organizationId: membership.organizationId, locationId })));
  }
}

/** Locks the organization row, so team changes in one organization happen one at a time (last-owner rule). */
export async function lockOrganization(tx: Transaction, organizationId: string) {
  await tx.select({ id: schema.organizations.id }).from(schema.organizations).where(eq(schema.organizations.id, organizationId)).for("update");
}

export async function activeOwnerCount(db: Db, organizationId: string) {
  const rows = await db
    .select({ id: schema.memberships.id })
    .from(schema.memberships)
    .where(and(eq(schema.memberships.organizationId, organizationId), eq(schema.memberships.role, "OWNER"), eq(schema.memberships.status, "ACTIVE")));
  return rows.length;
}
