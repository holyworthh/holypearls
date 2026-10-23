import { and, type AnyColumn, type Database, eq, inArray, isNull, or, schema, sql, type SQL, type Transaction } from "@holypearls/db";
import { AppError } from "../errors.js";
import type { ActorContext } from "../identity/actor.js";
import { enforce } from "../platform/policy.js";
import { findActiveMember, type Member, requireMember } from "./members.js";
import { canSeeLocation, needsPermission } from "./policies.js";

/*
 * Organization records in other modules (T10-03; TECH-03 §7, §12). Orders,
 * projects, quotes and checkouts carry `organization_id` and `location_id`;
 * these helpers decide which of them a member may see, and other modules
 * call them instead of reading organization tables (TECH-00 §5).
 */

/** What a member can see: one organization, their locations (or one chosen), and only their own records without VIEW_RECORDS. */
export interface RecordScope {
  organizationId: string;
  /** null: every location. Otherwise the locations to include (possibly none). */
  locationIds: string[] | null;
  /** Set for members without VIEW_RECORDS (Buyers see only what they placed). */
  ownerUserId: string | null;
}

export interface Placement {
  organizationId: string;
  locationId: string;
}

/** The scope for a member, optionally narrowed to one location from the switcher (a location outside theirs is 404). */
export function scopeFor(member: Member, locationId?: string | null): RecordScope {
  if (locationId) enforce(canSeeLocation(member, locationId));
  return {
    organizationId: member.organizationId,
    locationIds: locationId ? [locationId] : member.allLocations ? null : [...member.locationIds],
    ownerUserId: member.permissions.has("VIEW_RECORDS") ? null : member.userId,
  };
}

/** The scope as a condition on a table's organization, location and owner columns. */
export function scopeWhere(columns: { organizationId: AnyColumn; locationId: AnyColumn; ownerUserId: AnyColumn }, scope: RecordScope): SQL {
  return and(
    eq(columns.organizationId, scope.organizationId),
    scope.locationIds === null ? undefined : scope.locationIds.length ? inArray(columns.locationId, scope.locationIds) : sql`false`,
    scope.ownerUserId ? eq(columns.ownerUserId, scope.ownerUserId) : undefined,
  )!;
}

/**
 * Can the signed-in person read this organization record? An ACTIVE member
 * whose locations include it, with VIEW_RECORDS, or the person who placed it.
 * Reading only: actions stay with the person who placed it until T11-04.
 */
export async function canSeeOrganizationRecord(db: Database, actor: ActorContext, record: { organizationId: string | null; locationId: string | null; ownerUserId: string | null }) {
  if (actor.type !== "user" || !record.organizationId || !record.locationId) return false;
  const member = await findActiveMember(db, record.organizationId, actor.session.userId);
  if (!member) return false;
  if (!member.allLocations && !member.locationIds.has(record.locationId)) return false;
  return member.permissions.has("VIEW_RECORDS") || record.ownerUserId === actor.session.userId;
}

/** Apply current membership and location grants before limiting personal account history. */
export function organizationAccessWhere(columns: { organizationId: AnyColumn | SQL; locationId: AnyColumn | SQL; ownerUserId: AnyColumn | SQL }, userId: string) {
  return or(isNull(columns.organizationId), sql`exists (
    select 1 from memberships m join organizations o on o.id = m.organization_id
    where m.organization_id = ${columns.organizationId} and m.user_id = ${userId}::uuid and m.status = 'ACTIVE' and o.archived_at is null
      and (m.all_locations or exists (select 1 from membership_locations ml where ml.membership_id = m.id and ml.location_id = ${columns.locationId}))
      and (${columns.ownerUserId} = ${userId}::uuid or exists (select 1 from membership_permissions mp where mp.membership_id = m.id and mp.permission = 'VIEW_RECORDS'))
  )`)!;
}

/**
 * Placing a checkout or project for an organization ("placing orders and
 * projects for the organization and location"): an ACTIVE member with
 * CREATE_REQUESTS, and a location inside their scope. null is personal.
 */
export async function checkPlacement(db: Database | Transaction, actor: ActorContext, placement: Placement | null): Promise<Placement | null> {
  if (!placement) return null;
  const member = await requireMember(db as Database, actor, placement.organizationId);
  enforce(needsPermission(member, "CREATE_REQUESTS"));
  enforce(canSeeLocation(member, placement.locationId));
  const [location] = await db
    .select({ id: schema.locations.id })
    .from(schema.locations)
    .where(and(eq(schema.locations.id, placement.locationId), eq(schema.locations.organizationId, placement.organizationId)));
  if (!location) throw new AppError("NOT_FOUND");
  return placement;
}

/** Names for showing where a record was placed ("ACME Hospitality · Lekki"). */
export async function placementNames(db: Database | Transaction, placements: readonly (Placement | null)[]) {
  const ids = [...new Set(placements.flatMap((placement) => (placement ? [placement.locationId] : [])))];
  if (!ids.length) return new Map<string, { organizationName: string; locationName: string }>();
  const rows = await db
    .select({ id: schema.locations.id, locationName: schema.locations.name, organizationName: schema.organizations.name })
    .from(schema.locations)
    .innerJoin(schema.organizations, eq(schema.organizations.id, schema.locations.organizationId))
    .where(inArray(schema.locations.id, ids));
  return new Map(rows.map((row) => [row.id, { organizationName: row.organizationName, locationName: row.locationName }]));
}

/** A placement as the API shows it, with names. */
export async function placementView(db: Database | Transaction, placement: { organizationId: string | null; locationId: string | null }) {
  if (!placement.organizationId || !placement.locationId) return null;
  const names = (await placementNames(db, [{ organizationId: placement.organizationId, locationId: placement.locationId }])).get(placement.locationId);
  return names ? { organizationId: placement.organizationId, locationId: placement.locationId, ...names } : null;
}
