import { Body, Controller, Get, Headers, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import {
  acceptInvitationSchema,
  declineOrganizationRequestSchema,
  INVITATION_TOKEN_HEADER,
  inviteInputSchema,
  locationInputSchema,
  locationUpdateSchema,
  memberChangeSchema,
  memberStatusChangeSchema,
  organizationRequestInputSchema,
  ownershipTransferSchema,
} from "@holypearls/contracts";
import type { Request, Response } from "express";
import type { z } from "zod";
import { AppError } from "../errors.js";
import { StaffGuard } from "../identity/staff.guard.js";
import { Idempotent } from "../platform/idempotency.js";
import { RateLimit } from "../platform/rate-limit.js";
import { HELP_DEPS } from "../tokens.js";
import { ZodValidationPipe } from "../validation.js";
import { createLocation, getLocation, getOrganization, listLocations, myOrganizations, updateLocation } from "./organizations.js";
import { approveOrganizationRequest, declineOrganizationRequest, getOrganizationRequest, listOrganizationRequests, myOrganizationRequest, submitOrganizationRequest } from "./requests.js";
import { searchOrganizations, supportOrganization } from "./support.js";
import {
  acceptInvitation,
  changeMember,
  deactivateMember,
  inviteMember,
  listTeam,
  type OrganizationDeps,
  previewInvitation,
  reactivateMember,
  revokeTeamInvitation,
  transferOwnership,
} from "./team.js";

const uuid = new ParseUUIDPipe();
const actorOf = (request: Request) => request.getActor!();
const noStore = (response: Response) => response.setHeader("cache-control", "private, no-store");

/** The signed-in person's workspaces and workspace request (owner decision 2026-10-08). */
@Controller("me")
export class MyOrganizationsController {
  constructor(@Inject(HELP_DEPS) private readonly deps: OrganizationDeps) {}

  @Get("organizations")
  async organizations(@Req() request: Request) {
    return myOrganizations(this.deps.db, await actorOf(request));
  }

  @Get("organization-request")
  async request(@Req() request: Request) {
    return myOrganizationRequest(this.deps.db, await actorOf(request));
  }

  @Post("organization-request")
  @HttpCode(200)
  @Idempotent()
  @RateLimit("CONTACT")
  async submit(@Req() request: Request, @Body(new ZodValidationPipe(organizationRequestInputSchema)) body: z.infer<typeof organizationRequestInputSchema>) {
    return submitOrganizationRequest(this.deps, await actorOf(request), body);
  }
}

/**
 * The Brand Workspace's organization, locations and team (PRD-05
 * B2B-FR-001–003, 090–093). Every route loads the caller's ACTIVE membership:
 * not a member or deactivated is 404 (TECH-03 §12).
 */
@Controller("organizations/:organizationId")
export class OrganizationsController {
  constructor(@Inject(HELP_DEPS) private readonly deps: OrganizationDeps) {}

  @Get()
  async organization(@Req() request: Request, @Param("organizationId", uuid) organizationId: string) {
    return getOrganization(this.deps.db, await actorOf(request), organizationId);
  }

  @Get("locations")
  async locations(@Req() request: Request, @Param("organizationId", uuid) organizationId: string) {
    return listLocations(this.deps.db, await actorOf(request), organizationId);
  }

  @Get("locations/:locationId")
  async location(@Req() request: Request, @Param("organizationId", uuid) organizationId: string, @Param("locationId", uuid) locationId: string) {
    return getLocation(this.deps.db, await actorOf(request), organizationId, locationId);
  }

  @Post("locations")
  @HttpCode(200)
  @Idempotent()
  @RateLimit("COMMERCIAL_WRITE")
  async addLocation(@Req() request: Request, @Param("organizationId", uuid) organizationId: string, @Body(new ZodValidationPipe(locationInputSchema)) body: z.infer<typeof locationInputSchema>) {
    return createLocation(this.deps.db, await actorOf(request), organizationId, body);
  }

  @Patch("locations/:locationId")
  @RateLimit("COMMERCIAL_WRITE")
  async editLocation(
    @Req() request: Request,
    @Param("organizationId", uuid) organizationId: string,
    @Param("locationId", uuid) locationId: string,
    @Body(new ZodValidationPipe(locationUpdateSchema)) body: z.infer<typeof locationUpdateSchema>,
  ) {
    return updateLocation(this.deps.db, await actorOf(request), organizationId, locationId, body);
  }

  @Get("members")
  async team(@Req() request: Request, @Param("organizationId", uuid) organizationId: string) {
    return listTeam(this.deps.db, await actorOf(request), organizationId);
  }

  @Post("invitations")
  @HttpCode(200)
  @Idempotent()
  @RateLimit("COMMERCIAL_WRITE")
  async invite(@Req() request: Request, @Param("organizationId", uuid) organizationId: string, @Body(new ZodValidationPipe(inviteInputSchema)) body: z.infer<typeof inviteInputSchema>) {
    return inviteMember(this.deps, await actorOf(request), organizationId, body);
  }

  @Post("invitations/:invitationId/revoke")
  @HttpCode(200)
  @RateLimit("COMMERCIAL_WRITE")
  async revoke(@Req() request: Request, @Param("organizationId", uuid) organizationId: string, @Param("invitationId", uuid) invitationId: string) {
    return revokeTeamInvitation(this.deps.db, await actorOf(request), organizationId, invitationId);
  }

  /** Role, permissions and locations. Raising needs `confirmed` and a recent email code (TECH-03 §9). */
  @Patch("members/:membershipId")
  @RateLimit("COMMERCIAL_WRITE")
  async change(
    @Req() request: Request,
    @Param("organizationId", uuid) organizationId: string,
    @Param("membershipId", uuid) membershipId: string,
    @Body(new ZodValidationPipe(memberChangeSchema)) body: z.infer<typeof memberChangeSchema>,
  ) {
    return changeMember(this.deps, await actorOf(request), organizationId, membershipId, body);
  }

  @Post("members/:membershipId/deactivate")
  @HttpCode(200)
  @RateLimit("COMMERCIAL_WRITE")
  async deactivate(
    @Req() request: Request,
    @Param("organizationId", uuid) organizationId: string,
    @Param("membershipId", uuid) membershipId: string,
    @Body(new ZodValidationPipe(memberStatusChangeSchema)) body: z.infer<typeof memberStatusChangeSchema>,
  ) {
    return deactivateMember(this.deps.db, await actorOf(request), organizationId, membershipId, body);
  }

  @Post("members/:membershipId/reactivate")
  @HttpCode(200)
  @RateLimit("COMMERCIAL_WRITE")
  async reactivate(
    @Req() request: Request,
    @Param("organizationId", uuid) organizationId: string,
    @Param("membershipId", uuid) membershipId: string,
    @Body(new ZodValidationPipe(memberStatusChangeSchema)) body: z.infer<typeof memberStatusChangeSchema>,
  ) {
    return reactivateMember(this.deps.db, await actorOf(request), organizationId, membershipId, body);
  }

  @Post("ownership-transfer")
  @HttpCode(200)
  @RateLimit("COMMERCIAL_WRITE")
  async transfer(@Req() request: Request, @Param("organizationId", uuid) organizationId: string, @Body(new ZodValidationPipe(ownershipTransferSchema)) body: z.infer<typeof ownershipTransferSchema>) {
    return transferOwnership(this.deps, await actorOf(request), organizationId, body);
  }
}

/**
 * Opening and accepting an invitation (TECH-03 §11). The secret travels in a
 * header or the body, never in a query string, and is never logged.
 */
@Controller("invitations")
export class InvitationsController {
  constructor(@Inject(HELP_DEPS) private readonly deps: OrganizationDeps) {}

  @Get("preview")
  @RateLimit("GUEST_LINK_VERIFY")
  async preview(@Req() request: Request, @Res({ passthrough: true }) response: Response, @Headers(INVITATION_TOKEN_HEADER) token?: string) {
    noStore(response);
    response.setHeader("referrer-policy", "no-referrer");
    if (!token || token.length < 20 || token.length > 200) throw new AppError("NOT_FOUND");
    return previewInvitation(this.deps.db, token, (await actorOf(request)).now);
  }

  @Post("accept")
  @HttpCode(200)
  @RateLimit("GUEST_LINK_VERIFY")
  async accept(@Req() request: Request, @Body(new ZodValidationPipe(acceptInvitationSchema)) body: z.infer<typeof acceptInvitationSchema>) {
    return acceptInvitation(this.deps.db, await actorOf(request), body.token);
  }
}

/** Staff support view: read only (OPS-FR-080–081). */
@Controller("admin/organizations")
@UseGuards(StaffGuard("ORGANIZATION_SUPPORT"))
export class OrganizationsAdminController {
  constructor(@Inject(HELP_DEPS) private readonly deps: OrganizationDeps) {}

  @Get()
  list(@Query("q") q?: string) {
    return searchOrganizations(this.deps.db, q);
  }

  @Get(":id")
  get(@Param("id", uuid) id: string) {
    return supportOrganization(this.deps.db, id);
  }
}

/** Workspace requests: approve or decline (owner decision 2026-10-08). ORGANIZATION_APPROVE. */
@Controller("admin/organization-requests")
@UseGuards(StaffGuard("ORGANIZATION_APPROVE"))
export class OrganizationRequestsAdminController {
  constructor(@Inject(HELP_DEPS) private readonly deps: OrganizationDeps) {}

  @Get()
  list(@Query("status") status?: string) {
    return listOrganizationRequests(this.deps.db, status);
  }

  @Get(":id")
  get(@Param("id", uuid) id: string) {
    return getOrganizationRequest(this.deps.db, id);
  }

  @Post(":id/approve")
  @HttpCode(200)
  @Idempotent()
  @RateLimit("ADMIN_WRITE")
  async approve(@Req() request: Request, @Param("id", uuid) id: string) {
    return approveOrganizationRequest(this.deps, await actorOf(request), id);
  }

  @Post(":id/decline")
  @HttpCode(200)
  @Idempotent()
  @RateLimit("ADMIN_WRITE")
  async decline(@Req() request: Request, @Param("id", uuid) id: string, @Body(new ZodValidationPipe(declineOrganizationRequestSchema)) body: z.infer<typeof declineOrganizationRequestSchema>) {
    return declineOrganizationRequest(this.deps, await actorOf(request), id, body.reason);
  }
}
