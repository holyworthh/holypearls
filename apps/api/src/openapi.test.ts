import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { openApiMatches, renderOpenApi } from "./openapi.js";

describe("OpenAPI", () => {
  it("the committed openapi.json matches the contracts", () => {
    const committed = readFileSync(new URL("../openapi.json", import.meta.url), "utf8");
    expect(openApiMatches(committed, renderOpenApi())).toBe(true);
  });

  it("detects drift between the committed file and the contracts", () => {
    const drifted = renderOpenApi().replace('"The process is running"', '"Changed without regenerating"');
    expect(openApiMatches(drifted, renderOpenApi())).toBe(false);
  });

  it("documents the error shape and health checks", () => {
    const document = JSON.parse(renderOpenApi());
    expect(Object.keys(document.paths)).toEqual(["/health/live", "/health/ready", "/v1/me", "/v1/me/sessions", "/v1/me/sessions/revoke-all", "/v1/admin/me", "/v1/demo/slice", "/v1/demo/slice/{id}"]);
    expect(document.components.schemas.ApiError.required).toEqual(["code", "message", "requestId"]);
  });
});
