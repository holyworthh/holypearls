import {
  adminMeSchema,
  apiErrorSchema,
  auditEntrySchema,
  auditPageSchema,
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
