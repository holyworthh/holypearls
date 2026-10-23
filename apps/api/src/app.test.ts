import { Public } from "./identity/identified.guard.js";
import { Body, Controller, Get, type INestApplication, Post } from "@nestjs/common";
import type { IdentityAdapter } from "@holypearls/auth";
import { apiErrorSchema } from "@holypearls/contracts";
import type { Database } from "@holypearls/db";
import { Writable } from "node:stream";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createApp } from "./app.js";
import { AppError } from "./errors.js";
import { createLogger } from "./logger.js";
import { createHarness, type Harness, TEST_WEB_ORIGIN } from "./testing/harness.js";
import { ZodValidationPipe } from "./validation.js";

const signupSchema = z.object({
  email: z.email("Enter a valid email address"),
  quantity: z.number().int().min(1, "Enter at least 1"),
});

// Test-only route that exercises the conventions; it is not part of the API.
@Controller("conventions")
class ConventionsController {
  @Post("echo")
  @Public()
  echo(@Body(new ZodValidationPipe(signupSchema)) body: z.infer<typeof signupSchema>) {
    return { quantity: body.quantity };
  }

  @Get("expired")
  expired() {
    throw new AppError("RULE_FAILED", { message: "This quote has expired.", context: { quoteId: "q_1" } });
  }

  @Get("boom")
  boom() {
    throw new Error("connection string postgres://user:hunter2@db leaked");
  }
}

function captureLogs() {
  const lines: string[] = [];
  const destination = new Writable({
    write(chunk, _encoding, done) {
      lines.push(...String(chunk).trim().split("\n"));
      done();
    },
  });
  return { lines, logger: createLogger({ destination, environment: "test" }) };
}

describe("API conventions", () => {
  let harness: Harness;
  let app: INestApplication;
  const logs = { lines: [] as string[] };

  beforeAll(async () => {
    harness = await createHarness({ controllers: [ConventionsController], seed: false });
    app = harness.app;
    logs.lines = harness.logs;
  });

  afterAll(async () => {
    await harness?.close();
  });

  beforeEach(() => {
    logs.lines.length = 0;
  });

  it("sends the security headers on every response (review P2-07)", async () => {
    const paths = [
      ["get", "/health/live"],
      ["get", "/v1/conventions/expired"],
      ["get", "/no-such-path"],
      ["get", "/v1/me"],
      ["get", "/v1/admin/me"],
      ["post", "/v1/webhooks/paystack"],
    ] as const;
    for (const [method, path] of paths) {
      const response = await request(app.getHttpServer())[method](path);
      expect(response.headers["permissions-policy"]).toBe("camera=(), microphone=(), geolocation=()");
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
      expect(response.headers["referrer-policy"]).toBe("no-referrer");
      expect(response.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
      expect(response.headers["content-security-policy"]).toContain("default-src 'none'");
      expect(response.headers["x-frame-options"]).toBe("DENY");
    }
  });

  it("returns 400 in the error shape with field errors and the request ID", async () => {
    const response = await request(app.getHttpServer())
      .post("/v1/conventions/echo")
      .set("origin", TEST_WEB_ORIGIN)
      .send({ email: "not-an-email", quantity: 0 });

    expect(response.status).toBe(400);
    const body = apiErrorSchema.parse(response.body);
    expect(body.code).toBe("VALIDATION_FAILED");
    expect(body.fieldErrors).toEqual({ email: "Enter a valid email address", quantity: "Enter at least 1" });
    expect(body.requestId).toMatch(/^req_[0-9a-f]{32}$/);
    expect(response.headers["x-request-id"]).toBe(body.requestId);
  });

  it("returns 400 for malformed JSON", async () => {
    const response = await request(app.getHttpServer())
      .post("/v1/conventions/echo")
      .set("content-type", "application/json")
      .send("{");
    expect(response.status).toBe(400);
    expect(apiErrorSchema.parse(response.body).code).toBe("VALIDATION_FAILED");
  });

  it("accepts valid input and returns the object directly", async () => {
    const response = await request(app.getHttpServer())
      .post("/v1/conventions/echo")
      .send({ email: "ada@example.com", quantity: 3 });
    expect(response.status).toBe(201);
    expect(response.body).toEqual({ quantity: 3 });
  });

  it("keeps a well-formed incoming request ID", async () => {
    const response = await request(app.getHttpServer()).get("/v1/nowhere").set("x-request-id", "req_from_web_123");
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ code: "NOT_FOUND", requestId: "req_from_web_123" });
  });

  it("returns the error shape for unknown paths outside /v1", async () => {
    const response = await request(app.getHttpServer()).get("/nope");
    expect(response.status).toBe(404);
    expect(apiErrorSchema.parse(response.body).code).toBe("NOT_FOUND");
  });

  it("replaces a malformed incoming request ID", async () => {
    const response = await request(app.getHttpServer()).get("/v1/nowhere").set("x-request-id", "<script>");
    expect(response.headers["x-request-id"]).toMatch(/^req_/);
  });

  it("maps business errors to their code, status and context", async () => {
    const response = await request(app.getHttpServer()).get("/v1/conventions/expired");
    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({
      code: "RULE_FAILED",
      message: "This quote has expired.",
      context: { quoteId: "q_1" },
    });
  });

  it("hides unexpected errors behind INTERNAL and logs them with the request ID", async () => {
    const response = await request(app.getHttpServer()).get("/v1/conventions/boom");
    expect(response.status).toBe(500);
    const body = apiErrorSchema.parse(response.body);
    expect(body.code).toBe("INTERNAL");
    expect(JSON.stringify(body)).not.toContain("hunter2");
    const errorLine = logs.lines.map((line) => JSON.parse(line)).find((line) => line.level === "error");
    expect(errorLine).toMatchObject({ requestId: body.requestId, service: "api", environment: "test" });
  });

  it("serves health checks outside /v1", async () => {
    const live = await request(app.getHttpServer()).get("/health/live");
    expect(live.status).toBe(200);
    expect(live.body).toEqual({ status: "ok" });

    const ready = await request(app.getHttpServer()).get("/health/ready");
    expect(ready.status).toBe(200);
    expect(ready.body).toEqual({ status: "ok", checks: { database: "ok" } });
  });

  it("writes one JSON log line per request", async () => {
    await request(app.getHttpServer()).get("/health/live");
    const line = JSON.parse(logs.lines.find((entry) => entry.includes('"msg":"request"'))!);
    expect(line).toMatchObject({ level: "info", service: "api", method: "GET", status: 200 });
    expect(line.requestId).toMatch(/^req_/);
    expect(typeof line.durationMs).toBe("number");
    expect(typeof line.time).toBe("string");
  });
});

describe("readiness without a database", () => {
  it("returns 503 when the database cannot be reached", async () => {
    const brokenDb = { execute: async () => Promise.reject(new Error("ECONNREFUSED")) } as unknown as Database;
    const identity = { getSession: async () => null } as unknown as IdentityAdapter;
    const app = await createApp({
      db: brokenDb,
      logger: captureLogs().logger,
      identity,
      webOrigin: TEST_WEB_ORIGIN,
      payments: null,
      jobs: {} as never,
      sealKey: "unused-in-this-test-0123456789-0123456789",
      helpInboxEmail: "help@holypearls.test",
      storage: {} as never,
      publicStorage: {} as never,
    });
    await app.init();
    try {
      const response = await request(app.getHttpServer()).get("/health/ready");
      expect(response.status).toBe(503);
      expect(response.body).toEqual({ status: "unavailable", checks: { database: "unavailable" } });
    } finally {
      await app.close();
    }
  });
});
