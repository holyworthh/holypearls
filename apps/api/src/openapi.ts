import {
  adminMeSchema,
  apiErrorSchema,
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
      "/v1/admin/me": {
        get: {
          summary: "The signed-in staff member, for the admin shell",
          responses: { 200: { description: "Staff with MFA", content: json(adminMeSchema) }, ...staffOnly },
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
