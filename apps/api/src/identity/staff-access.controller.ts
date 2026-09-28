import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import { grantPermissionSchema, type StaffAccess, staffPermissionSchema } from "@holypearls/contracts";
import type { Database } from "@holypearls/db";
import type { Request } from "express";
import type { z } from "zod";
import { Idempotent } from "../platform/idempotency.js";
import { RateLimit } from "../platform/rate-limit.js";
import { DATABASE } from "../tokens.js";
import { ZodValidationPipe } from "../validation.js";
import { requireRecentMfa } from "./actor.js";
import { getStaffAccess, grantStaffPermission, resetStaffMfa, revokeStaffPermission } from "./staff-access.js";
import { StaffGuard } from "./staff.guard.js";

/**
 * Staff permissions and MFA resets (TECH-03 §8–10). High-risk: STAFF_ADMIN,
 * an authenticator check in the last 15 minutes, and an audit entry. The
 * screens for this arrive with staff administration (T13-05).
 */
@Controller("admin/staff/:staffProfileId")
@UseGuards(StaffGuard("STAFF_ADMIN"))
export class StaffAccessController {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  @Get("access")
  async access(@Req() request: Request, @Param("staffProfileId", new ParseUUIDPipe()) id: string): Promise<StaffAccess> {
    return getStaffAccess(this.db, await request.getActor!(), id);
  }

  @Post("permissions")
  @HttpCode(200)
  @RateLimit("ADMIN_WRITE")
  @Idempotent()
  async grant(
    @Req() request: Request,
    @Param("staffProfileId", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(grantPermissionSchema)) body: z.infer<typeof grantPermissionSchema>,
  ): Promise<StaffAccess> {
    const actor = await request.getActor!();
    requireRecentMfa(actor);
    return grantStaffPermission(this.db, actor, id, body.permission);
  }

  @Delete("permissions/:permission")
  @RateLimit("ADMIN_WRITE")
  async revoke(
    @Req() request: Request,
    @Param("staffProfileId", new ParseUUIDPipe()) id: string,
    @Param("permission", new ZodValidationPipe(staffPermissionSchema)) permission: z.infer<typeof staffPermissionSchema>,
  ): Promise<StaffAccess> {
    const actor = await request.getActor!();
    requireRecentMfa(actor);
    return revokeStaffPermission(this.db, actor, id, permission);
  }

  @Post("mfa-reset")
  @HttpCode(200)
  @RateLimit("ADMIN_WRITE")
  async resetMfa(@Req() request: Request, @Param("staffProfileId", new ParseUUIDPipe()) id: string): Promise<StaffAccess> {
    const actor = await request.getActor!();
    requireRecentMfa(actor);
    return resetStaffMfa(this.db, actor, id);
  }
}
