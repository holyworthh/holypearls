import {
  accountHistorySchema,
  profileInputSchema,
  profileSchema,
  adminMeSchema,
  apiErrorSchema,
  adminHelpRequestSchema,
  addProductMediaSchema,
  optionImageInputSchema,
  adminCategoryListSchema,
  adminCategorySchema,
  bulkProductStatusResultSchema,
  bulkProductStatusSchema,
  changeCategoryStatusSchema,
  createCategorySchema,
  reorderProductMediaSchema,
  setRelatedProductsSchema,
  updateCategorySchema,
  updateProductMediaSchema,
  adminHubSchema,
  adminMerchandisingListsSchema,
  publicCategoryTreeSchema,
  publicHubSchema,
  publicProductPageSchema,
  publicProductSchema,
  publishHubSchema,
  saveHubDraftSchema,
  saveMerchandisingListSchema,
  storefrontNavigationSchema,
  adminPriceRuleListSchema,
  adminPriceRuleSchema,
  adminProductRulesSchema,
  adminTaxSettingListSchema,
  priceRequestSchema,
  priceResultSchema,
  priceRuleInputSchema,
  saveCompatibilitySchema,
  saveProductRulesSchema,
  taxSettingInputSchema,
  attachConfigurationFileSchema,
  lowResolutionActionSchema,
  personalizationImportSchema,
  personalizationResultSchema,
  configurationSchema,
  createConfigurationSchema,
  emailDraftSchema,
  quoteRequestResultSchema,
  addToCartSchema,
  cartQuoteRequestResultSchema,
  cartQuoteRequestSchema,
  cartSchema,
  checkoutAddressSchema,
  checkoutBillingSchema,
  checkoutContactSchema,
  checkoutDeliverySchema,
  checkoutSchema,
  deliveryZoneInputSchema,
  adminShipmentSchema,
  bookCourierSchema,
  courierCategoriesSchema,
  courierSettingsInputSchema,
  courierSettingsSchema,
  deliveryPriceInputSchema,
  deliveryPriceQueueSchema,
  deliveryZoneListSchema,
  deliveryZoneSchema,
  fixedZoneInputSchema,
  quoteRequestSchema,
  updateConfigurationSchema,
  adminProductPageSchema,
  adminProductOptionsSchema,
  adminProductSchema,
  changeProductStatusSchema,
  createProductSchema,
  updateProductSchema,
  auditEntrySchema,
  auditPageSchema,
  createHelpRequestSchema,
  createUploadSchema,
  fileUrlSchema,
  fileViewSchema,
  uploadCreatedSchema,
  emailCodeSentSchema,
  emailCodeVerifiedSchema,
  helpInboxSchema,
  helpRequestSchema,
  notificationEntrySchema,
  notificationPageSchema,
  redeemGuestLinkSchema,
  redeemResultSchema,
  replyToHelpSchema,
  requestEmailCodeSchema,
  verifyEmailCodeSchema,
  grantPermissionSchema,
  staffAccessSchema,
  demoSliceCreateSchema,
  demoSliceSchema,
  healthLiveSchema,
  healthReadySchema,
  meSchema,
  revokeAllResultSchema,
  sessionListSchema,
  searchSuggestionsSchema,
  searchResultsSchema,
  searchClickSchema,
  searchPhraseListSchema,
  createSearchPhraseSchema,
  searchPhraseSchema,
  searchTargetOptionsSchema,
  searchReportSchema,
  sitemapSchema,
  contentIndexSchema,
  publicContentPageSchema,
  adminContentListSchema,
  createContentPageSchema,
  adminContentPageSchema,
  updateContentPageSchema,
  publishContentPageSchema,
  changeContentStatusSchema,
  acceptInvitationSchema,
  acceptedInvitationSchema,
  adminOrganizationListSchema,
  adminOrganizationRequestListSchema,
  adminOrganizationRequestSchema,
  adminOrganizationSchema,
  declineOrganizationRequestSchema,
  invitationPreviewSchema,
  inviteInputSchema,
  locationDetailSchema,
  locationInputSchema,
  locationListSchema,
  locationUpdateSchema,
  memberChangeSchema,
  memberStatusChangeSchema,
  myOrganizationRequestSchema,
  myOrganizationSchema,
  myOrganizationsSchema,
  organizationRequestInputSchema,
  organizationRequestSchema,
  ownershipTransferSchema,
  teamInvitationSchema,
  teamMemberSchema,
  teamSchema,
  checkoutSchema as placedCheckoutSchema,
  projectSchema as placedProjectSchema,
  setPlacedForSchema,
  workspaceBillingSchema,
  workspaceOrderListSchema,
  workspaceOverviewSchema,
  workspaceProjectListSchema,
  workspaceSearchSchema,
  addAssetVersionSchema,
  adminAssetReviewListSchema,
  adminAssetSchema,
  adminTemplateListSchema,
  collectionActionSchema,
  collectionDashboardSchema,
  participantActionSchema,
  reopenCollectionSchema,
  collectionInviteSchema,
  collectionListSchema,
  collectionSchema,
  joinCollectionSchema,
  participationSchema,
  saveParticipationSchema,
  submitParticipationSchema,
  createCollectionSchema,
  updateCollectionSchema,
  approvalPolicySchema,
  decideOrderRequestSchema,
  orderRequestActionSchema,
  orderRequestListSchema,
  orderRequestSchema,
  requestReapprovalSchema,
  updateApprovalPolicySchema,
  adminTemplateSchema,
  brandAssetListSchema,
  brandAssetSchema,
  createTemplateSchema,
  decideTemplateSchema,
  templateActionSchema,
  templateListSchema,
  templateOrderFormSchema,
  templateOrderInputSchema,
  templateOrderResultSchema,
  templatePriceInputSchema,
  templateSchema,
  templateSourceListSchema,
  updateTemplateSchema,
  createBrandAssetSchema,
  reviewAssetVersionSchema,
} from "@holypearls/contracts";
import { z } from "zod";

type Schema = z.ZodType;

// OpenAPI 3.1 uses JSON Schema 2020-12, which Zod generates directly.
const jsonSchema = (schema: Schema) => {
  const generated: Record<string, unknown> = z.toJSONSchema(schema, { target: "draft-2020-12", io: "output" });
  delete generated.$schema;
  return generated;
};

const json = (schema: Schema | { $ref: string }) => ({
  "application/json": { schema: "$ref" in schema ? schema : jsonSchema(schema) },
});

const ERROR_REF = { $ref: "#/components/schemas/ApiError" };
const error = (description: string) => ({ description, content: json(ERROR_REF) });
const signedIn = { 401: error("Not signed in (NOT_SIGNED_IN)") };
const uuidParam = (name: string) => ({ name, in: "path", required: true, schema: { type: "string", format: "uuid" } });
const idempotencyHeader = {
  name: "Idempotency-Key",
  in: "header",
  required: true,
  description: "Created once per button press and reused on retry (TECH-02 §4).",
  schema: { type: "string", minLength: 16, maxLength: 128 },
};
const highRisk = {
  403: error("Not STAFF_ADMIN (FORBIDDEN), no recent authenticator check (RECENT_MFA_REQUIRED) or a rule such as keeping two STAFF_ADMINs"),
  404: error("Not staff, or no such staff member (NOT_FOUND)"),
  429: error("ADMIN_WRITE limit (RATE_LIMITED)"),
};
const staffOnly = {
  403: error("Staff without an authenticator check (MFA_REQUIRED) or without the permission (FORBIDDEN)"),
  404: error("Not staff (NOT_FOUND)"),
};

/** Organizations, team and invitations (T10-01; PRD-05 B2B-FR-001–003, 090–093; TECH-03 §7, §9, §11). */
const member = { ...signedIn, 404: error("Not an ACTIVE member of this organization, or outside your locations (NOT_FOUND)") };
const teamWrite = {
  ...member,
  400: error("Invalid input (VALIDATION_FAILED)"),
  403: error("Missing the permission, or granting more than you hold (FORBIDDEN, reason such as PERMISSION_REQUIRED, OWNER_REQUIRED, CANNOT_GRANT_WHAT_YOU_DONT_HOLD, OUTSIDE_YOUR_LOCATIONS); raising access without a recent email code (RECENT_EMAIL_CODE_REQUIRED)"),
  409: error("Someone else changed this member first (VERSION_CONFLICT)"),
  422: error("Needs confirming (RULE_FAILED, reason CONFIRMATION_REQUIRED, with what it adds), or a rule such as LAST_OWNER, SELF, MEMBER_DEACTIVATED"),
};
const orgParam = uuidParam("organizationId");
const organizationPaths = {
  "/v1/me/organizations": {
    get: { summary: "Your workspaces: each ACTIVE membership with its role, permissions and locations", responses: { 200: { description: "Workspaces", content: json(myOrganizationsSchema) }, ...signedIn } },
  },
  "/v1/me/organization-request": {
    get: { summary: "Your latest workspace request, or null (owner decision 2026-10-08)", responses: { 200: { description: "Request", content: json(myOrganizationRequestSchema) }, ...signedIn } },
    post: {
      summary: "Ask HolyPearls for a workspace: company, locations, team size and a note. Needs a verified email; one request waits at a time.",
      parameters: [idempotencyHeader],
      requestBody: { required: true, content: json(organizationRequestInputSchema) },
      responses: { 200: { description: "Sent to staff", content: json(organizationRequestSchema) }, ...signedIn, 400: error("Invalid input"), 422: error("VERIFY_EMAIL_FIRST or REQUEST_PENDING (RULE_FAILED)"), 429: error("CONTACT limit (RATE_LIMITED)") },
    },
  },
  "/v1/organizations/{organizationId}": {
    get: { summary: "The organization and your place in it (display only; the server checks every action)", parameters: [orgParam], responses: { 200: { description: "Organization", content: json(myOrganizationSchema) }, ...member } },
  },
  "/v1/organizations/{organizationId}/locations": {
    get: { summary: "Locations you can see: all of them with All locations, otherwise only yours", parameters: [orgParam], responses: { 200: { description: "Locations", content: json(locationListSchema) }, ...member } },
    post: {
      summary: "Add a location (MANAGE_TEAM and All locations)",
      parameters: [orgParam, idempotencyHeader],
      requestBody: { required: true, content: json(locationInputSchema) },
      responses: { 200: { description: "Added", content: json(locationDetailSchema) }, ...teamWrite },
    },
  },
  "/v1/organizations/{organizationId}/locations/{locationId}": {
    get: { summary: "A location and the members who can reach it; outside your locations is 404", parameters: [orgParam, uuidParam("locationId")], responses: { 200: { description: "Location", content: json(locationDetailSchema) }, ...member } },
    patch: {
      summary: "Rename a location (MANAGE_TEAM and All locations)",
      parameters: [orgParam, uuidParam("locationId")],
      requestBody: { required: true, content: json(locationUpdateSchema) },
      responses: { 200: { description: "Saved", content: json(locationDetailSchema) }, ...teamWrite },
    },
  },
  "/v1/organizations/{organizationId}/members": {
    get: { summary: "The team and its waiting or expired invitations, within your locations (MANAGE_TEAM)", parameters: [orgParam], responses: { 200: { description: "Team", content: json(teamSchema) }, ...member, 403: error("No MANAGE_TEAM (FORBIDDEN)") } },
  },
  "/v1/organizations/{organizationId}/invitations": {
    post: {
      summary: "Invite someone with a role and locations; the email carries a one-time link that expires after 7 days (B2B-FR-090)",
      parameters: [orgParam, idempotencyHeader],
      requestBody: { required: true, content: json(inviteInputSchema) },
      responses: { 200: { description: "Invited", content: json(teamInvitationSchema) }, ...teamWrite },
    },
  },
  "/v1/organizations/{organizationId}/invitations/{invitationId}/revoke": {
    post: { summary: "Cancel a waiting invitation", parameters: [orgParam, uuidParam("invitationId")], responses: { 200: { description: "Revoked" }, ...teamWrite } },
  },
  "/v1/organizations/{organizationId}/members/{membershipId}": {
    patch: {
      summary: "Change a member's role, permissions (Owners only) and locations. Raising access needs confirmed: true and an email code in the last 24 hours (TECH-03 §9).",
      parameters: [orgParam, uuidParam("membershipId")],
      requestBody: { required: true, content: json(memberChangeSchema) },
      responses: { 200: { description: "Changed", content: json(teamMemberSchema) }, ...teamWrite },
    },
  },
  "/v1/organizations/{organizationId}/members/{membershipId}/deactivate": {
    post: {
      summary: "Deactivate a member: access ends on their next request; history stays (B2B-FR-093). The last Owner can't be deactivated.",
      parameters: [orgParam, uuidParam("membershipId")],
      requestBody: { required: true, content: json(memberStatusChangeSchema) },
      responses: { 200: { description: "Deactivated", content: json(teamMemberSchema) }, ...teamWrite },
    },
  },
  "/v1/organizations/{organizationId}/members/{membershipId}/reactivate": {
    post: {
      summary: "Reactivate a member (raising access: confirmation and a recent email code)",
      parameters: [orgParam, uuidParam("membershipId")],
      requestBody: { required: true, content: json(memberStatusChangeSchema) },
      responses: { 200: { description: "Reactivated", content: json(teamMemberSchema) }, ...teamWrite },
    },
  },
  "/v1/organizations/{organizationId}/ownership-transfer": {
    post: {
      summary: "Make another member an Owner, optionally stepping down to Admin (Owner only; confirmation and a recent email code)",
      parameters: [orgParam],
      requestBody: { required: true, content: json(ownershipTransferSchema) },
      responses: { 200: { description: "The team after the transfer", content: json(teamSchema) }, ...teamWrite },
    },
  },
  "/v1/invitations/preview": {
    get: {
      summary: "What an invitation link opens: organization, role, masked email and status. The secret goes in the x-hp-invitation header, never the URL.",
      parameters: [{ name: "x-hp-invitation", in: "header", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "Invitation", content: json(invitationPreviewSchema) }, 404: error("Unknown link (NOT_FOUND)"), 429: error("GUEST_LINK_VERIFY limit (RATE_LIMITED)") },
    },
  },
  "/v1/invitations/accept": {
    post: {
      summary: "Accept an invitation: signed in, with the invited email verified; works once (TECH-03 §11)",
      requestBody: { required: true, content: json(acceptInvitationSchema) },
      responses: {
        200: { description: "Joined", content: json(acceptedInvitationSchema) },
        ...signedIn,
        404: error("Unknown link (NOT_FOUND)"),
        422: error("RULE_FAILED, reason INVITATION_ACCEPTED, INVITATION_EXPIRED, INVITATION_REVOKED, VERIFY_EMAIL_FIRST, WRONG_ACCOUNT or ALREADY_MEMBER"),
      },
    },
  },
  "/v1/admin/organizations": {
    get: {
      summary: "Staff support view: search organizations by name (ORGANIZATION_SUPPORT, read only)",
      parameters: [{ name: "q", in: "query", required: false, schema: { type: "string" } }],
      responses: { 200: { description: "Organizations", content: json(adminOrganizationListSchema) }, ...staffOnly },
    },
  },
  "/v1/admin/organizations/{id}": {
    get: { summary: "Staff support view: locations, members and invitations (ORGANIZATION_SUPPORT, read only)", parameters: [uuidParam("id")], responses: { 200: { description: "Organization", content: json(adminOrganizationSchema) }, ...staffOnly } },
  },
  "/v1/admin/organization-requests": {
    get: {
      summary: "Workspace requests, newest first (ORGANIZATION_APPROVE)",
      parameters: [{ name: "status", in: "query", required: false, schema: { type: "string", enum: ["PENDING", "APPROVED", "DECLINED"] } }],
      responses: { 200: { description: "Requests", content: json(adminOrganizationRequestListSchema) }, ...staffOnly },
    },
  },
  "/v1/admin/organization-requests/{id}": {
    get: { summary: "One workspace request (ORGANIZATION_APPROVE)", parameters: [uuidParam("id")], responses: { 200: { description: "Request", content: json(adminOrganizationRequestSchema) }, ...staffOnly } },
  },
  "/v1/admin/organization-requests/{id}/approve": {
    post: {
      summary: "Approve: creates the organization and its locations, and makes the requester its ACTIVE Owner (ORGANIZATION_APPROVE; audited; emails the requester)",
      parameters: [uuidParam("id"), idempotencyHeader],
      responses: { 200: { description: "Approved", content: json(adminOrganizationRequestSchema) }, ...staffOnly, 422: error("ALREADY_DECIDED or REQUESTER_UNVERIFIED (RULE_FAILED)") },
    },
  },
  "/v1/admin/organization-requests/{id}/decline": {
    post: {
      summary: "Decline with a reason the requester sees (ORGANIZATION_APPROVE; audited; emails the requester)",
      parameters: [uuidParam("id"), idempotencyHeader],
      requestBody: { required: true, content: json(declineOrganizationRequestSchema) },
      responses: { 200: { description: "Declined", content: json(adminOrganizationRequestSchema) }, ...staffOnly, 400: error("No reason"), 422: error("ALREADY_DECIDED (RULE_FAILED)") },
    },
  },
};

const locationQuery = { name: "location", in: "query", required: false, description: "Narrow to one of your locations (the switcher); another location is 404.", schema: { type: "string", format: "uuid" } };
const workspacePaths = {
  "/v1/checkouts/{id}/placed-for": {
    put: {
      summary: "Who the order is for: an organization and one of your locations, or null for a personal order (T10-03). Needs CREATE_REQUESTS; the order keeps it.",
      parameters: [uuidParam("id")],
      requestBody: { required: true, content: json(setPlacedForSchema) },
      responses: { 200: { description: "Saved", content: json(placedCheckoutSchema) }, 403: error("No CREATE_REQUESTS (FORBIDDEN)"), 404: error("Not your checkout, not a member, or a location outside yours (NOT_FOUND)"), 409: error("Changed in another tab, or closed (CONFLICT)") },
    },
  },
  "/v1/projects/{id}/placed-for": {
    put: {
      summary: "Who the project is for, while it is a draft (T10-03). Its quote and order keep it.",
      parameters: [uuidParam("id")],
      requestBody: { required: true, content: json(setPlacedForSchema) },
      responses: { 200: { description: "Saved", content: json(placedProjectSchema) }, 403: error("No CREATE_REQUESTS (FORBIDDEN)"), 404: error("Not yours, not a member, or a location outside yours (NOT_FOUND)"), 409: error("VERSION_CONFLICT") },
    },
  },
  "/v1/organizations/{organizationId}/overview": {
    get: { summary: "The workspace overview: Needs Attention, active orders and projects (B2B-FR-010)", parameters: [orgParam, locationQuery], responses: { 200: { description: "Overview", content: json(workspaceOverviewSchema) }, ...member } },
  },
  "/v1/organizations/{organizationId}/orders": {
    get: {
      summary: "The organization's orders in your locations: needs attention, active, complete or all (B2B-FR-011). Buyers see only their own.",
      parameters: [orgParam, { name: "view", in: "query", required: false, schema: { type: "string", enum: ["attention", "active", "complete", "all"] } }, locationQuery],
      responses: { 200: { description: "Orders", content: json(workspaceOrderListSchema) }, ...member },
    },
  },
  "/v1/organizations/{organizationId}/projects": {
    get: { summary: "The organization's projects in your locations, grouped by status (Pen 64)", parameters: [orgParam, locationQuery], responses: { 200: { description: "Projects", content: json(workspaceProjectListSchema) }, ...member } },
  },
  "/v1/organizations/{organizationId}/billing": {
    get: { summary: "Balances due, receipts and payment history across the organization (VIEW_BILLING: Owner and Admin; B2B-FR-012)", parameters: [orgParam, locationQuery], responses: { 200: { description: "Billing", content: json(workspaceBillingSchema) }, ...member, 403: error("No VIEW_BILLING (FORBIDDEN)") } },
  },
  "/v1/organizations/{organizationId}/search": {
    get: {
      summary: "Search orders and projects you may see; never another location (B2B-FR-013)",
      parameters: [orgParam, { name: "q", in: "query", required: true, schema: { type: "string" } }, locationQuery],
      responses: { 200: { description: "Results", content: json(workspaceSearchSchema) }, ...member, 429: error("SEARCH limit (RATE_LIMITED)") },
    },
  },
};

const assetParam = uuidParam("assetId");
const assetWrite = { ...member, 400: error("Invalid input, or a file that isn't your new brand-asset upload (VALIDATION_FAILED)"), 403: error("No MANAGE_BRAND (FORBIDDEN)"), 422: error("RULE_FAILED, reason NOT_IN_USE or ALREADY_ARCHIVED") };
const assetPaths = {
  "/v1/organizations/{organizationId}/assets": {
    get: { summary: "The organization's brand assets with their current and newest versions (T11-01; every member)", parameters: [orgParam], responses: { 200: { description: "Assets", content: json(brandAssetListSchema) }, ...member } },
    post: { summary: "Add a brand asset with its first file (MANAGE_BRAND). HolyPearls checks it before production use.", parameters: [orgParam, idempotencyHeader], requestBody: { required: true, content: json(createBrandAssetSchema) }, responses: { 200: { description: "Added", content: json(brandAssetSchema) }, ...assetWrite } },
  },
  "/v1/organizations/{organizationId}/assets/{assetId}": {
    get: { summary: "One brand asset and every version, newest first", parameters: [orgParam, assetParam], responses: { 200: { description: "Asset", content: json(brandAssetSchema) }, ...member } },
  },
  "/v1/organizations/{organizationId}/assets/{assetId}/versions": {
    post: { summary: "Replace version: adds V(n+1) and keeps every earlier version (B2B-FR-023; MANAGE_BRAND)", parameters: [orgParam, assetParam, idempotencyHeader], requestBody: { required: true, content: json(addAssetVersionSchema) }, responses: { 200: { description: "Added", content: json(brandAssetSchema) }, ...assetWrite } },
  },
  "/v1/organizations/{organizationId}/assets/{assetId}/versions/{versionId}/retire": {
    post: { summary: "Retire a version in use for new orders; past orders keep it (MANAGE_BRAND)", parameters: [orgParam, assetParam, uuidParam("versionId")], responses: { 200: { description: "Retired", content: json(brandAssetSchema) }, ...assetWrite } },
  },
  "/v1/organizations/{organizationId}/assets/{assetId}/versions/{versionId}/archive": {
    post: { summary: "Archive a version from any status; it stays in history (MANAGE_BRAND)", parameters: [orgParam, assetParam, uuidParam("versionId")], responses: { 200: { description: "Archived", content: json(brandAssetSchema) }, ...assetWrite } },
  },
  "/v1/admin/brand-assets/review": {
    get: { summary: "Asset versions waiting for HolyPearls' production check (STAFF_ADMIN until a permission is chosen)", parameters: [{ name: "status", in: "query", required: false, schema: { type: "string", enum: ["NEEDS_REVIEW", "PROCESSING"] } }], responses: { 200: { description: "Versions", content: json(adminAssetReviewListSchema) }, ...staffOnly } },
  },
  "/v1/admin/brand-assets/{assetId}": {
    get: { summary: "One brand asset for staff", parameters: [assetParam], responses: { 200: { description: "Asset", content: json(adminAssetSchema) }, ...staffOnly } },
  },
  "/v1/admin/brand-assets/versions/{versionId}/review": {
    post: { summary: "Mark PRODUCTION_READY (supersedes the previous ready version) or keep in review with a note; emails the uploader", parameters: [uuidParam("versionId"), idempotencyHeader], requestBody: { required: true, content: json(reviewAssetVersionSchema) }, responses: { 200: { description: "Decided", content: json(adminAssetSchema) }, ...staffOnly, 400: error("A note is needed to keep it in review"), 422: error("NOT_IN_REVIEW (RULE_FAILED)") } },
  },
  "/v1/admin/brand-assets/versions/{versionId}/retire": {
    post: { summary: "Staff retire a version for new orders", parameters: [uuidParam("versionId")], responses: { 200: { description: "Retired", content: json(adminAssetSchema) }, ...staffOnly, 422: error("NOT_IN_USE (RULE_FAILED)") } },
  },
  "/v1/admin/brand-assets/versions/{versionId}/archive": {
    post: { summary: "Staff archive a version", parameters: [uuidParam("versionId")], responses: { 200: { description: "Archived", content: json(adminAssetSchema) }, ...staffOnly, 422: error("ALREADY_ARCHIVED (RULE_FAILED)") } },
  },
};

const templateParam = uuidParam("templateId");
const templateWrite = { ...member, 400: error("Invalid input (VALIDATION_FAILED)"), 403: error("No MANAGE_BRAND, or a location you can't grant (FORBIDDEN)"), 409: error("Someone else changed it (VERSION_CONFLICT)") };
const templatePaths = {
  "/v1/organizations/{organizationId}/templates": {
    get: { summary: "Templates the member can see: theirs by location; drafts only with MANAGE_BRAND (T11-01b)", parameters: [orgParam, { name: "archived", in: "query", required: false, schema: { type: "string", enum: ["1"] } }], responses: { 200: { description: "Templates", content: json(templateListSchema) }, ...member } },
    post: { summary: "Start a draft from an ordered item or your saved design, with production-ready asset versions (MANAGE_BRAND)", parameters: [orgParam, idempotencyHeader], requestBody: { required: true, content: json(createTemplateSchema) }, responses: { 200: { description: "Draft", content: json(templateSchema) }, ...templateWrite, 422: error("ASSET_NOT_READY (RULE_FAILED)") } },
  },
  "/v1/organizations/{organizationId}/templates/sources": {
    get: { summary: "Where a template can start: ordered items in your locations and your saved designs (MANAGE_BRAND)", parameters: [orgParam], responses: { 200: { description: "Sources", content: json(templateSourceListSchema) }, ...member, 403: error("No MANAGE_BRAND (FORBIDDEN)") } },
  },
  "/v1/organizations/{organizationId}/templates/{templateId}": {
    get: { summary: "One template with its locked and editable fields, reasons and asset versions", parameters: [orgParam, templateParam], responses: { 200: { description: "Template", content: json(templateSchema) }, ...member } },
    put: { summary: "Change fields, reasons, asset versions or locations; any change sends it back to DRAFT (MANAGE_BRAND)", parameters: [orgParam, templateParam], requestBody: { required: true, content: json(updateTemplateSchema) }, responses: { 200: { description: "Saved as draft", content: json(templateSchema) }, ...templateWrite, 422: error("ARCHIVED or ASSET_NOT_READY (RULE_FAILED)") } },
  },
  "/v1/organizations/{organizationId}/templates/{templateId}/submit": {
    post: { summary: "Send a draft or blocked template for HolyPearls' check (MANAGE_BRAND)", parameters: [orgParam, templateParam], requestBody: { required: true, content: json(templateActionSchema) }, responses: { 200: { description: "Awaiting approval", content: json(templateSchema) }, ...templateWrite, 422: error("NOT_SUBMITTABLE or ASSET_NOT_READY (RULE_FAILED)") } },
  },
  "/v1/organizations/{organizationId}/templates/{templateId}/archive": {
    post: { summary: "Archive a template; it stays in history (MANAGE_BRAND)", parameters: [orgParam, templateParam], requestBody: { required: true, content: json(templateActionSchema) }, responses: { 200: { description: "Archived", content: json(templateSchema) }, ...templateWrite, 422: error("ALREADY_ARCHIVED (RULE_FAILED)") } },
  },
  "/v1/organizations/{organizationId}/templates/{templateId}/order": {
    get: { summary: "What a buyer may change on a template order: editable choices, quantity, allowed locations, and why it's blocked (T11-01c)", parameters: [orgParam, templateParam], responses: { 200: { description: "Order form", content: json(templateOrderFormSchema) }, ...member } },
  },
  "/v1/organizations/{organizationId}/templates/{templateId}/price": {
    post: { summary: "Today's price for the buyer's choices; nothing is saved", parameters: [orgParam, templateParam], requestBody: { required: true, content: json(templatePriceInputSchema) }, responses: { 200: { description: "Price", content: json(priceResultSchema) }, ...member, 400: error("Unknown field (VALIDATION_FAILED)"), 422: error("LOCKED_FIELD (RULE_FAILED)") } },
  },
  "/v1/organizations/{organizationId}/templates/{templateId}/orders": {
    post: {
      summary: "Order from an approved template (CREATE_REQUESTS): only editable fields change; a direct price goes to the cart, anything else becomes a quote for the location",
      parameters: [orgParam, templateParam, idempotencyHeader],
      requestBody: { required: true, content: json(templateOrderInputSchema) },
      responses: { 200: { description: "Ordered", content: json(templateOrderResultSchema) }, ...member, 400: error("Unknown field or quantity (VALIDATION_FAILED)"), 403: error("No CREATE_REQUESTS, or LOCATION_NOT_ALLOWED (FORBIDDEN)"), 409: error("The template changed (VERSION_CONFLICT)"), 422: error("LOCKED_FIELD, TEMPLATE_BLOCKED or TEMPLATE_NOT_APPROVED (RULE_FAILED)") },
    },
  },
  "/v1/organizations/{organizationId}/approvals/policy": {
    get: { summary: "The organization's approval rule (T11-04; every member reads it)", parameters: [orgParam], responses: { 200: { description: "Rule", content: json(approvalPolicySchema) }, ...member } },
    put: { summary: "Set the approval rule: none, all, above an amount, or specific requesters; separate requester and approver (Owner only)", parameters: [orgParam], requestBody: { required: true, content: json(updateApprovalPolicySchema) }, responses: { 200: { description: "Saved", content: json(approvalPolicySchema) }, ...member, 400: error("VALIDATION_FAILED"), 403: error("OWNER_REQUIRED (FORBIDDEN)"), 409: error("VERSION_CONFLICT") } },
  },
  "/v1/organizations/{organizationId}/order-requests": {
    get: { summary: "Order requests the member can see, waiting for them first (requester; approvers and viewers for the location)", parameters: [orgParam], responses: { 200: { description: "Requests", content: json(orderRequestListSchema) }, ...member } },
  },
  "/v1/organizations/{organizationId}/order-requests/{requestId}": {
    get: { summary: "One order request with its items, approvals and history", parameters: [orgParam, uuidParam("requestId")], responses: { 200: { description: "Request", content: json(orderRequestSchema) }, ...member } },
  },
  "/v1/organizations/{organizationId}/order-requests/{requestId}/decision": {
    post: {
      summary: "Approve (sends it to HolyPearls as a quote request), request changes or decline (APPROVE_REQUESTS for the location). Decisions are insert-only.",
      parameters: [orgParam, uuidParam("requestId"), idempotencyHeader],
      requestBody: { required: true, content: json(decideOrderRequestSchema) },
      responses: { 200: { description: "Decided", content: json(orderRequestSchema) }, ...member, 400: error("A note is needed to decline or ask for changes; an amount when there's no estimate"), 403: error("No APPROVE_REQUESTS, or SELF_APPROVAL with separation on (FORBIDDEN)"), 409: error("VERSION_CONFLICT"), 422: error("NOT_PENDING (RULE_FAILED)") },
    },
  },
  "/v1/organizations/{organizationId}/order-requests/{requestId}/reapproval": {
    post: {
      summary: "Send HolyPearls' quote for re-approval when it's above the approved amount (T11-04b; the requester or someone who can accept quotes). The approvers' decision is a new approval record.",
      parameters: [orgParam, uuidParam("requestId")],
      requestBody: { required: true, content: json(requestReapprovalSchema) },
      responses: { 200: { description: "Waiting for re-approval", content: json(orderRequestSchema) }, ...member, 403: error("REQUESTER_OR_ACCEPTER_ONLY (FORBIDDEN)"), 409: error("VERSION_CONFLICT"), 422: error("WITHIN_APPROVAL, NOT_QUOTED or NOT_SENT (RULE_FAILED)") },
    },
  },
  "/v1/organizations/{organizationId}/order-requests/{requestId}/resubmit": {
    post: { summary: "Send a request returned for changes for approval again, at today's price (the requester)", parameters: [orgParam, uuidParam("requestId")], requestBody: { required: true, content: json(orderRequestActionSchema) }, responses: { 200: { description: "Waiting for approval", content: json(orderRequestSchema) }, ...member, 409: error("VERSION_CONFLICT"), 422: error("NOT_DRAFT (RULE_FAILED)") } },
  },
  "/v1/organizations/{organizationId}/order-requests/{requestId}/cancel": {
    post: { summary: "Withdraw a request before it goes to HolyPearls (the requester); its designs become drafts again", parameters: [orgParam, uuidParam("requestId")], requestBody: { required: true, content: json(orderRequestActionSchema) }, responses: { 200: { description: "Cancelled", content: json(orderRequestSchema) }, ...member, 403: error("REQUESTER_ONLY (FORBIDDEN)"), 409: error("VERSION_CONFLICT"), 422: error("NOT_CANCELLABLE (RULE_FAILED)") } },
  },
  "/v1/admin/templates": {
    get: { summary: "Templates by status for HolyPearls' approval (STAFF_ADMIN until a permission is chosen)", parameters: [{ name: "status", in: "query", required: false, schema: { type: "string", enum: ["AWAITING_APPROVAL", "NEEDS_REVIEW", "APPROVED", "DRAFT", "ARCHIVED"] } }], responses: { 200: { description: "Templates", content: json(adminTemplateListSchema) }, ...staffOnly } },
  },
  "/v1/admin/templates/{templateId}": {
    get: { summary: "One template with its production checks (OPS-FR-082)", parameters: [templateParam], responses: { 200: { description: "Template", content: json(adminTemplateSchema) }, ...staffOnly } },
  },
  "/v1/admin/templates/{templateId}/decision": {
    post: { summary: "Approve (every check passes) or return to DRAFT with a note", parameters: [templateParam, idempotencyHeader], requestBody: { required: true, content: json(decideTemplateSchema) }, responses: { 200: { description: "Decided", content: json(adminTemplateSchema) }, ...staffOnly, 400: error("A note is needed to return it to draft"), 409: error("VERSION_CONFLICT"), 422: error("NOT_AWAITING or CHECKS_FAILED (RULE_FAILED)") } },
  },
};

const collectionParam = uuidParam("collectionId");
const collectionWrite = { ...member, 400: error("Invalid input, a field the source doesn't allow, or a deadline that isn't in the future (VALIDATION_FAILED)"), 403: error("No MANAGE_COLLECTIONS for the location (FORBIDDEN)"), 409: error("VERSION_CONFLICT") };
const collectionPaths = {
  "/v1/organizations/{organizationId}/collections": {
    get: { summary: "Group collections the member can see (T12-01; creator, MANAGE_COLLECTIONS or VIEW_RECORDS for the location)", parameters: [orgParam], responses: { 200: { description: "Collections", content: json(collectionListSchema) }, ...member } },
    post: { summary: "Start a collection from an approved template or your saved design (MANAGE_COLLECTIONS; B2B-FR-051)", parameters: [orgParam, idempotencyHeader], requestBody: { required: true, content: json(createCollectionSchema) }, responses: { 200: { description: "Draft", content: json(collectionSchema) }, ...collectionWrite, 422: error("TEMPLATE_NOT_APPROVED (RULE_FAILED)") } },
  },
  "/v1/organizations/{organizationId}/collections/{collectionId}": {
    get: { summary: "One collection: fields, modes, deadline and, for organizers, the share link", parameters: [orgParam, collectionParam], responses: { 200: { description: "Collection", content: json(collectionSchema) }, ...member } },
    put: { summary: "Participant fields (only those the source allows), deadline, who pays, delivery and the unsure-size rule; while DRAFT or PAUSED", parameters: [orgParam, collectionParam], requestBody: { required: true, content: json(updateCollectionSchema) }, responses: { 200: { description: "Saved", content: json(collectionSchema) }, ...collectionWrite, 422: error("NOT_EDITABLE (RULE_FAILED)") } },
  },
  "/v1/organizations/{organizationId}/collections/{collectionId}/open": {
    post: { summary: "Open: makes the share link the first time; needs a future deadline", parameters: [orgParam, collectionParam], requestBody: { required: true, content: json(collectionActionSchema) }, responses: { 200: { description: "Open", content: json(collectionSchema) }, ...collectionWrite, 422: error("WRONG_STATUS or TEMPLATE_NOT_APPROVED (RULE_FAILED)") } },
  },
  "/v1/organizations/{organizationId}/collections/{collectionId}/pause": {
    post: { summary: "Pause: participants see the collection is paused and can't submit", parameters: [orgParam, collectionParam], requestBody: { required: true, content: json(collectionActionSchema) }, responses: { 200: { description: "Paused", content: json(collectionSchema) }, ...collectionWrite, 422: error("WRONG_STATUS (RULE_FAILED)") } },
  },
  "/v1/organizations/{organizationId}/collections/{collectionId}/cancel": {
    post: { summary: "Cancel before an order draft exists; the link stops working", parameters: [orgParam, collectionParam], requestBody: { required: true, content: json(collectionActionSchema) }, responses: { 200: { description: "Cancelled", content: json(collectionSchema) }, ...collectionWrite, 422: error("WRONG_STATUS (RULE_FAILED)") } },
  },
  "/v1/organizations/{organizationId}/collections/{collectionId}/dashboard": {
    get: { summary: "The organizer's dashboard (T12-03): progress, issues, live size and delivery counts, every participant's answers", parameters: [orgParam, collectionParam], responses: { 200: { description: "Dashboard", content: json(collectionDashboardSchema) }, ...member } },
  },
  "/v1/organizations/{organizationId}/collections/{collectionId}/remind": {
    post: { summary: "Email everyone in the order who hasn't sent their answers a fresh link (while OPEN)", parameters: [orgParam, collectionParam], responses: { 200: { description: "Reminded", content: { "application/json": { schema: { type: "object", properties: { reminded: { type: "integer" } } } } } }, ...collectionWrite, 422: error("NOT_OPEN (RULE_FAILED)") } },
  },
  "/v1/organizations/{organizationId}/collections/{collectionId}/close": {
    post: { summary: "Close (never starts production): CLOSED, then NEEDS_REVIEW while anything stops the order, else READY_TO_ORDER", parameters: [orgParam, collectionParam], requestBody: { required: true, content: json(collectionActionSchema) }, responses: { 200: { description: "Closed", content: json(collectionDashboardSchema) }, ...collectionWrite, 422: error("WRONG_STATUS (RULE_FAILED)") } },
  },
  "/v1/organizations/{organizationId}/collections/{collectionId}/reopen": {
    post: { summary: "Reopen a closed collection with a new future deadline (before an Order Draft exists)", parameters: [orgParam, collectionParam], requestBody: { required: true, content: json(reopenCollectionSchema) }, responses: { 200: { description: "Open", content: json(collectionDashboardSchema) }, ...collectionWrite, 422: error("WRONG_STATUS (RULE_FAILED)") } },
  },
  "/v1/organizations/{organizationId}/collections/{collectionId}/participants/{participantId}/{action}": {
    post: {
      summary: "Act on one participant: correction (while open; emails their link), settle-size, exclude or include (during review), remove (out of the totals, kept in history)",
      parameters: [orgParam, collectionParam, uuidParam("participantId"), { name: "action", in: "path", required: true, schema: { type: "string", enum: ["correction", "settle-size", "exclude", "include", "remove"] } }],
      requestBody: { required: true, content: json(participantActionSchema) },
      responses: { 200: { description: "Updated dashboard", content: json(collectionDashboardSchema) }, ...collectionWrite, 422: error("NOT_OPEN, NOT_SUBMITTED, NOT_REVIEWING, WRONG_STATUS or REMOVED (RULE_FAILED)") },
    },
  },
  "/v1/collections/join": {
    post: {
      summary: "Join from the share link with a name and email (T12-01b): a guest session for this participant only, and their personal link by email",
      requestBody: { required: true, content: json(joinCollectionSchema) },
      responses: { 200: { description: "Joined", content: { "application/json": { schema: { type: "object", properties: { participantId: { type: "string" }, redirectTo: { type: "string" } } } } } }, 400: error("VALIDATION_FAILED"), 404: error("Unknown, draft or cancelled collection"), 422: error("COLLECTION_PAUSED or COLLECTION_CLOSED (RULE_FAILED)"), 429: error("RATE_LIMITED") },
    },
  },
  "/v1/participants/{participantId}": {
    get: { summary: "The participant's own answers and the allowed fields (their guest session or the account they joined with; anyone else 404)", parameters: [uuidParam("participantId")], responses: { 200: { description: "Participation", content: json(participationSchema) }, 401: error("NOT_SIGNED_IN"), 404: error("NOT_FOUND") } },
  },
  "/v1/participants/{participantId}/answers": {
    put: {
      summary: "Save answers: only the allowed fields, sizes from the list, not sure only when allowed, a branch only from the approved ones",
      parameters: [uuidParam("participantId")],
      requestBody: { required: true, content: json(saveParticipationSchema) },
      responses: { 200: { description: "Saved", content: json(participationSchema) }, 400: error("VALIDATION_FAILED"), 404: error("NOT_FOUND"), 409: error("VERSION_CONFLICT"), 422: error("COLLECTION_PAUSED or COLLECTION_CLOSED (RULE_FAILED)") },
    },
  },
  "/v1/participants/{participantId}/submit": {
    post: { summary: "Send my response: everything the collection needs is there; a copy is emailed. No payment (the organization pays).", parameters: [uuidParam("participantId")], requestBody: { required: true, content: json(submitParticipationSchema) }, responses: { 200: { description: "Submitted", content: json(participationSchema) }, 400: error("VALIDATION_FAILED"), 404: error("NOT_FOUND"), 409: error("VERSION_CONFLICT"), 422: error("COLLECTION_PAUSED or COLLECTION_CLOSED (RULE_FAILED)") } },
  },
  "/v1/collections/invite": {
    post: {
      summary: "What a participant sees on opening the share link: the allowed fields and modes, nothing about anyone else (no account; the secret goes in the body)",
      requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["secret"], properties: { secret: { type: "string" } } } } } },
      responses: { 200: { description: "Invite", content: json(collectionInviteSchema) }, 404: error("Unknown, draft or cancelled collection (NOT_FOUND)"), 429: error("GUEST_LINK_VERIFY limit (RATE_LIMITED)") },
    },
  },
};

/**
 * The OpenAPI document, generated from the contract schemas (TECH-02 §12).
 * Each ticket that adds an endpoint adds it here; CI fails when the
 * committed `openapi.json` no longer matches.
 */
export function buildOpenApiDocument() {
  return {
    openapi: "3.1.0",
    info: { title: "HolyPearls API", version: "1.0.0" },
    servers: [{ url: "/" }],
    paths: {
      "/health/live": {
        get: {
          summary: "The process is running",
          responses: { 200: { description: "Running", content: json(healthLiveSchema) } },
        },
      },
      "/health/ready": {
        get: {
          summary: "The API can reach the database",
          responses: {
            200: { description: "Ready", content: json(healthReadySchema) },
            503: { description: "Not ready", content: json(healthReadySchema) },
            500: { description: "Unexpected error", content: json(ERROR_REF) },
          },
        },
      },
      "/v1/me": {
        get: {
          summary: "The signed-in person",
          responses: { 200: { description: "Signed in", content: json(meSchema) }, ...signedIn },
        },
      },
      "/v1/me/history": {
        get: {
          summary: "The account overview: drafts, orders, quotes and projects, receipts, and guest linking (TECH-03 §6)",
          responses: { 200: { description: "Overview", content: json(accountHistorySchema) }, ...signedIn },
        },
      },
      "/v1/me/profile": {
        patch: {
          summary: "Change your name and phone",
          requestBody: { required: true, content: json(profileInputSchema) },
          responses: {
            200: { description: "Saved", content: json(profileSchema) },
            ...signedIn,
            400: error("Invalid name or phone (VALIDATION_FAILED)"),
            422: error("A phone needs a verified email first (RULE_FAILED, reason VERIFY_EMAIL_FIRST)"),
          },
        },
      },
      "/v1/me/sessions": {
        get: {
          summary: "Where the signed-in person is signed in",
          responses: { 200: { description: "Sessions", content: json(sessionListSchema) }, ...signedIn },
        },
      },
      "/v1/me/sessions/revoke-all": {
        post: {
          summary: "Sign out everywhere, including this device",
          responses: {
            200: { description: "Every session ended", content: json(revokeAllResultSchema) },
            ...signedIn,
            403: error("Request not from the HolyPearls web origin (FORBIDDEN)"),
          },
        },
      },
      "/v1/me/sessions/{sessionId}": {
        delete: {
          summary: "End one of your own sessions",
          parameters: [uuidParam("sessionId")],
          responses: {
            200: { description: "Session ended", content: json(revokeAllResultSchema) },
            ...signedIn,
            404: error("Not your session, or no such session (NOT_FOUND)"),
          },
        },
      },
      "/v1/admin/audit": {
        get: {
          summary: "Audit entries, newest first, with cursor paging (AUDIT_VIEW)",
          parameters: ["q", "action", "sinceDays", "recordType", "recordId", "cursor", "limit"].map((name) => ({
            name,
            in: "query",
            required: false,
            schema: { type: name === "sinceDays" || name === "limit" ? "integer" : "string" },
          })),
          responses: { 200: { description: "A page of entries", content: json(auditPageSchema) }, 400: error("Bad filters"), ...staffOnly },
        },
      },
      "/v1/admin/audit/{id}": {
        get: {
          summary: "One audit entry (AUDIT_VIEW)",
          parameters: [uuidParam("id")],
          responses: { 200: { description: "The entry", content: json(auditEntrySchema) }, ...staffOnly },
        },
      },
      "/v1/admin/staff/{staffProfileId}/access": {
        get: {
          summary: "A staff member's permissions and MFA state (STAFF_ADMIN)",
          parameters: [uuidParam("staffProfileId")],
          responses: { 200: { description: "Access", content: json(staffAccessSchema) }, ...staffOnly },
        },
      },
      "/v1/admin/staff/{staffProfileId}/permissions": {
        post: {
          summary: "Grant a staff permission (STAFF_ADMIN, recent MFA, audited)",
          parameters: [uuidParam("staffProfileId"), idempotencyHeader],
          requestBody: { required: true, content: json(grantPermissionSchema) },
          responses: {
            200: { description: "Access after the change", content: json(staffAccessSchema) },
            409: error("Idempotency-Key reused with a different request (CONFLICT)"),
            ...highRisk,
          },
        },
      },
      "/v1/admin/staff/{staffProfileId}/permissions/{permission}": {
        delete: {
          summary: "Remove a staff permission (STAFF_ADMIN, recent MFA, audited)",
          parameters: [uuidParam("staffProfileId"), { name: "permission", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "Access after the change", content: json(staffAccessSchema) }, ...highRisk },
        },
      },
      "/v1/admin/staff/{staffProfileId}/mfa-reset": {
        post: {
          summary: "Reset another staff member's MFA and end their sessions (STAFF_ADMIN, recent MFA, audited)",
          parameters: [uuidParam("staffProfileId")],
          responses: { 200: { description: "Access after the reset", content: json(staffAccessSchema) }, ...highRisk },
        },
      },
      "/v1/admin/monitoring/test-error": {
        post: {
          summary: "Send a deliberate error to monitoring (SECURITY_ADMIN)",
          responses: { 500: error("The deliberate error (INTERNAL)"), ...staffOnly },
        },
      },
      "/v1/guest-links/redeem": {
        post: {
          summary: "Exchange a guest link secret for a guest session cookie and a clean URL (TECH-03 §5)",
          requestBody: { required: true, content: json(redeemGuestLinkSchema) },
          responses: {
            200: { description: "Guest session started (Set-Cookie: hp.guest)", content: json(redeemResultSchema) },
            404: error("Unknown link (NOT_FOUND)"),
            422: error("Link expired or turned off (RULE_FAILED, reason LINK_EXPIRED or LINK_REVOKED)"),
            429: error("GUEST_LINK_VERIFY limit (RATE_LIMITED)"),
          },
        },
      },
      "/v1/guest-session": { delete: { summary: "End the guest session", responses: { 200: { description: "Ended" } } } },
      "/v1/email-codes": {
        post: {
          summary: "Email a 6-digit code to the guest's or signed-in customer's address (10 minutes, 5 tries)",
          requestBody: { required: true, content: json(requestEmailCodeSchema) },
          responses: { 201: { description: "Code sent", content: json(emailCodeSentSchema) }, ...signedIn, 429: error("Too many requests") },
        },
      },
      "/v1/email-codes/verify": {
        post: {
          summary: "Check a code; important actions accept it for 24 hours",
          requestBody: { required: true, content: json(verifyEmailCodeSchema) },
          responses: {
            200: { description: "Verified", content: json(emailCodeVerifiedSchema) },
            400: error("Wrong code, with tries left (VALIDATION_FAILED)"),
            422: error("No code, expired or locked (RULE_FAILED)"),
            ...signedIn,
          },
        },
      },
      "/v1/help-requests": {
        post: {
          summary: "Need help / Ask HolyPearls, with the page's context attached (PRD-00 §18)",
          requestBody: { required: true, content: json(createHelpRequestSchema) },
          responses: { 201: { description: "Sent to staff", content: json(helpRequestSchema) }, 400: error("Bad input") },
        },
      },
      "/v1/help-requests/{id}": {
        get: {
          summary: "Your own help request and its replies",
          parameters: [uuidParam("id")],
          responses: { 200: { description: "The request", content: json(helpRequestSchema) }, 404: error("Not yours, or no such request") },
        },
      },
      "/v1/admin/help-requests": {
        get: {
          summary: "Help inbox by status, with counts (CUSTOMER_SUPPORT)",
          responses: { 200: { description: "A page of requests", content: json(helpInboxSchema) }, ...staffOnly },
        },
      },
      "/v1/admin/help-requests/{id}": {
        get: {
          summary: "One help request with context and replies (CUSTOMER_SUPPORT)",
          parameters: [uuidParam("id")],
          responses: { 200: { description: "The request", content: json(adminHelpRequestSchema) }, ...staffOnly },
        },
      },
      "/v1/admin/help-requests/{id}/replies": {
        post: {
          summary: "Reply by email and mark ANSWERED (CUSTOMER_SUPPORT, audited)",
          parameters: [uuidParam("id"), idempotencyHeader],
          requestBody: { required: true, content: json(replyToHelpSchema) },
          responses: { 200: { description: "Answered", content: json(adminHelpRequestSchema) }, 409: error("Closed"), ...staffOnly },
        },
      },
      "/v1/admin/help-requests/{id}/close": {
        post: {
          summary: "Close a help request (CUSTOMER_SUPPORT, audited)",
          parameters: [uuidParam("id")],
          responses: { 200: { description: "Closed", content: json(adminHelpRequestSchema) }, ...staffOnly },
        },
      },
      "/v1/admin/notifications": {
        get: {
          summary: "Notification log (CUSTOMER_SUPPORT)",
          responses: { 200: { description: "A page of notifications", content: json(notificationPageSchema) }, ...staffOnly },
        },
      },
      "/v1/admin/notifications/{id}": {
        get: {
          summary: "One notification (CUSTOMER_SUPPORT)",
          parameters: [uuidParam("id")],
          responses: { 200: { description: "The notification", content: json(notificationEntrySchema) }, ...staffOnly },
        },
      },
      "/v1/admin/notifications/{id}/resend": {
        post: {
          summary: "Resend as a new notification (CUSTOMER_SUPPORT, audited); not for emails that carried a link or code",
          parameters: [uuidParam("id"), idempotencyHeader],
          responses: {
            200: { description: "The new notification", content: json(notificationEntrySchema) },
            422: error("Carried a link or code (RULE_FAILED)"),
            ...staffOnly,
          },
        },
      },
      "/v1/admin/notifications/test": {
        post: {
          summary: "Send a test email to yourself (CUSTOMER_SUPPORT)",
          responses: { 200: { description: "Queued", content: json(notificationEntrySchema) }, ...staffOnly },
        },
      },
      "/v1/admin/guest-links/{id}/revoke": {
        post: {
          summary: "Turn a guest link off (CUSTOMER_SUPPORT, audited)",
          parameters: [uuidParam("id")],
          responses: { 200: { description: "Revoked" }, ...staffOnly },
        },
      },
      "/v1/files/uploads": {
        post: {
          summary: "Start an upload: checks purpose limits and ownership, returns a 15-minute URL for one object (TECH-04 §3)",
          requestBody: { required: true, content: json(createUploadSchema) },
          responses: {
            201: { description: "Upload URL", content: json(uploadCreatedSchema) },
            400: error("Type not allowed or too big (VALIDATION_FAILED)"),
            ...signedIn,
            403: error("Staff purpose without its permission"),
            404: error("Record you can't attach to (NOT_FOUND)"),
            429: error("UPLOAD_INTENT limit"),
          },
        },
      },
      "/v1/files/{id}/complete": {
        post: {
          summary: "The upload finished: checks the object and its real size, then queues file.inspect",
          parameters: [uuidParam("id")],
          responses: { 200: { description: "PROCESSING or REJECTED", content: json(fileViewSchema) }, 404: error("Not yours"), 422: error("Nothing uploaded") },
        },
      },
      "/v1/files/{id}": {
        get: {
          summary: "A file's status, for the upload component",
          parameters: [uuidParam("id")],
          responses: { 200: { description: "The file", content: json(fileViewSchema) }, 404: error("Not yours, or no such file") },
        },
      },
      "/v1/files/{id}/download": {
        get: {
          summary: "A 5-minute URL for the original (owner and permitted staff)",
          parameters: [uuidParam("id")],
          responses: { 200: { description: "Download URL", content: json(fileUrlSchema) }, 404: error("Not yours"), 422: error("Not available") },
        },
      },
      "/v1/files/{id}/preview": {
        get: {
          summary: "A 5-minute URL for a preview, thumbnail or page image",
          parameters: [
            uuidParam("id"),
            { name: "kind", in: "query", required: false, schema: { type: "string", enum: ["preview", "thumbnail", "page"] } },
            { name: "page", in: "query", required: false, schema: { type: "integer" } },
          ],
          responses: { 200: { description: "Preview URL", content: json(fileUrlSchema) }, 404: error("Not yours, or no preview") },
        },
      },
      "/v1/admin/catalogue/products": {
        get: { summary: "Products with search and filters (CATALOGUE_MANAGE)", responses: { 200: { description: "A page", content: json(adminProductPageSchema) }, ...staffOnly } },
        post: {
          summary: "Create a DRAFT product (CATALOGUE_MANAGE, audited)",
          requestBody: { required: true, content: json(createProductSchema) },
          responses: { 201: { description: "Created", content: json(adminProductSchema) }, 400: error("Bad input or slug taken"), ...staffOnly },
        },
      },
      "/v1/admin/catalogue/products/{id}": {
        get: { summary: "One product (CATALOGUE_MANAGE)", parameters: [uuidParam("id")], responses: { 200: { description: "The product", content: json(adminProductSchema) }, ...staffOnly } },
        patch: {
          summary: "Edit a product with the version it started from (CATALOGUE_MANAGE, audited)",
          parameters: [uuidParam("id")],
          requestBody: { required: true, content: json(updateProductSchema) },
          responses: { 200: { description: "Saved", content: json(adminProductSchema) }, 409: error("VERSION_CONFLICT"), ...staffOnly },
        },
      },
      "/v1/admin/catalogue/products/{id}/status": {
        post: {
          summary: "Publish, mark temporarily unavailable or archive (CATALOGUE_MANAGE, audited)",
          parameters: [uuidParam("id")],
          requestBody: { required: true, content: json(changeProductStatusSchema) },
          responses: {
            200: { description: "Changed", content: json(adminProductSchema) },
            409: error("Transition not allowed or VERSION_CONFLICT"),
            422: error("Not ready to publish (RULE_FAILED with fieldErrors)"),
            ...staffOnly,
          },
        },
      },
      "/v1/admin/catalogue/products/bulk-status": {
        post: {
          summary: "Change the status of several products; each is checked and audited on its own (CATALOGUE_MANAGE)",
          requestBody: { required: true, content: json(bulkProductStatusSchema) },
          responses: { 200: { description: "Changed and skipped products", content: json(bulkProductStatusResultSchema) }, ...staffOnly },
        },
      },
      "/v1/admin/catalogue/products/{id}/media": {
        post: {
          summary: "Add a product-media image with alt text (CATALOGUE_MANAGE, audited)",
          parameters: [uuidParam("id")],
          requestBody: { required: true, content: json(addProductMediaSchema) },
          responses: { 201: { description: "Added", content: json(adminProductSchema) }, 422: error("File rejected or too many images (RULE_FAILED)"), ...staffOnly },
        },
      },
      "/v1/admin/catalogue/products/{id}/media/{mediaId}": {
        patch: {
          summary: "Change an image's alt text (CATALOGUE_MANAGE, audited)",
          parameters: [uuidParam("id"), uuidParam("mediaId")],
          requestBody: { required: true, content: json(updateProductMediaSchema) },
          responses: { 200: { description: "Saved", content: json(adminProductSchema) }, ...staffOnly },
        },
        delete: {
          summary: "Remove an image; a published product keeps at least one (CATALOGUE_MANAGE, audited)",
          parameters: [uuidParam("id"), uuidParam("mediaId")],
          responses: { 200: { description: "Removed", content: json(adminProductSchema) }, 422: error("Last image of a published product (RULE_FAILED)"), ...staffOnly },
        },
      },
      "/v1/admin/catalogue/products/{id}/options": {
        get: { summary: "Options and values with their images (CATALOGUE_MANAGE)", parameters: [uuidParam("id")], responses: { 200: { description: "Options", content: json(adminProductOptionsSchema) }, ...staffOnly } },
      },
      "/v1/admin/catalogue/products/{id}/options/{option}/values/{value}/image": {
        put: {
          summary: "Set an option value's photo from product media (CATALOGUE_MANAGE, audited)",
          parameters: [uuidParam("id"), { name: "option", in: "path", required: true, schema: { type: "string" } }, { name: "value", in: "path", required: true, schema: { type: "string" } }],
          requestBody: { required: true, content: json(optionImageInputSchema) },
          responses: { 200: { description: "Saved", content: json(adminProductOptionsSchema) }, ...staffOnly },
        },
        delete: {
          summary: "Remove an option value's photo (CATALOGUE_MANAGE, audited)",
          parameters: [uuidParam("id"), { name: "option", in: "path", required: true, schema: { type: "string" } }, { name: "value", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "Removed", content: json(adminProductOptionsSchema) }, ...staffOnly },
        },
      },
      "/v1/admin/catalogue/products/{id}/media-order": {
        put: {
          summary: "Save the image order; the first is the main image (CATALOGUE_MANAGE, audited)",
          parameters: [uuidParam("id")],
          requestBody: { required: true, content: json(reorderProductMediaSchema) },
          responses: { 200: { description: "Saved", content: json(adminProductSchema) }, ...staffOnly },
        },
      },
      "/v1/admin/catalogue/products/{id}/related": {
        put: {
          summary: "Set related products, in order, up to 12 (CATALOGUE_MANAGE, audited)",
          parameters: [uuidParam("id")],
          requestBody: { required: true, content: json(setRelatedProductsSchema) },
          responses: { 200: { description: "Saved", content: json(adminProductSchema) }, ...staffOnly },
        },
      },
      "/v1/admin/catalogue/categories": {
        get: { summary: "Every category with its parent and product count (CATALOGUE_MANAGE)", responses: { 200: { description: "Categories", content: json(adminCategoryListSchema) }, ...staffOnly } },
        post: {
          summary: "Create a DRAFT category (CATALOGUE_MANAGE, audited)",
          requestBody: { required: true, content: json(createCategorySchema) },
          responses: { 201: { description: "Created", content: json(adminCategorySchema) }, 400: error("Bad input, slug taken or parent not top-level"), ...staffOnly },
        },
      },
      "/v1/admin/catalogue/categories/{id}": {
        get: { summary: "One category (CATALOGUE_MANAGE)", parameters: [uuidParam("id")], responses: { 200: { description: "The category", content: json(adminCategorySchema) }, ...staffOnly } },
        patch: {
          summary: "Edit a category with the version it started from (CATALOGUE_MANAGE, audited)",
          parameters: [uuidParam("id")],
          requestBody: { required: true, content: json(updateCategorySchema) },
          responses: { 200: { description: "Saved", content: json(adminCategorySchema) }, 409: error("VERSION_CONFLICT"), ...staffOnly },
        },
      },
      "/v1/admin/catalogue/categories/{id}/status": {
        post: {
          summary: "Publish or archive a category (CATALOGUE_MANAGE, audited)",
          parameters: [uuidParam("id")],
          requestBody: { required: true, content: json(changeCategoryStatusSchema) },
          responses: {
            200: { description: "Changed", content: json(adminCategorySchema) },
            409: error("Transition not allowed or VERSION_CONFLICT"),
            422: error("Has products or subcategories, or parent not published (RULE_FAILED)"),
            ...staffOnly,
          },
        },
      },
      "/v1/catalogue/navigation": {
        get: { summary: "Categories, popular products and homepage lists for the site header and homepage (public, cached)", responses: { 200: { description: "Navigation", content: json(storefrontNavigationSchema) } } },
      },
      "/v1/catalogue/categories": {
        get: { summary: "Published categories as a two-level tree with product counts (public, cached)", responses: { 200: { description: "Categories", content: json(publicCategoryTreeSchema) } } },
      },
      "/v1/catalogue/products": {
        get: {
          summary: "Product Directory: published products with search, filters, sort, numbered pages and facet counts (public, cached)",
          responses: { 200: { description: "A page", content: json(publicProductPageSchema) }, 400: error("Bad query") },
        },
      },
      "/v1/catalogue/products/{slug}": {
        get: {
          summary: "One published product for its public page (public, cached)",
          parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "The product", content: json(publicProductSchema) }, 404: error("Not published or unknown") },
        },
      },
      "/v1/catalogue/hubs/{slug}": {
        get: {
          summary: "A published category hub with its visible sections and products (public, cached)",
          parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "The hub", content: json(publicHubSchema) }, 404: error("Not published or unknown") },
        },
      },
      "/v1/catalogue/suggest": {
        get: {
          summary: "Typeahead: everyday searches (including staff phrases), categories, products and a guide for what's typed (public, SEARCH limit)",
          parameters: [{ name: "q", in: "query", required: true, schema: { type: "string", maxLength: 100 } }],
          responses: { 200: { description: "Suggestions", content: json(searchSuggestionsSchema) }, 429: error("SEARCH limit (RATE_LIMITED)") },
        },
      },
      "/v1/search": {
        get: {
          summary: "Search results grouped by products, projects and guides, with spelling correction, 'narrow it down' and closest matches when nothing is found. Never cached; results pages are noindex (PUB-FR-006, 007, 016)",
          parameters: [
            { name: "q", in: "query", required: true, schema: { type: "string", maxLength: 100 } },
            { name: "scope", in: "query", schema: { type: "string", enum: ["all", "products", "projects", "guides"] } },
            { name: "page", in: "query", schema: { type: "integer", minimum: 1, maximum: 50 } },
            { name: "exact", in: "query", description: "1 searches exactly what was typed, without correction", schema: { type: "string", enum: ["0", "1"] } },
          ],
          responses: { 200: { description: "Results", content: json(searchResultsSchema) }, 400: error("Bad query"), 429: error("SEARCH limit (RATE_LIMITED)") },
        },
      },
      "/v1/search/clicks": {
        post: {
          summary: "Record which result was chosen, for search analytics; no personal details are kept",
          requestBody: { required: true, content: json(searchClickSchema) },
          responses: { 204: { description: "Recorded" }, 400: error("Bad input"), 429: error("SEARCH limit (RATE_LIMITED)") },
        },
      },
      "/v1/admin/search/phrases": {
        get: { summary: "Everyday search phrases and where they lead (CATALOGUE_MANAGE or CONTENT_MANAGE)", responses: { 200: { description: "Phrases", content: json(searchPhraseListSchema) }, ...staffOnly } },
        post: {
          summary: "Add an everyday phrase leading to a product, category or page (audited); the index refreshes",
          requestBody: { required: true, content: json(createSearchPhraseSchema) },
          responses: { 201: { description: "Added", content: json(searchPhraseSchema) }, 400: error("Bad phrase or unknown target"), ...staffOnly },
        },
      },
      "/v1/admin/search/phrases/{id}": {
        delete: { summary: "Remove a phrase (audited)", parameters: [uuidParam("id")], responses: { 204: { description: "Removed" }, ...staffOnly } },
      },
      "/v1/admin/search/targets": {
        get: {
          summary: "Products, categories and pages a phrase can lead to",
          parameters: [{ name: "q", in: "query", required: true, schema: { type: "string", maxLength: 60 } }],
          responses: { 200: { description: "Targets", content: json(searchTargetOptionsSchema) }, ...staffOnly },
        },
      },
      "/v1/admin/search/report": {
        get: { summary: "Last 30 days: searches, searches with no results and the most common of each", responses: { 200: { description: "Report", content: json(searchReportSchema) }, ...staffOnly } },
      },
      "/v1/seo/sitemap": {
        get: { summary: "Published, indexable public pages for the XML sitemap (PUB-SEO-009)", responses: { 200: { description: "Pages", content: json(sitemapSchema) } } },
      },
      "/v1/content": {
        get: {
          summary: "Published project pages, guides or case studies, lead items first (public, cached)",
          parameters: [{ name: "type", in: "query", required: true, schema: { type: "string", enum: ["PROJECT", "GUIDE", "CASE_STUDY"] } }],
          responses: { 200: { description: "Cards", content: json(contentIndexSchema) }, 400: error("Bad type") },
        },
      },
      "/v1/content/{type}/{slug}": {
        get: {
          summary: "One published content page: the last published copy only (public, cached)",
          parameters: [
            { name: "type", in: "path", required: true, schema: { type: "string", enum: ["PROJECT", "GUIDE", "CASE_STUDY", "ABOUT"] } },
            { name: "slug", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: { 200: { description: "The page", content: json(publicContentPageSchema) }, 404: error("Not published or unknown") },
        },
      },
      "/v1/admin/content": {
        get: {
          summary: "Content pages for the editor, optionally one type (CONTENT_MANAGE)",
          parameters: [{ name: "type", in: "query", schema: { type: "string", enum: ["PROJECT", "GUIDE", "CASE_STUDY", "ABOUT"] } }],
          responses: { 200: { description: "Pages", content: json(adminContentListSchema) }, ...staffOnly },
        },
        post: {
          summary: "Create a draft page (CONTENT_MANAGE, audited)",
          requestBody: { required: true, content: json(createContentPageSchema) },
          responses: { 201: { description: "Created", content: json(adminContentPageSchema) }, 400: error("Bad input or address taken"), ...staffOnly },
        },
      },
      "/v1/admin/content/{id}": {
        get: { summary: "One page's working copy (CONTENT_MANAGE)", parameters: [uuidParam("id")], responses: { 200: { description: "The page", content: json(adminContentPageSchema) }, ...staffOnly } },
        put: {
          summary: "Save the working copy; rich text is cleaned and what was removed is reported. The public page doesn't change (CONTENT_MANAGE, audited)",
          parameters: [uuidParam("id")],
          requestBody: { required: true, content: json(updateContentPageSchema) },
          responses: { 200: { description: "Saved", content: json(adminContentPageSchema) }, 400: error("Bad input"), 409: error("VERSION_CONFLICT"), ...staffOnly },
        },
      },
      "/v1/admin/content/{id}/publish": {
        post: {
          summary: "Publish the working copy; pages, search and the sitemap refresh (CONTENT_MANAGE, audited)",
          parameters: [uuidParam("id")],
          requestBody: { required: true, content: json(publishContentPageSchema) },
          responses: { 200: { description: "Published", content: json(adminContentPageSchema) }, 409: error("Archived or VERSION_CONFLICT"), 422: error("Missing summary or text, or an image that is missing, still being checked or without alt text (RULE_FAILED, keyed by field)"), ...staffOnly },
        },
      },
      "/v1/admin/content/{id}/status": {
        post: {
          summary: "Unpublish (PUBLISHED → DRAFT), archive, or restore (ARCHIVED → DRAFT) a page; unpublishing and archiving make its images private (CONTENT_MANAGE, audited)",
          parameters: [uuidParam("id")],
          requestBody: { required: true, content: json(changeContentStatusSchema) },
          responses: { 200: { description: "Changed", content: json(adminContentPageSchema) }, 409: error("Not allowed or VERSION_CONFLICT"), ...staffOnly },
        },
      },
      "/v1/admin/content/media/{fileId}/{kind}": {
        get: {
          summary: "A media-library image for the content editor, including draft pages' images (CONTENT_MANAGE). Never cached publicly.",
          parameters: [uuidParam("fileId"), { name: "kind", in: "path", required: true, schema: { type: "string", enum: ["preview", "thumbnail"] } }],
          responses: { 200: { description: "Image bytes" }, ...staffOnly },
        },
      },
      "/v1/media/{fileId}/{kind}": {
        get: {
          summary: "A product, category or content-page image (preview or thumbnail); only for visible products, published categories and images the live copy of a published page uses. Product images cache for a year, content images for five minutes.",
          parameters: [uuidParam("fileId"), { name: "kind", in: "path", required: true, schema: { type: "string", enum: ["preview", "thumbnail"] } }],
          responses: { 200: { description: "Image bytes" }, 404: error("Not public") },
        },
      },
      "/v1/admin/catalogue/categories/{id}/hub": {
        get: { summary: "A category hub's draft and published sections (CATALOGUE_MANAGE)", parameters: [uuidParam("id")], responses: { 200: { description: "The hub", content: json(adminHubSchema) }, ...staffOnly } },
        put: {
          summary: "Save the hub draft; the public page doesn't change (CATALOGUE_MANAGE, audited)",
          parameters: [uuidParam("id")],
          requestBody: { required: true, content: json(saveHubDraftSchema) },
          responses: { 200: { description: "Saved", content: json(adminHubSchema) }, 409: error("VERSION_CONFLICT"), ...staffOnly },
        },
      },
      "/v1/admin/catalogue/categories/{id}/hub/publish": {
        post: {
          summary: "Publish the hub draft and refresh the page (CATALOGUE_MANAGE, audited)",
          parameters: [uuidParam("id")],
          requestBody: { required: true, content: json(publishHubSchema) },
          responses: { 200: { description: "Published", content: json(adminHubSchema) }, 409: error("VERSION_CONFLICT"), ...staffOnly },
        },
      },
      "/v1/admin/catalogue/lists": {
        get: { summary: "The mega-menu and homepage product lists (CATALOGUE_MANAGE)", responses: { 200: { description: "Lists", content: json(adminMerchandisingListsSchema) }, ...staffOnly } },
      },
      "/v1/admin/catalogue/lists/{key}": {
        put: {
          summary: "Replace a list; version 0 creates it (CATALOGUE_MANAGE, audited)",
          parameters: [{ name: "key", in: "path", required: true, schema: { type: "string", enum: ["menu.popular", "home.most-ordered"] } }],
          requestBody: { required: true, content: json(saveMerchandisingListSchema) },
          responses: { 200: { description: "Saved", content: json(adminMerchandisingListsSchema) }, 409: error("VERSION_CONFLICT"), ...staffOnly },
        },
      },
      "/v1/catalogue/products/{slug}/price": {
        post: {
          summary: "Price a configuration of a published product: total, per unit, VAT, price state and reasons. The result is saved with the rule versions used; checkout recalculates on the server.",
          parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
          requestBody: { required: true, content: json(priceRequestSchema) },
          responses: { 200: { description: "Result", content: json(priceResultSchema) }, 400: error("Bad input"), 404: error("Not published"), 429: error("SEARCH limit (RATE_LIMITED)") },
        },
      },
      "/v1/admin/pricing/products/{id}/rules": {
        get: { summary: "Product rules and compatibility (PRICING_MANAGE)", parameters: [uuidParam("id")], responses: { 200: { description: "Rules", content: json(adminProductRulesSchema) }, ...staffOnly } },
        put: {
          summary: "Create (version 0) or edit product rules (PRICING_MANAGE, audited)",
          parameters: [uuidParam("id")],
          requestBody: { required: true, content: json(saveProductRulesSchema) },
          responses: { 200: { description: "Saved", content: json(adminProductRulesSchema) }, 409: error("VERSION_CONFLICT"), ...staffOnly },
        },
      },
      "/v1/admin/pricing/products/{id}/compatibility": {
        put: {
          summary: "Replace the compatibility rules; bumps the rules' version (PRICING_MANAGE, audited)",
          parameters: [uuidParam("id")],
          requestBody: { required: true, content: json(saveCompatibilitySchema) },
          responses: { 200: { description: "Saved", content: json(adminProductRulesSchema) }, 400: error("Unknown option or value"), 409: error("VERSION_CONFLICT"), ...staffOnly },
        },
      },
      "/v1/admin/pricing/products/{id}/prices": {
        get: { summary: "Price history, the price in force and scheduled prices (PRICING_MANAGE)", parameters: [uuidParam("id")], responses: { 200: { description: "Prices", content: json(adminPriceRuleListSchema) }, ...staffOnly } },
        post: {
          summary: "Add a price from now or a later date; history is never edited (PRICING_MANAGE, audited)",
          parameters: [uuidParam("id")],
          requestBody: { required: true, content: json(priceRuleInputSchema) },
          responses: { 201: { description: "Added", content: json(adminPriceRuleSchema) }, 400: error("Past date, unknown add-on value or duplicate start"), ...staffOnly },
        },
      },
      "/v1/admin/pricing/products/{id}/calculate": {
        post: {
          summary: "Try a configuration against the rules, including unpublished products (PRICING_MANAGE)",
          parameters: [uuidParam("id")],
          requestBody: { required: true, content: json(priceRequestSchema) },
          responses: { 200: { description: "Result", content: json(priceResultSchema) }, ...staffOnly },
        },
      },
      "/v1/admin/pricing/vat": {
        get: { summary: "VAT history and the rate in force (PRICING_MANAGE)", responses: { 200: { description: "VAT", content: json(adminTaxSettingListSchema) }, ...staffOnly } },
        post: {
          summary: "Schedule a VAT rate from now or a later date (PRICING_MANAGE, audited)",
          requestBody: { required: true, content: json(taxSettingInputSchema) },
          responses: { 201: { description: "Saved", content: json(adminTaxSettingListSchema) }, 400: error("Past date"), ...staffOnly },
        },
      },
      "/v1/cart": {
        get: { summary: "The cart: ready and quote groups, saved-for-later designs (owner or browser only)", responses: { 200: { description: "Cart", content: json(cartSchema) } } },
      },
      "/v1/cart/items": {
        post: {
          summary: "Add a saved design to the cart (COM-FR-080); quote-needing designs join the quote group",
          requestBody: { required: true, content: json(addToCartSchema) },
          responses: { 200: { description: "Cart", content: json(cartSchema) }, 400: error("No quantity yet"), 404: error("Not yours"), 409: error("Already has a quote request"), 422: error("A blocking answer must change first") },
        },
      },
      "/v1/cart/items/{id}": {
        delete: { summary: "Remove an item; its design stays a draft", parameters: [uuidParam("id")], responses: { 200: { description: "Cart", content: json(cartSchema) }, 404: error("Not yours") } },
      },
      "/v1/cart/items/{id}/save-for-later": {
        post: { summary: "Move an item back to the customer's saved designs", parameters: [uuidParam("id")], responses: { 200: { description: "Cart", content: json(cartSchema) }, 404: error("Not yours") } },
      },
      "/v1/cart/saved/{configurationId}": {
        delete: { summary: "Drop a design from the saved-for-later list (the draft stays)", parameters: [uuidParam("configurationId")], responses: { 200: { description: "Cart", content: json(cartSchema) }, 404: error("Not yours") } },
      },
      "/v1/cart/quote-request": {
        post: {
          summary: "Submit quote items: one quote request per quote item (CONTACT limit)",
          requestBody: { required: true, content: json(cartQuoteRequestSchema) },
          responses: { 200: { description: "Quote references", content: json(cartQuoteRequestResultSchema) }, 422: error("No quote items") },
        },
      },
      "/v1/checkouts": {
        post: {
          summary: "Start checkout for the cart's ready items; the server reprices and freezes them (TECH-05 §1). Idempotency-Key required; the cart's open checkout is returned when nothing changed",
          responses: { 200: { description: "Checkout", content: json(checkoutSchema) }, 422: error("Nothing ready to check out") },
        },
      },
      "/v1/checkouts/{id}": {
        get: { summary: "A checkout (owner or browser only)", parameters: [uuidParam("id")], responses: { 200: { description: "Checkout", content: json(checkoutSchema) }, 404: error("Not yours") } },
      },
      "/v1/checkouts/{id}/contact": {
        put: {
          summary: "Contact step (with version)",
          parameters: [uuidParam("id")],
          requestBody: { required: true, content: json(z.intersection(checkoutContactSchema, z.object({ version: z.number().int() }))) },
          responses: { 200: { description: "Checkout, totals recalculated", content: json(checkoutSchema) }, 400: error("Check the fields"), 404: error("Not yours"), 409: error("Changed elsewhere or closed") },
        },
      },
      "/v1/checkouts/{id}/address": {
        put: {
          summary: "Delivery address; resolves the delivery zone and copies its rate",
          parameters: [uuidParam("id")],
          requestBody: { required: true, content: json(z.intersection(checkoutAddressSchema, z.object({ version: z.number().int() }))) },
          responses: { 200: { description: "Checkout", content: json(checkoutSchema) }, 400: error("Check the fields"), 404: error("Not yours"), 409: error("Changed elsewhere or closed"), 422: error("Contact first") },
        },
      },
      "/v1/checkouts/{id}/delivery": {
        put: {
          summary: "Delivery option",
          parameters: [uuidParam("id")],
          requestBody: { required: true, content: json(z.intersection(checkoutDeliverySchema, z.object({ version: z.number().int() }))) },
          responses: { 200: { description: "Checkout", content: json(checkoutSchema) }, 404: error("Not yours"), 409: error("Changed elsewhere or closed"), 422: error("Address first") },
        },
      },
      "/v1/checkouts/{id}/billing": {
        put: {
          summary: "Billing and VAT details",
          parameters: [uuidParam("id")],
          requestBody: { required: true, content: json(z.intersection(checkoutBillingSchema, z.object({ version: z.number().int() }))) },
          responses: { 200: { description: "Checkout", content: json(checkoutSchema) }, 400: error("Check the fields"), 404: error("Not yours"), 409: error("Changed elsewhere or closed"), 422: error("Delivery first") },
        },
      },
      "/v1/admin/courier-settings": {
        get: { summary: "Courier prices through Shipbubble (PRICING_MANAGE)", responses: { 200: { description: "Settings", content: json(courierSettingsSchema) }, 403: error("Missing PRICING_MANAGE") } },
        put: {
          summary: "Save courier settings; the pickup address is checked with the courier (audited)",
          requestBody: { required: true, content: json(courierSettingsInputSchema) },
          responses: { 200: { description: "Saved", content: json(courierSettingsSchema) }, 400: error("Pickup address not found"), 403: error("Missing PRICING_MANAGE"), 409: error("Changed by someone else"), 422: error("No courier key") },
        },
      },
      "/v1/admin/courier-settings/categories": {
        get: { summary: "Shipbubble's package categories (PRICING_MANAGE)", responses: { 200: { description: "Categories", content: json(courierCategoriesSchema) }, 403: error("Missing PRICING_MANAGE"), 422: error("Courier unavailable") } },
      },
      "/v1/admin/shipments/{id}/courier": {
        post: {
          summary: "Book a courier-priced order's shipment with Shipbubble, after checking the rate again (FULFILMENT_MANAGE, audited)",
          parameters: [uuidParam("id"), idempotencyHeader],
          requestBody: { required: true, content: json(bookCourierSchema) },
          responses: { 200: { description: "Booked: LABEL_CREATED with tracking", content: json(adminShipmentSchema) }, 403: error("Missing FULFILMENT_MANAGE"), 404: error("No such shipment"), 409: error("Changed by someone else"), 422: error("Already booked, not courier-priced, or the courier refused") },
        },
      },
      "/v1/webhooks/shipbubble": {
        post: {
          summary: "Shipbubble's shipment events, signed with x-ship-signature (HMAC-SHA512 of the raw body); moves shipments along TECH-01 §4 only",
          responses: { 200: { description: "Received" }, 403: error("Bad signature") },
        },
      },
      "/v1/admin/delivery-prices": {
        get: { summary: "Checkouts waiting for a delivery price (PRICING_MANAGE)", responses: { 200: { description: "Queue", content: json(deliveryPriceQueueSchema) }, 403: error("Missing PRICING_MANAGE") } },
      },
      "/v1/admin/delivery-prices/{checkoutId}": {
        post: {
          summary: "Set the delivery price for an address outside the zones; the customer is emailed (audited)",
          parameters: [uuidParam("checkoutId")],
          requestBody: { required: true, content: json(deliveryPriceInputSchema) },
          responses: {
            200: { description: "Priced", content: json(z.object({ checkoutId: z.string(), version: z.number().int(), totalMinor: z.string() })) },
            403: error("Missing PRICING_MANAGE"),
            404: error("No such checkout"),
            409: error("Changed, closed or being paid"),
            422: error("Delivery already has a zone rate"),
          },
        },
      },
      "/v1/admin/delivery-zones": {
        get: { summary: "Delivery zones (PRICING_MANAGE)", responses: { 200: { description: "Zones", content: json(deliveryZoneListSchema) }, 403: error("Missing PRICING_MANAGE") } },
        post: {
          summary: "Add an area zone; overlapping covers are refused (audited)",
          requestBody: { required: true, content: json(deliveryZoneInputSchema) },
          responses: { 201: { description: "Zone", content: json(deliveryZoneSchema) }, 400: error("Overlap or invalid"), 403: error("Missing PRICING_MANAGE") },
        },
      },
      "/v1/admin/delivery-zones/{id}": {
        patch: {
          summary: "Change a zone; the rest-of-Nigeria and International rows change pricing only (audited)",
          parameters: [uuidParam("id")],
          requestBody: { required: true, content: json(z.union([deliveryZoneInputSchema, fixedZoneInputSchema])) },
          responses: { 200: { description: "Zone", content: json(deliveryZoneSchema) }, 400: error("Overlap or invalid"), 403: error("Missing PRICING_MANAGE"), 404: error("No such zone"), 409: error("Changed by someone else") },
        },
        delete: { summary: "Remove an area zone (audited)", parameters: [uuidParam("id")], responses: { 204: { description: "Removed" }, 403: error("Missing PRICING_MANAGE"), 404: error("No such area zone") } },
      },
      "/v1/configurations": {
        post: {
          summary: "Start a configuration draft for a published product. Owned by the account, or by this browser (sets the HttpOnly hp.device cookie).",
          requestBody: { required: true, content: json(createConfigurationSchema) },
          responses: { 201: { description: "Draft", content: json(configurationSchema) }, 404: error("Not published"), 422: error("Consultative product (RULE_FAILED)") },
        },
      },
      "/v1/configurations/{id}": {
        get: { summary: "A draft (owner, owning browser or guest link only; anyone else 404)", parameters: [uuidParam("id")], responses: { 200: { description: "Draft", content: json(configurationSchema) }, 404: error("Not yours or missing") } },
        patch: {
          summary: "Autosave with the version you started from. Returns the draft and any answers removed after confirmation.",
          parameters: [uuidParam("id")],
          requestBody: { required: true, content: json(updateConfigurationSchema) },
          responses: {
            200: { description: "Saved (draft, removed)" },
            400: error("A choice that isn't available with earlier answers"),
            409: error("VERSION_CONFLICT with the latest draft"),
            422: error("ANSWERS_CONFLICT: later answers this change would remove"),
          },
        },
      },
      "/v1/configurations/{id}/email": {
        post: {
          summary: "Email a link that opens this draft on any device (guest link, CONTACT limit)",
          parameters: [uuidParam("id")],
          requestBody: { required: true, content: json(emailDraftSchema) },
          responses: { 200: { description: "Sent", content: json(configurationSchema) }, 404: error("Not yours") },
        },
      },
      "/v1/configurations/{id}/quote-request": {
        post: {
          summary: "Request Final Quote: keeps every answer, creates a PENDING_REVIEW quote and emails a link (CONTACT limit)",
          parameters: [uuidParam("id")],
          requestBody: { required: true, content: json(quoteRequestSchema) },
          responses: {
            200: { description: "Quote reference", content: json(quoteRequestResultSchema) },
            400: error("No quantity yet"),
            404: error("Not yours"),
            409: error("Not a draft"),
            422: error("A blocking answer must change first"),
          },
        },
      },
      "/v1/configurations/{id}/files": {
        post: {
          summary: "Attach the customer's uploaded artwork, logo, reference or garment photo to a draft",
          parameters: [uuidParam("id")],
          requestBody: { required: true, content: json(attachConfigurationFileSchema) },
          responses: { 201: { description: "Draft", content: json(configurationSchema) }, 404: error("Not yours"), 422: error("File rejected") },
        },
      },
      "/v1/configurations/{id}/files/{linkId}": {
        delete: { summary: "Remove a file from a draft", parameters: [uuidParam("id"), uuidParam("linkId")], responses: { 200: { description: "Draft", content: json(configurationSchema) }, 404: error("Not yours") } },
      },
      "/v1/configurations/{id}/files/{linkId}/low-resolution": {
        post: {
          summary: "What to do about a low-resolution file: replace, clean up or review. Never blocks the order.",
          parameters: [uuidParam("id"), uuidParam("linkId")],
          requestBody: { required: true, content: json(lowResolutionActionSchema) },
          responses: { 200: { description: "Draft", content: json(configurationSchema) }, 404: error("Not yours") },
        },
      },
      "/v1/configurations/{id}/personalization": {
        post: {
          summary: "Import per-item names, numbers, departments and sizes from a CSV upload, checked row by row",
          parameters: [uuidParam("id")],
          requestBody: { required: true, content: json(personalizationImportSchema) },
          responses: { 200: { description: "Result", content: json(personalizationResultSchema) }, 404: error("Not yours"), 422: error("File still being checked") },
        },
      },
      ...organizationPaths,
      ...workspacePaths,
      ...assetPaths,
      ...templatePaths,
      ...collectionPaths,
      "/v1/admin/me": {
        get: {
          summary: "The signed-in staff member, for the admin shell",
          responses: { 200: { description: "Staff with MFA", content: json(adminMeSchema) }, ...staffOnly },
        },
      },
      "/v1/demo/slice": {
        post: {
          summary: "Demo only (off in production): save a message and queue its job",
          requestBody: { required: true, content: json(demoSliceCreateSchema) },
          responses: { 201: { description: "Saved; the job is queued", content: json(demoSliceSchema) }, 400: error("Bad input") },
        },
      },
      "/v1/demo/slice/{id}": {
        get: {
          summary: "Demo only (off in production): the message and its job result",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { 200: { description: "The demo request", content: json(demoSliceSchema) }, 404: error("Not found") },
        },
      },
    },
    components: { schemas: { ApiError: jsonSchema(apiErrorSchema) } },
    "x-sign-in-routes":
      "Sign-in routes under /v1/auth (email and password, magic link, authenticator, sign-out) are served by the IdentityAdapter (TECH-03 §3). Their errors use the ApiError shape.",
  };
}

export const renderOpenApi = () => `${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`;

/** Normalises line endings so Windows checkouts compare equal. */
export const openApiMatches = (committed: string, generated: string) =>
  committed.replace(/\r\n/g, "\n") === generated.replace(/\r\n/g, "\n");
