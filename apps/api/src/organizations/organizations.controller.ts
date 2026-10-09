import { Body, Controller, Get, Headers, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, Res, UseGuards } from "@nestjs/common";
import {
  acceptInvitationSchema,
  addAssetVersionSchema,
  createTemplateSchema,
  templateOrderInputSchema,
  decideOrderRequestSchema,
  orderRequestActionSchema,
  updateApprovalPolicySchema,
  requestReapprovalSchema,
  templatePriceInputSchema,
  decideTemplateSchema,
  templateActionSchema,
  updateTemplateSchema,
  createBrandAssetSchema,
  reviewAssetVersionSchema,
  declineOrganizationRequestSchema,
  INVITATION_TOKEN_HEADER,
  inviteInputSchema,
  locationInputSchema,
  locationUpdateSchema,
  memberChangeSchema,
  memberStatusChangeSchema,
  organizationRequestInputSchema,
  ownershipTransferSchema,
  workspaceOrderViewSchema,
} from "@holypearls/contracts";
import type { Request, Response } from "express";
import type { z } from "zod";
import { AppError } from "../errors.js";
import { StaffGuard } from "../identity/staff.guard.js";
import { Idempotent } from "../platform/idempotency.js";
import { RateLimit } from "../platform/rate-limit.js";
import { HELP_DEPS } from "../tokens.js";
import { ZodValidationPipe } from "../validation.js";
import {
  addBrandAssetVersion,
  adminBrandAsset,
  assetReviewQueue,
  changeBrandAssetVersion,
  createBrandAsset,
  getBrandAsset,
  listBrandAssets,
  reviewBrandAssetVersion,
  staffChangeBrandAssetVersion,
} from "./assets.js";
import { cancelOrderRequest, decideOrderRequest, getApprovalPolicy, getOrderRequest, listOrderRequests, requestReapproval, resubmitOrderRequest, updateApprovalPolicy } from "./approvals.js";
import { orderFromTemplate, previewTemplateOrder, templateOrderForm } from "./template-orders.js";
import { adminTemplate, adminTemplateQueue, archiveTemplate, createTemplate, decideTemplate, getTemplate, listTemplates, submitTemplate, templateSources, updateTemplate } from "./templates.js";
import { createLocation, getLocation, getOrganization, listLocations, myOrganizations, updateLocation } from "./organizations.js";
import { approveOrganizationRequest, declineOrganizationRequest, getOrganizationRequest, listOrganizationRequests, myOrganizationRequest, submitOrganizationRequest } from "./requests.js";
import { searchOrganizations, supportOrganization } from "./support.js";
import { workspaceBilling, workspaceOrders, workspaceOverview, workspaceProjects, workspaceSearch } from "./workspace.js";
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
/** A malformed location is treated like one outside the member's locations: 404. */
const locationParam = (value?: string) => {
  if (!value) return null;
  if (!/^[0-9a-f-]{36}$/i.test(value)) throw new AppError("NOT_FOUND");
  return value;
};

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

  /** The overview: Needs Attention, active orders and projects (B2B-FR-010). `location` narrows it to one of yours. */
  @Get("overview")
  async overview(@Req() request: Request, @Param("organizationId", uuid) organizationId: string, @Query("location") location?: string) {
    return workspaceOverview(this.deps.db, await actorOf(request), organizationId, locationParam(location));
  }

  @Get("orders")
  async orders(@Req() request: Request, @Param("organizationId", uuid) organizationId: string, @Query("view") view?: string, @Query("location") location?: string) {
    const chosen = workspaceOrderViewSchema.safeParse(view ?? "all");
    return workspaceOrders(this.deps.db, await actorOf(request), organizationId, chosen.success ? chosen.data : "all", locationParam(location));
  }

  @Get("projects")
  async projects(@Req() request: Request, @Param("organizationId", uuid) organizationId: string, @Query("location") location?: string) {
    return workspaceProjects(this.deps.db, await actorOf(request), organizationId, locationParam(location));
  }

  /** Owner and Admin only (VIEW_BILLING; B2B-FR-012). */
  @Get("billing")
  async billing(@Req() request: Request, @Param("organizationId", uuid) organizationId: string, @Query("location") location?: string) {
    return workspaceBilling(this.deps.db, await actorOf(request), organizationId, locationParam(location));
  }

  @Get("search")
  @RateLimit("SEARCH")
  async search(@Req() request: Request, @Param("organizationId", uuid) organizationId: string, @Query("q") q?: string, @Query("location") location?: string) {
    return workspaceSearch(this.deps.db, await actorOf(request), organizationId, q ?? "", locationParam(location));
  }

  /* Brand assets (T11-01; frames 65–67). Every member sees them; MANAGE_BRAND changes them. */

  @Get("assets")
  async assets(@Req() request: Request, @Param("organizationId", uuid) organizationId: string) {
    return listBrandAssets(this.deps.db, await actorOf(request), organizationId);
  }

  @Get("assets/:assetId")
  async asset(@Req() request: Request, @Param("organizationId", uuid) organizationId: string, @Param("assetId", uuid) assetId: string) {
    return getBrandAsset(this.deps.db, await actorOf(request), organizationId, assetId);
  }

  @Post("assets")
  @HttpCode(200)
  @Idempotent()
  @RateLimit("COMMERCIAL_WRITE")
  async createAsset(@Req() request: Request, @Param("organizationId", uuid) organizationId: string, @Body(new ZodValidationPipe(createBrandAssetSchema)) body: z.infer<typeof createBrandAssetSchema>) {
    return createBrandAsset(this.deps.db, await actorOf(request), organizationId, body);
  }

  /** Replace version: adds V(n+1) and keeps every earlier version (B2B-FR-023). */
  @Post("assets/:assetId/versions")
  @HttpCode(200)
  @Idempotent()
  @RateLimit("COMMERCIAL_WRITE")
  async addVersion(
    @Req() request: Request,
    @Param("organizationId", uuid) organizationId: string,
    @Param("assetId", uuid) assetId: string,
    @Body(new ZodValidationPipe(addAssetVersionSchema)) body: z.infer<typeof addAssetVersionSchema>,
  ) {
    return addBrandAssetVersion(this.deps.db, await actorOf(request), organizationId, assetId, body.fileId);
  }

  @Post("assets/:assetId/versions/:versionId/:action")
  @HttpCode(200)
  @RateLimit("COMMERCIAL_WRITE")
  async changeVersion(
    @Req() request: Request,
    @Param("organizationId", uuid) organizationId: string,
    @Param("assetId", uuid) assetId: string,
    @Param("versionId", uuid) versionId: string,
    @Param("action") action: string,
  ) {
    if (action !== "retire" && action !== "archive") throw new AppError("NOT_FOUND");
    return changeBrandAssetVersion(this.deps.db, await actorOf(request), organizationId, assetId, versionId, action);
  }

  /* Workspace Product Templates (T11-01b; frames 29, 67–69). */

  @Get("templates")
  async templates(@Req() request: Request, @Param("organizationId", uuid) organizationId: string, @Query("archived") archived?: string) {
    return listTemplates(this.deps.db, await actorOf(request), organizationId, { archived: archived === "1" });
  }

  /** Where a new template can start: ordered items in your locations and your saved designs (MANAGE_BRAND). */
  @Get("templates/sources")
  async templateSources(@Req() request: Request, @Param("organizationId", uuid) organizationId: string) {
    return templateSources(this.deps.db, await actorOf(request), organizationId);
  }

  @Get("templates/:templateId")
  async template(@Req() request: Request, @Param("organizationId", uuid) organizationId: string, @Param("templateId", uuid) templateId: string) {
    return getTemplate(this.deps.db, await actorOf(request), organizationId, templateId);
  }

  @Post("templates")
  @HttpCode(200)
  @Idempotent()
  @RateLimit("COMMERCIAL_WRITE")
  async createTemplate(@Req() request: Request, @Param("organizationId", uuid) organizationId: string, @Body(new ZodValidationPipe(createTemplateSchema)) body: z.infer<typeof createTemplateSchema>) {
    return createTemplate(this.deps.db, await actorOf(request), organizationId, body);
  }

  /** Any change sends the template back to DRAFT for another HolyPearls check. */
  @Put("templates/:templateId")
  @RateLimit("COMMERCIAL_WRITE")
  async updateTemplate(
    @Req() request: Request,
    @Param("organizationId", uuid) organizationId: string,
    @Param("templateId", uuid) templateId: string,
    @Body(new ZodValidationPipe(updateTemplateSchema)) body: z.infer<typeof updateTemplateSchema>,
  ) {
    return updateTemplate(this.deps.db, await actorOf(request), organizationId, templateId, body);
  }

  /* Internal approval (T11-04; frames 72–73). */

  @Get("approvals/policy")
  async approvalPolicy(@Req() request: Request, @Param("organizationId", uuid) organizationId: string) {
    return getApprovalPolicy(this.deps.db, await actorOf(request), organizationId);
  }

  @Put("approvals/policy")
  @RateLimit("COMMERCIAL_WRITE")
  async updateApprovalPolicy(@Req() request: Request, @Param("organizationId", uuid) organizationId: string, @Body(new ZodValidationPipe(updateApprovalPolicySchema)) body: z.infer<typeof updateApprovalPolicySchema>) {
    return updateApprovalPolicy(this.deps.db, await actorOf(request), organizationId, body);
  }

  @Get("order-requests")
  async orderRequests(@Req() request: Request, @Param("organizationId", uuid) organizationId: string) {
    return listOrderRequests(this.deps.db, await actorOf(request), organizationId);
  }

  @Get("order-requests/:requestId")
  async orderRequest(@Req() request: Request, @Param("organizationId", uuid) organizationId: string, @Param("requestId", uuid) requestId: string) {
    return getOrderRequest(this.deps.db, await actorOf(request), organizationId, requestId);
  }

  @Post("order-requests/:requestId/decision")
  @HttpCode(200)
  @Idempotent()
  @RateLimit("COMMERCIAL_WRITE")
  async decideOrderRequest(
    @Req() request: Request,
    @Param("organizationId", uuid) organizationId: string,
    @Param("requestId", uuid) requestId: string,
    @Body(new ZodValidationPipe(decideOrderRequestSchema)) body: z.infer<typeof decideOrderRequestSchema>,
  ) {
    return decideOrderRequest(this.deps, await actorOf(request), organizationId, requestId, body);
  }

  /** "Send for reapproval" (T11-04b; frame 48): HolyPearls' quote is above the approved amount. */
  @Post("order-requests/:requestId/reapproval")
  @HttpCode(200)
  @RateLimit("COMMERCIAL_WRITE")
  async requestReapproval(
    @Req() request: Request,
    @Param("organizationId", uuid) organizationId: string,
    @Param("requestId", uuid) requestId: string,
    @Body(new ZodValidationPipe(requestReapprovalSchema)) body: z.infer<typeof requestReapprovalSchema>,
  ) {
    return requestReapproval(this.deps, await actorOf(request), organizationId, requestId, body);
  }

  @Post("order-requests/:requestId/:action")
  @HttpCode(200)
  @RateLimit("COMMERCIAL_WRITE")
  async orderRequestAction(
    @Req() request: Request,
    @Param("organizationId", uuid) organizationId: string,
    @Param("requestId", uuid) requestId: string,
    @Param("action") action: string,
    @Body(new ZodValidationPipe(orderRequestActionSchema)) body: z.infer<typeof orderRequestActionSchema>,
  ) {
    const actor = await actorOf(request);
    if (action === "cancel") return cancelOrderRequest(this.deps.db, actor, organizationId, requestId, body.version);
    if (action === "resubmit") return resubmitOrderRequest(this.deps, actor, organizationId, requestId, body.version);
    throw new AppError("NOT_FOUND");
  }

  /* Order from a template (T11-01c; frame 131). */

  @Get("templates/:templateId/order")
  async templateOrderForm(@Req() request: Request, @Param("organizationId", uuid) organizationId: string, @Param("templateId", uuid) templateId: string) {
    return templateOrderForm(this.deps.db, await actorOf(request), organizationId, templateId);
  }

  @Post("templates/:templateId/price")
  @HttpCode(200)
  @RateLimit("COMMERCIAL_WRITE")
  async templatePrice(
    @Req() request: Request,
    @Param("organizationId", uuid) organizationId: string,
    @Param("templateId", uuid) templateId: string,
    @Body(new ZodValidationPipe(templatePriceInputSchema)) body: z.infer<typeof templatePriceInputSchema>,
  ) {
    return previewTemplateOrder(this.deps.db, await actorOf(request), organizationId, templateId, body);
  }

  @Post("templates/:templateId/orders")
  @HttpCode(200)
  @Idempotent()
  @RateLimit("COMMERCIAL_WRITE")
  async orderFromTemplate(
    @Req() request: Request,
    @Param("organizationId", uuid) organizationId: string,
    @Param("templateId", uuid) templateId: string,
    @Body(new ZodValidationPipe(templateOrderInputSchema)) body: z.infer<typeof templateOrderInputSchema>,
  ) {
    return orderFromTemplate(this.deps, await actorOf(request), organizationId, templateId, body);
  }

  @Post("templates/:templateId/:action")
  @HttpCode(200)
  @RateLimit("COMMERCIAL_WRITE")
  async templateAction(
    @Req() request: Request,
    @Param("organizationId", uuid) organizationId: string,
    @Param("templateId", uuid) templateId: string,
    @Param("action") action: string,
    @Body(new ZodValidationPipe(templateActionSchema)) body: z.infer<typeof templateActionSchema>,
  ) {
    const actor = await actorOf(request);
    if (action === "submit") return submitTemplate(this.deps.db, actor, organizationId, templateId, body.version);
    if (action === "archive") return archiveTemplate(this.deps.db, actor, organizationId, templateId, body.version);
    throw new AppError("NOT_FOUND");
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

/** Brand asset production review (frame 116; OPS-FR-083). STAFF_ADMIN until the owner chooses a permission. */
@Controller("admin/brand-assets")
@UseGuards(StaffGuard("STAFF_ADMIN"))
export class BrandAssetsAdminController {
  constructor(@Inject(HELP_DEPS) private readonly deps: OrganizationDeps) {}

  @Get("review")
  queue(@Query("status") status?: string) {
    return assetReviewQueue(this.deps.db, status);
  }

  @Get(":assetId")
  get(@Param("assetId", uuid) assetId: string) {
    return adminBrandAsset(this.deps.db, assetId);
  }

  @Post("versions/:versionId/review")
  @HttpCode(200)
  @Idempotent()
  @RateLimit("ADMIN_WRITE")
  async review(@Req() request: Request, @Param("versionId", uuid) versionId: string, @Body(new ZodValidationPipe(reviewAssetVersionSchema)) body: z.infer<typeof reviewAssetVersionSchema>) {
    return reviewBrandAssetVersion(this.deps, await actorOf(request), versionId, body);
  }

  @Post("versions/:versionId/:action")
  @HttpCode(200)
  @RateLimit("ADMIN_WRITE")
  async change(@Req() request: Request, @Param("versionId", uuid) versionId: string, @Param("action") action: string) {
    if (action !== "retire" && action !== "archive") throw new AppError("NOT_FOUND");
    return staffChangeBrandAssetVersion(this.deps.db, await actorOf(request), versionId, action);
  }
}

/** Template approval (frame 117; OPS-FR-082). STAFF_ADMIN until the owner chooses a permission. */
@Controller("admin/templates")
@UseGuards(StaffGuard("STAFF_ADMIN"))
export class TemplatesAdminController {
  constructor(@Inject(HELP_DEPS) private readonly deps: OrganizationDeps) {}

  @Get()
  queue(@Query("status") status?: string) {
    return adminTemplateQueue(this.deps.db, status);
  }

  @Get(":templateId")
  get(@Param("templateId", uuid) templateId: string) {
    return adminTemplate(this.deps.db, templateId);
  }

  @Post(":templateId/decision")
  @HttpCode(200)
  @Idempotent()
  @RateLimit("ADMIN_WRITE")
  async decide(@Req() request: Request, @Param("templateId", uuid) templateId: string, @Body(new ZodValidationPipe(decideTemplateSchema)) body: z.infer<typeof decideTemplateSchema>) {
    return decideTemplate(this.deps.db, await actorOf(request), templateId, body);
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
