import { apiErrorSchema, healthLiveSchema, healthReadySchema } from "@holypearls/contracts";
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
    },
    components: { schemas: { ApiError: jsonSchema(apiErrorSchema) } },
  };
}

export const renderOpenApi = () => `${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`;

/** Normalises line endings so Windows checkouts compare equal. */
export const openApiMatches = (committed: string, generated: string) =>
  committed.replace(/\r\n/g, "\n") === generated.replace(/\r\n/g, "\n");
