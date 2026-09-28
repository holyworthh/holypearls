import type { IdentityAdapter } from "@holypearls/auth";
import { type ApiErrorBody, ERROR_CODES, type ErrorCode } from "@holypearls/contracts";
import type { NextFunction, Request, Response } from "express";
import { Readable } from "node:stream";
import type { Logger } from "pino";

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

/**
 * Serves the IdentityAdapter's routes and rewrites their errors into the one
 * error shape (TECH-02 §2). The library's own code (for example
 * INVALID_EMAIL_OR_PASSWORD) is kept in `context.reason`.
 */
export function authRoutes(identity: IdentityAdapter, webOrigin: string, logger: Logger) {
  return async (request: Request, response: Response, next: NextFunction) => {
    if (!request.path.startsWith(AUTH_ROUTE_PREFIX)) return next();
    const requestId = request.requestId ?? "unknown";
    try {
      const url = new URL(`/api${request.originalUrl}`, webOrigin);
      const hasBody = !["GET", "HEAD"].includes(request.method);
      const upstream = await identity.handle(
        new Request(url, {
          method: request.method,
          headers: request.headers as Record<string, string>,
          body: hasBody ? (Readable.toWeb(request) as ReadableStream) : undefined,
          // @ts-expect-error Node's fetch needs duplex for streamed request bodies.
          duplex: hasBody ? "half" : undefined,
        }),
      );

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
      const body: ApiErrorBody = {
        code,
        message: ERROR_CODES[code].message,
        ...(reason && { context: { reason } }),
        requestId,
      };
      if (code === "INTERNAL") logger.error({ requestId, status: upstream.status, reason }, "sign-in route failed");
      response.setHeader("content-type", "application/json");
      response.send(JSON.stringify(body));
    } catch (error) {
      logger.error({ requestId, err: error }, "sign-in route failed");
      response.status(500).json({ code: "INTERNAL", message: ERROR_CODES.INTERNAL.message, requestId });
    }
  };
}
