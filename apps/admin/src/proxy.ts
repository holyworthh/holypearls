import { contentSecurityPolicy, newNonce } from "@holypearls/web-kit/security-headers";
import { proxyRequestHeaders } from "@holypearls/web-kit/visitor";
import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_IDENTITY } from "./lib/visitor";

/**
 * Every admin request: a request ID that follows it to the API (TECH-07 §10),
 * the path for the shell's navigation, and, for API calls, the admin's proxy
 * identity, vouched for by its own secret (ADR-017). Nothing here is ever
 * indexed (headers in next.config.mjs).
 */
export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next({ request: { headers: proxyRequestHeaders(request.headers, ADMIN_IDENTITY) } });
  }
  const headers = new Headers(request.headers);
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(headers.get("x-request-id") ?? "")) {
    headers.set("x-request-id", `req_admin_${crypto.randomUUID().replaceAll("-", "")}`);
  }
  headers.set("x-hp-pathname", request.nextUrl.pathname);
  // A new nonce per page request (TECH-06 §9). Next reads it from the request's CSP header and puts it on its own scripts.
  const nonce = newNonce();
  const csp = contentSecurityPolicy({ nonce, surface: "admin", development: process.env.NODE_ENV === "development", production: process.env.HP_ENV === "production" });
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("content-security-policy", csp);
  return response;
}

export const config = { matcher: ["/((?!_next/|favicon.ico).*)"] };
