import {
  adminMeSchema,
  apiErrorSchema,
  adminHelpRequestSchema,
  auditEntrySchema,
  auditPageSchema,
  createHelpRequestSchema,
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
