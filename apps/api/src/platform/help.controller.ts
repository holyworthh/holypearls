import { Public } from "../identity/identified.guard.js";
import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import {
  type AdminHelpRequest,
  createHelpRequestSchema,
  type HelpInbox,
  helpInboxQuerySchema,
  type HelpRequest,
  replyToHelpSchema,
} from "@holypearls/contracts";
import type { Request, Response } from "express";
import type { z } from "zod";
import { setGuestCookie } from "../identity/customer-access.controller.js";
import { StaffGuard } from "../identity/staff.guard.js";
import { HELP_DEPS, type HelpDepsToken } from "../tokens.js";
import { ZodValidationPipe } from "../validation.js";
import {
  closeHelpRequest,
  createHelpRequest,
  getHelpRequestForActor,
  getHelpRequestForStaff,
  listHelpInbox,
  replyToHelpRequest,
} from "./help-requests.js";
import { Idempotent } from "./idempotency.js";
import { RateLimit } from "./rate-limit.js";

/** "Need help" / "Ask HolyPearls" (PRD-00 §18, PUB-FR-015, PROJ-FR-008). */
@Controller("help-requests")
export class HelpController {
  constructor(@Inject(HELP_DEPS) private readonly deps: HelpDepsToken) {}

  @Post()
  @Public()
  @RateLimit("CONTACT")
  async create(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body(new ZodValidationPipe(createHelpRequestSchema)) body: z.infer<typeof createHelpRequestSchema>,
  ): Promise<HelpRequest> {
    const created = await createHelpRequest(this.deps, await request.getActor!(), body);
    if (created.guestSession) setGuestCookie(response, this.deps.webOrigin, created.guestSession.token, created.guestSession.expiresAt);
    return created.request;
  }

  /** A guest sees only their own request; everyone else gets 404. */
  @Get(":id")
  async get(@Req() request: Request, @Param("id", new ParseUUIDPipe()) id: string): Promise<HelpRequest> {
    return getHelpRequestForActor(this.deps.db, await request.getActor!(), id);
  }
}

/** Staff help inbox (CUSTOMER_SUPPORT, Pen frame 103). */
@Controller("admin/help-requests")
@UseGuards(StaffGuard("CUSTOMER_SUPPORT"))
export class AdminHelpController {
  constructor(@Inject(HELP_DEPS) private readonly deps: HelpDepsToken) {}

  @Get()
  list(@Query(new ZodValidationPipe(helpInboxQuerySchema)) query: z.infer<typeof helpInboxQuerySchema>): Promise<HelpInbox> {
    return listHelpInbox(this.deps.db, query);
  }

  @Get(":id")
  get(@Param("id", new ParseUUIDPipe()) id: string): Promise<AdminHelpRequest> {
    return getHelpRequestForStaff(this.deps.db, id);
  }

  @Post(":id/replies")
  @HttpCode(200)
  @RateLimit("ADMIN_WRITE")
  @Idempotent()
  async reply(
    @Req() request: Request,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(replyToHelpSchema)) body: z.infer<typeof replyToHelpSchema>,
  ): Promise<AdminHelpRequest> {
    return replyToHelpRequest(this.deps, await request.getActor!(), id, body.body);
  }

  @Post(":id/close")
  @HttpCode(200)
  @RateLimit("ADMIN_WRITE")
  async close(@Req() request: Request, @Param("id", new ParseUUIDPipe()) id: string): Promise<AdminHelpRequest> {
    return closeHelpRequest(this.deps.db, await request.getActor!(), id);
  }
}
