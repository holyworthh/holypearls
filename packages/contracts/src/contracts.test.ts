import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ApiError, createApiClient } from "./client.js";
import { apiErrorSchema, ERROR_CODES, toFieldErrors } from "./errors.js";
import { money } from "./money.js";
import { moneyWireSchema, toMoneyWire } from "./money-wire.js";

describe("error-code registry", () => {
  it("gives every code an HTTP status and screen copy", () => {
    for (const [code, entry] of Object.entries(ERROR_CODES)) {
      expect(code).toMatch(/^[A-Z_]+$/);
      expect(entry.status).toBeGreaterThanOrEqual(400);
      expect(entry.message.length).toBeGreaterThan(0);
    }
  });

  it("uses the TECH-02 §2 status for each case", () => {
    expect(ERROR_CODES.VALIDATION_FAILED.status).toBe(400);
    expect(ERROR_CODES.NOT_SIGNED_IN.status).toBe(401);
    expect(ERROR_CODES.FORBIDDEN.status).toBe(403);
    expect(ERROR_CODES.NOT_FOUND.status).toBe(404);
    expect(ERROR_CODES.CONFLICT.status).toBe(409);
    expect(ERROR_CODES.RULE_FAILED.status).toBe(422);
    expect(ERROR_CODES.RATE_LIMITED.status).toBe(429);
  });

  it("flattens nested field errors", () => {
    const schema = z.object({ contact: z.object({ email: z.email("Enter a valid email address") }) });
    const result = schema.safeParse({ contact: { email: "x" } });
    expect(result.success).toBe(false);
    if (!result.success) expect(toFieldErrors(result.error)).toEqual({ "contact.email": "Enter a valid email address" });
  });
});

describe("money on the wire", () => {
  it("round-trips bigint minor units as a digit string", () => {
    const value = money(45000000n, "NGN");
    const wire = toMoneyWire(value);
    expect(wire).toEqual({ amountMinor: "45000000", currency: "NGN" });
    expect(moneyWireSchema.parse(JSON.parse(JSON.stringify(wire)))).toEqual(value);
  });

  it("rejects decimals and unknown currencies", () => {
    expect(moneyWireSchema.safeParse({ amountMinor: "12.5", currency: "NGN" }).success).toBe(false);
    expect(moneyWireSchema.safeParse({ amountMinor: "125", currency: "EUR" }).success).toBe(false);
  });
});

describe("API client", () => {
  const jsonResponse = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  it("parses a success response with the contract schema", async () => {
    const request = createApiClient({ fetch: async () => jsonResponse(200, { status: "ok" }) });
    await expect(request("/health/live", { response: z.object({ status: z.literal("ok") }) })).resolves.toEqual({
      status: "ok",
    });
  });

  it("throws a typed ApiError carrying the error shape", async () => {
    const body = {
      code: "VALIDATION_FAILED",
      message: "Bad",
      fieldErrors: { email: "Enter a valid email address" },
      requestId: "req_1",
    };
    const request = createApiClient({ fetch: async () => jsonResponse(400, body) });
    const error = await request("/v1/x", { method: "POST", body: {}, response: z.unknown() }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(400);
    expect((error as ApiError).body).toEqual(apiErrorSchema.parse(body));
  });

  it("falls back to INTERNAL when the error body is not the error shape", async () => {
    const request = createApiClient({
      fetch: async () => new Response("<html>", { status: 502, headers: { "x-request-id": "req_2" } }),
    });
    const error = (await request("/v1/x", { response: z.unknown() }).catch((e: unknown) => e)) as ApiError;
    expect(error.code).toBe("INTERNAL");
    expect(error.body.requestId).toBe("req_2");
  });
});
