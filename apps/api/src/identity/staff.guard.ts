import { type CanActivate, type ExecutionContext, mixin, type Type } from "@nestjs/common";
import type { StaffPermission } from "@holypearls/contracts";
import type { Request } from "express";
import { AppError } from "../errors.js";
import type { ActorContext } from "./actor.js";

/**
 * Checks a staff admin route in one place (TECH-03 §8, §12):
 * - not staff (or deactivated): 404, so non-staff can't learn admin exists;
 * - staff without an authenticator check in this session: 403 MFA_REQUIRED;
 * - staff without the named permission: 403 FORBIDDEN.
 */
export function StaffGuard(permission?: StaffPermission): Type<CanActivate> {
  class Guard implements CanActivate {
    async canActivate(context: ExecutionContext): Promise<boolean> {
      const request = context.switchToHttp().getRequest<Request>();
      assertStaff(await request.getActor!(), permission);
      return true;
    }
  }
  return mixin(Guard);
}

export function assertStaff(actor: ActorContext, permission?: StaffPermission) {
  if (actor.type !== "user" || !actor.staff) throw new AppError("NOT_FOUND");
  if (!actor.session.mfaEnabled || !actor.session.mfaVerifiedAt) {
    throw new AppError("MFA_REQUIRED", { context: { mfaEnabled: actor.session.mfaEnabled } });
  }
  if (permission && !actor.staff.permissions.has(permission)) {
    throw new AppError("FORBIDDEN", { context: { permission } });
  }
  return { ...actor, staff: actor.staff };
}
