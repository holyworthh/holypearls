import type { StaffPermission } from "@holypearls/contracts";
import { and, type Database, eq, schema } from "@holypearls/db";
import { allow, type Decision, deny, hide } from "../platform/policy.js";
import type { ActorContext } from "./actor.js";

/*
 * Identity policies (TECH-03 §12). Each names the person type, the record,
 * the permission and the scope, and is the only place that rule lives.
 */

/** Scoped query: a session is only ever loaded together with its owner. */
export async function findSessionForActor(db: Database, sessionId: string, actor: ActorContext) {
  if (actor.type !== "user") return null;
  const [row] = await db
    .select({ id: schema.sessions.id, userId: schema.sessions.userId })
    .from(schema.sessions)
    .where(and(eq(schema.sessions.id, sessionId), eq(schema.sessions.userId, actor.session.userId)));
  return row ?? null;
}

/** A person can end their own sessions. Another person's session is hidden (404), never "forbidden". */
export function canRevokeSession(actor: ActorContext, session: { userId: string }): Decision {
  if (actor.type !== "user" || session.userId !== actor.session.userId) return hide();
  return allow();
}

/** Staff administration needs STAFF_ADMIN (TECH-03 §8). */
export function canManageStaffAccess(actor: ActorContext): Decision {
  if (actor.type !== "user" || !actor.staff) return hide();
  if (!actor.staff.permissions.has("STAFF_ADMIN")) return deny("PERMISSION_REQUIRED", { permission: "STAFF_ADMIN" });
  return allow();
}

/** MFA is reset by another STAFF_ADMIN after checking identity by phone (TECH-03 §10). */
export function canResetStaffMfa(actor: ActorContext, target: { staffProfileId: string }): Decision {
  const base = canManageStaffAccess(actor);
  if (base.outcome !== "allow") return base;
  if (actor.type === "user" && actor.staff?.staffProfileId === target.staffProfileId) {
    return deny("ASK_ANOTHER_STAFF_ADMIN");
  }
  return allow();
}

/** At least two people must hold STAFF_ADMIN so nobody is locked out (TECH-03 §10). */
export function canRevokePermission(
  actor: ActorContext,
  permission: StaffPermission,
  staffAdminCount: number,
): Decision {
  const base = canManageStaffAccess(actor);
  if (base.outcome !== "allow") return base;
  if (permission === "STAFF_ADMIN" && staffAdminCount <= 2) return deny("MINIMUM_STAFF_ADMINS", { minimum: 2 });
  return allow();
}
