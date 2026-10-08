import type { AdminOrganization, AdminOrganizationList } from "@holypearls/contracts";
import { and, type Database, desc, eq, ilike, inArray, isNull, schema, sql } from "@holypearls/db";
import { AppError } from "../errors.js";
import { effectiveStatus, invitationLocationIds } from "../identity/invitations.js";
import { grantFor, grantsOf, isPreset } from "./members.js";
import { organizationLocations } from "./organizations.js";

/*
 * The staff support view (PRD-06 OPS-FR-080–081; TECH-03 §16): read only,
 * ORGANIZATION_SUPPORT. Staff never sign in as the customer, and nothing here
 * writes. Assets, templates, collections and order requests join it in T11
 * and T12. Invitation secrets are never read.
 */

export async function searchOrganizations(db: Database, q?: string): Promise<AdminOrganizationList> {
  const term = q?.trim().slice(0, 100);
  const locationCount = db
    .select({ organizationId: schema.locations.organizationId, count: sql<number>`count(*)::int`.as("location_count") })
    .from(schema.locations)
    .groupBy(schema.locations.organizationId)
    .as("location_counts");
  const memberCount = db
    .select({ organizationId: schema.memberships.organizationId, count: sql<number>`count(*)::int`.as("member_count") })
    .from(schema.memberships)
    .where(eq(schema.memberships.status, "ACTIVE"))
    .groupBy(schema.memberships.organizationId)
    .as("member_counts");
  const rows = await db
    .select({ id: schema.organizations.id, name: schema.organizations.name, createdAt: schema.organizations.createdAt, locations: locationCount.count, members: memberCount.count })
    .from(schema.organizations)
    .leftJoin(locationCount, eq(locationCount.organizationId, schema.organizations.id))
    .leftJoin(memberCount, eq(memberCount.organizationId, schema.organizations.id))
    .where(and(isNull(schema.organizations.archivedAt), term ? ilike(schema.organizations.name, `%${term.replace(/[%_\\]/g, "\\$&")}%`) : undefined))
    .orderBy(schema.organizations.name)
    .limit(100);
  return {
    organizations: rows.map((row) => ({ id: row.id, name: row.name, locationCount: row.locations ?? 0, activeMembers: row.members ?? 0, createdAt: row.createdAt.toISOString() })),
  };
}

export async function supportOrganization(db: Database, id: string, now = new Date()): Promise<AdminOrganization> {
  const [organization] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, id));
  if (!organization) throw new AppError("NOT_FOUND");
  const locations = await organizationLocations(db, id);
  const names = new Map(locations.map((location) => [location.id, location.name]));
  const refs = (ids: readonly string[]) => ids.flatMap((locationId) => (names.has(locationId) ? [{ id: locationId, name: names.get(locationId)! }] : []));
  const members = await db
    .select({ membership: schema.memberships, name: schema.users.name, email: schema.users.email })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(eq(schema.memberships.organizationId, id))
    .orderBy(schema.users.name);
  const { permissions, locations: assigned } = await grantsOf(db, members.map((row) => row.membership.id));
  const invitations = await db
    .select()
    .from(schema.invitations)
    .where(and(eq(schema.invitations.organizationId, id), inArray(schema.invitations.status, ["PENDING", "EXPIRED", "REVOKED"])))
    .orderBy(desc(schema.invitations.createdAt))
    .limit(50);
  const invitationLocations = await invitationLocationIds(db, invitations.map((row) => row.id));
  return {
    id,
    name: organization.name,
    createdAt: organization.createdAt.toISOString(),
    locations,
    members: members.map((row) => {
      const granted = permissions.get(row.membership.id) ?? [];
      return {
        membershipId: row.membership.id,
        name: row.name,
        email: row.email,
        role: row.membership.role,
        status: row.membership.status,
        allLocations: row.membership.allLocations,
        locations: refs(assigned.get(row.membership.id) ?? []),
        permissions: grantFor(row.membership.role, granted),
        adjusted: !isPreset(row.membership.role, granted),
      };
    }),
    invitations: invitations.map((row) => ({
      id: row.id,
      email: row.emailNormalized,
      role: row.role,
      allLocations: row.allLocations,
      locations: refs(invitationLocations.get(row.id) ?? []),
      status: effectiveStatus(row, now),
      expiresAt: row.expiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    })),
  };
}
