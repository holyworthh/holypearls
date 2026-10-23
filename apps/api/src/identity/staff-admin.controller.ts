import { Body, Controller, Get, Headers, HttpCode, Inject, Param, ParseUUIDPipe, Post, Req, Res, UseGuards } from "@nestjs/common";
import { acceptInvitationSchema, INVITATION_TOKEN_HEADER, type InviteStaff, inviteStaffSchema } from "@holypearls/contracts";
import type { Request, Response } from "express";
import type { z } from "zod";
import { AppError } from "../errors.js";
import type { HelpDeps } from "../platform/help-requests.js";
import { Idempotent } from "../platform/idempotency.js";
import { RateLimit } from "../platform/rate-limit.js";
import { HELP_DEPS } from "../tokens.js";
import { ZodValidationPipe } from "../validation.js";
import { acceptStaffInvitation, deactivateStaff, getStaffMember, inviteStaff, listStaff, previewStaffInvitation, revokeStaffInvitation } from "./staff-admin.js";
import { StaffGuard } from "./staff.guard.js";

const uuid = new ParseUUIDPipe();

/** Staff user administration (T13-05b; Pen 122). STAFF_ADMIN; inviting with permissions also needs a recent MFA check. */
@Controller("admin/staff")
@UseGuards(StaffGuard("STAFF_ADMIN"))
export class StaffAdminController {
  constructor(@Inject(HELP_DEPS) private readonly deps: HelpDeps) {}

  @Get()
  async list(@Req() request: Request) {
    return listStaff(this.deps.db, await request.getActor!());
  }

  @Post("invitations")
  @RateLimit("ADMIN_WRITE")
  @Idempotent()
  async invite(@Req() request: Request, @Body(new ZodValidationPipe(inviteStaffSchema)) body: InviteStaff) {
    return inviteStaff(this.deps, await request.getActor!(), body);
  }

  @Post("invitations/:id/revoke")
  @HttpCode(200)
  @RateLimit("ADMIN_WRITE")
  async revoke(@Req() request: Request, @Param("id", uuid) id: string) {
    return revokeStaffInvitation(this.deps.db, await request.getActor!(), id);
  }

  @Get(":staffProfileId")
  async member(@Req() request: Request, @Param("staffProfileId", uuid) id: string) {
    return getStaffMember(this.deps.db, await request.getActor!(), id);
  }

  @Post(":staffProfileId/deactivate")
  @HttpCode(200)
  @RateLimit("ADMIN_WRITE")
  async deactivate(@Req() request: Request, @Param("staffProfileId", uuid) id: string) {
    return deactivateStaff(this.deps.db, await request.getActor!(), id);
  }
}

/** Opening and accepting a staff invitation on the customer site (TECH-03 §11): the secret travels in a header or the body only. */
@Controller("staff-invitations")
export class StaffInvitationsController {
  constructor(@Inject(HELP_DEPS) private readonly deps: HelpDeps) {}

  @Get("preview")
  @RateLimit("GUEST_LINK_VERIFY")
  async preview(@Req() request: Request, @Res({ passthrough: true }) response: Response, @Headers(INVITATION_TOKEN_HEADER) token?: string) {
    response.setHeader("cache-control", "private, no-store");
    response.setHeader("referrer-policy", "no-referrer");
    if (!token || token.length < 20 || token.length > 200) throw new AppError("NOT_FOUND");
    return previewStaffInvitation(this.deps.db, token, (await request.getActor!()).now);
  }

  @Post("accept")
  @HttpCode(200)
  @RateLimit("GUEST_LINK_VERIFY")
  async accept(@Req() request: Request, @Body(new ZodValidationPipe(acceptInvitationSchema)) body: z.infer<typeof acceptInvitationSchema>) {
    return acceptStaffInvitation(this.deps.db, await request.getActor!(), body.token, this.deps.adminOrigin);
  }
}
