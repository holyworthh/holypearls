import { NextResponse, type NextRequest } from "next/server";
import { CLIENT_IP_HEADER, PROXY_SECRET_HEADER, visitorHeaders } from "./lib/visitor";

/**
 * Private pages (PUB-SEO-008): noindex by default, in code, for every page
 * under these paths, including ones added later. Admin, account, sign-in,
 * search results, configuration, cart, checkout, quotes, proofs, orders,
 * workspaces, collections, help requests and link pages.
 */
const PRIVATE = /^\/(admin|account|sign-in|search|configure|cart|checkout|quotes?|proofs?|orders?|workspace|collections?|group|issues?|help|l|dev|design-system|internal)(\/|$)|^\/products\/[^/]+\/configure(\/|$)/;

export const isPrivatePath = (pathname: string) => PRIVATE.test(pathname);

/**
 * Gives each page request a request ID that follows it to the API (TECH-07
 * §10), tells server layouts which path is being rendered, and marks private
 * pages noindex.
 */
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  // API calls go on to the API with the visitor's address, vouched for by the shared secret (review P1-08).
  if (request.nextUrl.pathname.startsWith("/api/")) {
    headers.delete(CLIENT_IP_HEADER);
    headers.delete(PROXY_SECRET_HEADER);
    for (const [name, value] of Object.entries(visitorHeaders(request.headers))) headers.set(name, value);
    return NextResponse.next({ request: { headers } });
  }
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(headers.get("x-request-id") ?? "")) {
    headers.set("x-request-id", `req_web_${crypto.randomUUID().replaceAll("-", "")}`);
  }
  headers.set("x-hp-pathname", request.nextUrl.pathname);
  const response = NextResponse.next({ request: { headers } });
  if (isPrivatePath(request.nextUrl.pathname)) response.headers.set("x-robots-tag", "noindex, nofollow");
  return response;
}

export const config = { matcher: ["/((?!_next/|favicon.ico).*)"] };
