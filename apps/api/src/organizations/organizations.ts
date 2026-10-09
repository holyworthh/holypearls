import { type LocationDetail, type LocationInput, type LocationList, type LocationSummary, type MyOrganization, type MyOrganizations, ORGANIZATION_PERMISSIONS } from "@holypearls/contracts";
import { and, type Database, eq, inArray, schema, sql, type Transaction } from "@holypearls/db";
import { AppError } from "../errors.js";
import { type ActorContext, requireUser } from "../identity/actor.js";
import { recordAudit } from "../platform/audit.js";
import { enforce } from "../platform/policy.js";
import { activeMembershipsOf, grantFor, type Member, requireMember, writeGrants } from "./members.js";
import { canManageLocations, canSeeLocation } from "./policies.js";

/*
 * Organizations and locations (PRD-05 B2B-FR-001–002). Every read goes
 * through the member's location scope (TECH-03 §7): a location outside it is
 * 404, never "forbidden".
 */

type Db = Database | Transaction;

async function allLocations(db: Db, organizationId: string) {
  return db.select().from(schema.locations).where(eq(schema.locations.organizationId, organizationId)).orderBy(schema.locations.name);
}

/** The member's own place, for display; the server checks again on every action (TECH-03 §12). */
async function myOrganization(db: Db, member: Member): Promise<MyOrganization> {
  const locations = (await allLocations(db, member.organizationId)).filter((location) => member.allLocations || member.locationIds.has(location.id));
  return {
    id: member.organizationId,
    name: member.organizationName,
    me: {
      membershipId: member.membershipId,
      role: member.role,
      permissions: ORGANIZATION_PERMISSIONS.filter((permission) => member.permissions.has(permission)),
      allLocations: member.allLocations,
      locations: locations.map((location) => ({ id: location.id, name: location.name })),
    },
  };
}

export async function myOrganizations(db: Database, actor: ActorContext): Promise<MyOrganizations> {
  const user = requireUser(actor);
  const members = await activeMembershipsOf(db, user.session.userId);
  return { organizations: await Promise.all(members.map((member) => myOrganization(db, member))) };
}

export async function getOrganization(db: Database, actor: ActorContext, organizationId: string) {
  return myOrganization(db, await requireMember(db, actor, organizationId));
}

/** Active members who can reach each location: those assigned to it plus those with All locations. */
async function memberCounts(db: Db, organizationId: string) {
  const [everywhere] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.memberships)
    .where(and(eq(schema.memberships.organizationId, organizationId), eq(schema.memberships.status, "ACTIVE"), eq(schema.memberships.allLocations, true)));
  const assigned = await db
    .select({ locationId: schema.membershipLocations.locationId, count: sql<number>`count(*)::int` })
    .from(schema.membershipLocations)
    .innerJoin(schema.memberships, eq(schema.memberships.id, schema.membershipLocations.membershipId))
    .where(and(eq(schema.membershipLocations.organizationId, organizationId), eq(schema.memberships.status, "ACTIVE"), eq(schema.memberships.allLocations, false)))
    .groupBy(schema.membershipLocations.locationId);
  const byLocation = new Map(assigned.map((row) => [row.locationId, row.count]));
  return (locationId: string) => (everywhere?.count ?? 0) + (byLocation.get(locationId) ?? 0);
}

export async function organizationLocations(db: Db, organizationId: string): Promise<LocationSummary[]> {
  const [locations, count] = await Promise.all([allLocations(db, organizationId), memberCounts(db, organizationId)]);
  return locations.map((location) => ({ id: location.id, name: location.name, city: location.city, memberCount: count(location.id) }));
}

/** Scoped query: only the locations this member can see (a Lekki manager sees Lekki). */
export async function listLocations(db: Database, actor: ActorContext, organizationId: string): Promise<LocationList> {
  const member = await requireMember(db, actor, organizationId);
  const locations = await organizationLocations(db, organizationId);
  return { locations: locations.filter((location) => canSeeLocation(member, location.id).outcome === "allow") };
}

export async function getLocation(db: Database, actor: ActorContext, organizationId: string, locationId: string): Promise<LocationDetail> {
  const member = await requireMember(db, actor, organizationId);
  enforce(canSeeLocation(member, locationId));
  const [location] = await db.select().from(schema.locations).where(and(eq(schema.locations.id, locationId), eq(schema.locations.organizationId, organizationId)));
  if (!location) throw new AppError("NOT_FOUND");
  const assigned = db
    .select({ id: schema.membershipLocations.membershipId })
    .from(schema.membershipLocations)
    .where(eq(schema.membershipLocations.locationId, locationId));
  const members = await db
    .select({ membershipId: schema.memberships.id, name: schema.users.name, role: schema.memberships.role, allLocations: schema.memberships.allLocations })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(
      and(
        eq(schema.memberships.organizationId, organizationId),
        eq(schema.memberships.status, "ACTIVE"),
        sql`(${schema.memberships.allLocations} OR ${inArray(schema.memberships.id, assigned)})`,
      ),
    )
    .orderBy(schema.users.name);
  return { id: location.id, name: location.name, city: location.city, memberCount: members.length, members, version: location.version };
}

const duplicateName = (error: unknown) => (error as { code?: string; cause?: { code?: string } })?.code === "23505" || (error as { cause?: { code?: string } })?.cause?.code === "23505";
const nameTaken = () => new AppError("VALIDATION_FAILED", { fieldErrors: { name: "This organization already has a location with that name" } });

export async function createLocation(db: Database, actor: ActorContext, organizationId: string, input: LocationInput) {
  const member = await requireMember(db, actor, organizationId);
  enforce(canManageLocations(member));
  try {
    const id = await db.transaction(async (tx) => {
      const [row] = await tx.insert(schema.locations).values({ organizationId, name: input.name, city: input.city }).returning({ id: schema.locations.id });
      await recordAudit(tx, actor, {
        action: "organization.location_created",
        summary: `Location added: ${input.name}`,
        recordType: "ORGANIZATION",
        recordId: organizationId,
        recordLabel: member.organizationName,
        after: { locationId: row!.id, name: input.name, city: input.city },
        permission: "MANAGE_TEAM",
      });
      return row!.id;
    });
    return getLocation(db, actor, organizationId, id);
  } catch (error) {
    if (duplicateName(error)) throw nameTaken();
    throw error;
  }
}

export async function updateLocation(db: Database, actor: ActorContext, organizationId: string, locationId: string, input: LocationInput & { version: number }) {
  const member = await requireMember(db, actor, organizationId);
  enforce(canManageLocations(member));
  try {
    await db.transaction(async (tx) => {
      const [row] = await tx.select().from(schema.locations).where(and(eq(schema.locations.id, locationId), eq(schema.locations.organizationId, organizationId))).for("update");
      if (!row) throw new AppError("NOT_FOUND");
      if (row.version !== input.version) throw new AppError("VERSION_CONFLICT", { context: { currentVersion: row.version } });
      await tx.update(schema.locations).set({ name: input.name, city: input.city, version: row.version + 1 }).where(eq(schema.locations.id, locationId));
      await recordAudit(tx, actor, {
        action: "organization.location_updated",
        summary: `Location updated: ${input.name}`,
        recordType: "ORGANIZATION",
        recordId: organizationId,
        recordLabel: member.organizationName,
        before: { locationId, name: row.name, city: row.city },
        after: { locationId, name: input.name, city: input.city },
        permission: "MANAGE_TEAM",
      });
    });
  } catch (error) {
    if (duplicateName(error)) throw nameTaken();
    throw error;
  }
  return getLocation(db, actor, organizationId, locationId);
}

/**
 * A new organization with its locations and its first Owner, who holds every
 * permission and location (approving a workspace request; owner decision
 * 2026-10-08). Runs inside the caller's transaction.
 */
export async function createOrganization(tx: Transaction, input: { name: string; locations: readonly LocationInput[]; ownerUserId: string }) {
  const [organization] = await tx.insert(schema.organizations).values({ name: input.name }).returning({ id: schema.organizations.id });
  const organizationId = organization!.id;
  await tx.insert(schema.locations).values(input.locations.map((location) => ({ organizationId, name: location.name, city: location.city })));
  const [membership] = await tx
    .insert(schema.memberships)
    .values({ organizationId, userId: input.ownerUserId, role: "OWNER", allLocations: true })
    .returning({ id: schema.memberships.id });
  await writeGrants(tx, { id: membership!.id, organizationId }, { permissions: grantFor("OWNER", null), allLocations: true, locationIds: [] });
  return { organizationId, membershipId: membership!.id };
}
