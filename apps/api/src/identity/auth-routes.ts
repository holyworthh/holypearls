import type { IdentityAdapter } from "@holypearls/auth";
import { type ApiErrorBody, ERROR_CODES, type ErrorCode } from "@holypearls/contracts";
import { type Database, eq, schema } from "@holypearls/db";
import type { NextFunction, Request, Response } from "express";
import type { Logger } from "pino";
import { recordAudit } from "../platform/audit.js";
import { clientIp, type RateLimiter } from "../platform/rate-limit.js";
import type { ActorContext } from "./actor.js";

/** API path of the sign-in routes; the browser reaches them at /api/v1/auth via the web app. */
export const AUTH_ROUTE_PREFIX = "/v1/auth/";

const STATUS_TO_CODE: Record<number, ErrorCode> = {
  400: "VALIDATION_FAILED",
  401: "NOT_SIGNED_IN",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  422: "VALIDATION_FAILED",
  429: "RATE_LIMITED",
};

/** Sign-in, sign-up and reset routes share the AUTH limit (TECH-02 §14). */
const AUTH_LIMITED = ["/sign-in/email", "/sign-in/magic-link", "/two-factor/verify-totp", "/sign-up/email", "/request-password-reset"];
/** Routes whose security events are audited need the state before the change. */
const AUDITED = ["/two-factor/verify-totp", "/two-factor/disable", "/change-password"];
const MAX_BODY_BYTES = 64 * 1024;

async function readBody(request: Request): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new Error("Body too large");
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

function emailFrom(body: Buffer): string | undefined {
  try {
    const email = (JSON.parse(body.toString("utf8")) as { email?: unknown }).email;
    return typeof email === "string" ? email.trim().toLowerCase() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Session tokens only travel in HttpOnly cookies, so scripts can never read or
 * store them (TECH-03 §3: no tokens in localStorage). Removes `token` fields
 * from JSON bodies.
 */
export function withoutTokens(text: string): string {
  if (!text.startsWith("{")) return text;
  try {
    const body = JSON.parse(text) as Record<string, unknown>;
    delete body.token;
    if (body.session && typeof body.session === "object") delete (body.session as Record<string, unknown>).token;
    return JSON.stringify(body);
  } catch {
    return text;
  }
}

export interface AuthRouteDeps {
  identity: IdentityAdapter;
  webOrigin: string;
  logger: Logger;
  db: Database;
  limiter: RateLimiter;
}

/**
 * Serves the IdentityAdapter's routes, applies the AUTH rate limit (shared by
 * every API instance) and rewrites errors into the one error shape (TECH-02
 * §2). The library's own code (for example INVALID_EMAIL_OR_PASSWORD) is kept
 * in `context.reason`.
 */
export function authRoutes({ identity, webOrigin, logger, db, limiter }: AuthRouteDeps) {
  const sendError = (response: Response, code: ErrorCode, requestId: string, context?: Record<string, unknown>) => {
    const body: ApiErrorBody = { code, message: ERROR_CODES[code].message, ...(context && { context }), requestId };
    response.status(ERROR_CODES[code].status).json(body);
  };

  return async (request: Request, response: Response, next: NextFunction) => {
    if (!request.path.startsWith(AUTH_ROUTE_PREFIX)) return next();
    const requestId = request.requestId ?? "unknown";
    const path = request.path.slice(AUTH_ROUTE_PREFIX.length - 1);
    try {
      const hasBody = !["GET", "HEAD"].includes(request.method);
      const body = hasBody ? await readBody(request) : undefined;
      const email = body ? emailFrom(body) : undefined;

      if (AUTH_LIMITED.includes(path)) {
        const limit = await limiter.hit("AUTH", { ip: clientIp(request), subject: email });
        if (!limit.allowed) {
          response.setHeader("retry-after", String(limit.retryAfterSeconds));
          return sendError(response, "RATE_LIMITED", requestId, { retryAfterSeconds: limit.retryAfterSeconds });
        }
      }
      const before = AUDITED.includes(path) ? await request.getActor!() : null;

      const url = new URL(`/api${request.originalUrl}`, webOrigin);
      const upstream = await identity.handle(
        new Request(url, {
          method: request.method,
          headers: request.headers as Record<string, string>,
          body: body ? new Uint8Array(body) : undefined,
        }),
      );
      await auditSecurityEvent({ db, limiter, path, ok: upstream.ok, status: upstream.status, email, before });

      response.status(upstream.status);
      upstream.headers.forEach((value, name) => {
        if (name !== "set-cookie" && name !== "content-length") response.setHeader(name, value);
      });
      const cookies = upstream.headers.getSetCookie();
      if (cookies.length) response.setHeader("set-cookie", cookies);

      const text = await upstream.text();
      if (upstream.ok) {
        response.send(withoutTokens(text));
        return;
      }
      let reason: string | undefined;
      try {
        reason = (JSON.parse(text) as { code?: string }).code;
      } catch {
        reason = undefined;
      }
      const code = STATUS_TO_CODE[upstream.status] ?? "INTERNAL";
      if (code === "INTERNAL") logger.error({ requestId, status: upstream.status, reason }, "sign-in route failed");
      response.setHeader("content-type", "application/json");
      const errorBody: ApiErrorBody = {
        code,
        message: ERROR_CODES[code].message,
        ...(reason && { context: { reason } }),
        requestId,
      };
      response.send(JSON.stringify(errorBody));
    } catch (error) {
      logger.error({ requestId, err: error }, "sign-in route failed");
      sendError(response, "INTERNAL", requestId);
    }
  };
}

/**
 * Audits the sign-in events TECH-03 §15 lists: 5 failed sign-ins in 15
 * minutes, MFA changes and password changes. Never the password or code.
 */
async function auditSecurityEvent(event: {
  db: Database;
  limiter: RateLimiter;
  path: string;
  ok: boolean;
  status: number;
  email?: string;
  before: ActorContext | null;
}) {
  const { db, path, ok, before } = event;
  if (path === "/sign-in/email" && event.status === 401 && event.email) {
    const window = { windowSeconds: 15 * 60 };
    const failures = await event.limiter.hitRule("AUTH_FAILURE", "subject", event.email, { limit: 4, ...window });
    if (failures.allowed) return;
    // One alert per account per window: on the fifth failure.
    const alert = await event.limiter.hitRule("AUTH_FAILURE_ALERT", "subject", event.email, { limit: 1, ...window });
    if (!alert.allowed) return;
    const [user] = await db
      .select({ id: schema.users.id, name: schema.users.name })
      .from(schema.users)
      .where(eq(schema.users.email, event.email));
    await recordAudit(db, null, {
      action: "security.sign_in_failures",
      summary: "5 failed sign-ins in 15 min",
      recordType: "USER",
      recordId: user?.id ?? null,
      recordLabel: user?.name ?? "Unknown account",
    });
    return;
  }
  if (!ok || !before || before.type !== "user") return;
  const record = { recordType: "USER", recordId: before.session.userId, recordLabel: before.session.name };
  if (path === "/two-factor/verify-totp" && !before.session.mfaEnabled) {
    await recordAudit(db, before, { ...record, action: "security.mfa_enabled", summary: "Authenticator set up", after: { mfaEnabled: true } });
  } else if (path === "/two-factor/disable") {
    await recordAudit(db, before, { ...record, action: "security.mfa_disabled", summary: "Authenticator removed", after: { mfaEnabled: false } });
  } else if (path === "/change-password") {
    await recordAudit(db, before, { ...record, action: "security.password_changed", summary: "Password changed; other sessions ended" });
  }
}
