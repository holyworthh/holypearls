import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import type { AdminMe } from "@holypearls/contracts";
import type { Request } from "express";
import { assertStaff } from "./staff.guard.js";
import { StaffGuard } from "./staff.guard.js";

/** The signed-in staff member, for the protected /admin shell (PRD-06 §2). */
@Controller("admin")
@UseGuards(StaffGuard())
export class AdminController {
  @Get("me")
  async me(@Req() request: Request): Promise<AdminMe> {
    const actor = assertStaff(await request.getActor!());
    return {
      staffProfileId: actor.staff.staffProfileId,
      displayName: actor.staff.displayName,
      email: actor.session.email,
      permissions: [...actor.staff.permissions].sort(),
      mfaVerifiedAt: actor.session.mfaVerifiedAt!.toISOString(),
      sessionExpiresAt: actor.session.expiresAt.toISOString(),
    };
  }
}
