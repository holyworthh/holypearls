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
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ["/((?!_next/|favicon.ico).*)"] };
