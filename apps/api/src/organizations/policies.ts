import type { OrganizationPermission, OrganizationRole } from "@holypearls/contracts";
import { allow, type Decision, deny, hide } from "../platform/policy.js";
import { isPreset, type Member } from "./members.js";

/*
 * Organization policies (TECH-03 §7, §12; PRD-05 B2B-FR-003, 090–093). Each
 * names the person, the record, the permission and the location scope, and is
 * the only place that rule lives. Controllers and services call these; they
 * never write permission ifs themselves.
 */

/** Who a membership is and what it can reach, as policies need it. */
export interface Scope {
  role: OrganizationRole;
  allLocations: boolean;
  locationIds: ReadonlySet<string> | readonly string[];
}

const ids = (scope: Scope) => new Set(scope.locationIds);

export function needsPermission(member: Member, permission: OrganizationPermission): Decision {
  return member.permissions.has(permission) ? allow() : deny("PERMISSION_REQUIRED", { permission });
}

/** A location outside the member's locations is hidden (404): "a Lekki manager only sees Lekki". */
export function canSeeLocation(member: Member, locationId: string): Decision {
  return member.allLocations || member.locationIds.has(locationId) ? allow() : hide();
}

/** Adding or renaming locations: team managers who hold every location. */
export function canManageLocations(member: Member): Decision {
  const base = needsPermission(member, "MANAGE_TEAM");
  if (base.outcome !== "allow") return base;
  return member.allLocations ? allow() : deny("ALL_LOCATIONS_REQUIRED");
}

/** A manager sees members who share one of their locations, and everyone with All locations. */
export function canSeeMember(manager: Member, target: Scope): boolean {
  if (manager.allLocations || target.allLocations) return true;
  const mine = manager.locationIds;
  return [...ids(target)].some((id) => mine.has(id));
}

/** The target's reach sits inside the manager's: they can't touch anyone who reaches further than they do. */
function covers(manager: Member, target: { allLocations: boolean; locationIds: Iterable<string> }) {
  if (manager.allLocations) return true;
  if (target.allLocations) return false;
  return [...target.locationIds].every((id) => manager.locationIds.has(id));
}

/**
 * Managing a member (change, deactivate, reactivate): MANAGE_TEAM, the
 * member is within the manager's locations, and only an Owner changes an
 * Owner. Not visible: 404. Visible but not allowed: 403.
 */
export function canManageMember(manager: Member, target: Scope & { membershipId: string }): Decision {
  const base = needsPermission(manager, "MANAGE_TEAM");
  if (base.outcome !== "allow") return base;
  if (!canSeeMember(manager, target)) return hide();
  if (target.role === "OWNER" && manager.role !== "OWNER") return deny("OWNER_REQUIRED");
  if (!covers(manager, { allLocations: target.allLocations, locationIds: ids(target) })) return deny("OUTSIDE_YOUR_LOCATIONS");
  return allow();
}

export interface Grant {
  role: OrganizationRole;
  permissions: readonly OrganizationPermission[];
  allLocations: boolean;
  locationIds: readonly string[];
}

/**
 * No escalation (owner decision 2026-10-08): nobody grants a permission or a
 * location they don't hold. Only an Owner makes an Owner or adjusts a
 * member's permissions away from the role preset (TECH-03 §7).
 */
export function canGrant(manager: Member, grant: Grant): Decision {
  if (grant.role === "OWNER" && manager.role !== "OWNER") return deny("OWNER_REQUIRED");
  if (!isPreset(grant.role, grant.permissions) && manager.role !== "OWNER") return deny("OWNER_REQUIRED_TO_ADJUST");
  const missing = grant.permissions.filter((permission) => !manager.permissions.has(permission));
  if (missing.length > 0) return deny("CANNOT_GRANT_WHAT_YOU_DONT_HOLD", { permissions: missing });
  if (grant.allLocations && !manager.allLocations) return deny("CANNOT_GRANT_ALL_LOCATIONS");
  if (!covers(manager, grant)) return deny("OUTSIDE_YOUR_LOCATIONS");
  return allow();
}

/** Ownership transfer belongs to the Owner role; it isn't a grantable permission. */
export function canTransferOwnership(member: Member): Decision {
  return member.role === "OWNER" ? allow() : deny("OWNER_REQUIRED");
}

/**
 * What a change adds (TECH-03 §9: raising someone's permissions is
 * high-risk). Becoming an Owner always counts, because the role carries
 * ownership itself.
 */
export function raisedBy(before: Grant | null, after: Grant) {
  const had = new Set(before?.permissions ?? []);
  const permissions = after.permissions.filter((permission) => !had.has(permission));
  const beforeIds = new Set(before?.locationIds ?? []);
  const allLocations = after.allLocations && !before?.allLocations;
  const locationIds = after.allLocations || before?.allLocations ? [] : after.locationIds.filter((id) => !beforeIds.has(id));
  const becomesOwner = after.role === "OWNER" && before?.role !== "OWNER";
  return { permissions, allLocations, locationIds, becomesOwner, raises: permissions.length > 0 || allLocations || locationIds.length > 0 || becomesOwner };
}
