import { contentSecurityPolicy, newNonce } from "@holypearls/web-kit/security-headers";
import { proxyRequestHeaders } from "@holypearls/web-kit/visitor";
import { NextResponse, type NextRequest } from "next/server";
import { WEB_IDENTITY } from "./lib/visitor";

/**
 * Private pages (PUB-SEO-008): noindex by default, in code, for every page
 * under these paths, including ones added later. Account, sign-in, search
 * results, configuration, cart, checkout, quotes, proofs, orders, workspaces,
 * collections, help requests and link pages.
 */
const PRIVATE = /^\/(account|sign-in|search|configure|cart|checkout|quotes?|proofs?|orders?|workspace|collections?|group|issues?|help|l|dev|design-system|internal|preview)(\/|$)|^\/products\/[^/]+\/configure(\/|$)/;

export const isPrivatePath = (pathname: string) => PRIVATE.test(pathname);

/**
 * Staff work only in the admin app on its own subdomain (ADR-017): the
 * customer site never forwards admin routes or the authenticator steps of
 * staff sign-in to the API. The API refuses them from here too, and refuses
 * staff accounts at the customer sign-in (T00-10).
 */
const STAFF_ONLY_API = /^\/api\/v1\/(admin|auth\/two-factor)(\/|$)/;

export const isStaffOnlyApiPath = (pathname: string) => STAFF_ONLY_API.test(pathname);

/**
 * Gives each page request a request ID that follows it to the API (TECH-07
 * §10), tells server layouts which path is being rendered, and marks private
 * pages noindex. API calls go on with the visitor's address and this front
 * end's identity, vouched for by its secret (review P1-08, ADR-017).
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/")) {
    if (isStaffOnlyApiPath(pathname)) {
      return NextResponse.json({ code: "NOT_FOUND", message: "We couldn't find what you were looking for.", requestId: "web" }, { status: 404 });
    }
    return NextResponse.next({ request: { headers: proxyRequestHeaders(request.headers, WEB_IDENTITY) } });
  }
  const headers = new Headers(request.headers);
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(headers.get("x-request-id") ?? "")) {
    headers.set("x-request-id", `req_web_${crypto.randomUUID().replaceAll("-", "")}`);
  }
  headers.set("x-hp-pathname", pathname);
  // A new nonce per page request (TECH-06 §9). Next reads it from the request's CSP header and puts it on its own scripts.
  const nonce = newNonce();
  const csp = contentSecurityPolicy({ nonce, surface: "web" });
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("content-security-policy", csp);
  if (isPrivatePath(pathname)) response.headers.set("x-robots-tag", "noindex, nofollow");
  return response;
}

export const config = { matcher: ["/((?!_next/|favicon.ico).*)"] };
