import { ERROR_CODES } from "@holypearls/contracts";
import type { NextFunction, Request, Response } from "express";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const SESSION_COOKIE = /(?:^|;\s*)(?:__Secure-)?hp\./;

/**
 * TECH-03 §13: a state-changing request must come from the HolyPearls web
 * origin. A foreign Origin is refused. A request with no Origin is refused
 * when it carries a session cookie; requests without cookies (webhooks,
 * server-to-server) are not browser requests and have their own checks.
 */
export function originCheck(webOrigin: string) {
  const allowed = new URL(webOrigin).origin;
  return (request: Request, response: Response, next: NextFunction) => {
    if (SAFE_METHODS.has(request.method)) return next();
    const origin = request.header("origin");
    const hasSession = SESSION_COOKIE.test(request.header("cookie") ?? "");
    if ((origin && origin !== allowed) || (!origin && hasSession)) {
      response.status(403).json({
        code: "FORBIDDEN",
        message: ERROR_CODES.FORBIDDEN.message,
        context: { reason: "ORIGIN_NOT_ALLOWED" },
        requestId: request.requestId ?? "unknown",
      });
      return;
    }
    next();
  };
}
