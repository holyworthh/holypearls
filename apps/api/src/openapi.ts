import {
  adminMeSchema,
  apiErrorSchema,
  adminHelpRequestSchema,
  addProductMediaSchema,
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
  quoteRequestSchema,
  updateConfigurationSchema,
  adminProductPageSchema,
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
          responses: { 200: { description: "Published", content: json(adminContentPageSchema) }, 409: error("Archived or VERSION_CONFLICT"), 422: error("Missing summary or text (RULE_FAILED)"), ...staffOnly },
        },
      },
      "/v1/admin/content/{id}/status": {
        post: {
          summary: "Unpublish (DRAFT) or archive a page (CONTENT_MANAGE, audited)",
          parameters: [uuidParam("id")],
          requestBody: { required: true, content: json(changeContentStatusSchema) },
          responses: { 200: { description: "Changed", content: json(adminContentPageSchema) }, 409: error("Not allowed or VERSION_CONFLICT"), ...staffOnly },
        },
      },
      "/v1/media/{fileId}/{kind}": {
        get: {
          summary: "A product, category or content-page image (preview or thumbnail); only for visible products, published categories and pages that aren't archived. Cached for a year.",
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
