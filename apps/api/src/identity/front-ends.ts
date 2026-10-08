import { ERROR_CODES } from "@holypearls/contracts";
import { type Database, eq, schema } from "@holypearls/db";
import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { findActiveStaff } from "./actor.js";

/*
 * Two front ends (ADR-017): the customer site and the staff admin, each on its
 * own domain with its own proxy. Each proxy proves itself with its own secret
 * (x-hp-proxy-secret) and says which it is (x-hp-surface). The API serves
 * admin routes and staff sign-in only to the admin, and customer sign-in only
 * to the customer site.
 *
 * Without ADMIN_ORIGIN the API serves one front end, as before ADR-017; only
 * local set-ups and older tests run like that, because production refuses to
 * start without it. Without the admin secret (locally) the admin is known by
 * its origin.
 */

export type Surface = "web" | "admin";

export interface FrontEnds {
  webOrigin: string;
  /** Null: one front end serves everything (local and tests only). */
  adminOrigin: string | null;
  webProxySecret: string | null;
  adminProxySecret: string | null;
}

export const SURFACE_HEADER = "x-hp-surface";
export const PROXY_SECRET_HEADER = "x-hp-proxy-secret";

export const separated = (fronts: FrontEnds) => fronts.adminOrigin !== null;

export function secretMatches(given: string | undefined, secret: string | null): boolean {
  return Boolean(secret && given && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret)));
}

/** Which front end a request came through. Anything not proven to be the admin is the customer site. */
export function surfaceOf(request: Request, fronts: FrontEnds): Surface {
  if (!separated(fronts)) return "web";
  if (fronts.adminProxySecret) return secretMatches(request.header(PROXY_SECRET_HEADER), fronts.adminProxySecret) ? "admin" : "web";
  // Locally, with no secret: the admin's own origin, or its proxy's say-so.
  return request.header("origin") === fronts.adminOrigin || request.header(SURFACE_HEADER) === "admin" ? "admin" : "web";
}

/** The origin a state-changing request must come from (TECH-03 §13). */
export const originFor = (surface: Surface, fronts: FrontEnds) => (surface === "admin" && fronts.adminOrigin ? fronts.adminOrigin : fronts.webOrigin);

/** Admin routes and the authenticator steps of staff sign-in. */
const ADMIN_ONLY = /^\/v1\/(admin|auth\/two-factor)(\/|$)/;
/** Customer-only sign-in (email links) and customer sign-up: never on the admin. */
const CUSTOMER_ONLY = /^\/v1\/auth\/(sign-in\/magic-link|magic-link\/verify|sign-up\/email|verify-email|send-verification-email)(\/|$)/;

/** 404 for routes that belong to the other front end, so neither learns the other's routes exist (TECH-03 §12). */
export function frontEndBoundary(fronts: FrontEnds) {
  return (request: Request, response: Response, next: NextFunction) => {
    if (!separated(fronts)) return next();
    const wrongSide = request.surface === "admin" ? CUSTOMER_ONLY.test(request.path) : ADMIN_ONLY.test(request.path);
    if (!wrongSide) return next();
    response.status(404).json({ code: "NOT_FOUND", message: ERROR_CODES.NOT_FOUND.message, requestId: request.requestId ?? "unknown" });
  };
}

/**
 * Staff sign in only on the admin, customers only on the customer site. The
 * refusal looks exactly like a wrong password, so neither site reveals which
 * emails belong to staff.
 */
export async function signInAllowedHere(db: Database, fronts: FrontEnds, surface: Surface | undefined, email: string | undefined): Promise<boolean> {
  if (!separated(fronts) || !email) return true;
  const [user] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email));
  const staff = user ? (await findActiveStaff(db, user.id)) !== null : false;
  return surface === "admin" ? staff : !staff;
}
