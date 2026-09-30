import { NextResponse, type NextRequest } from "next/server";

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
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(headers.get("x-request-id") ?? "")) {
    headers.set("x-request-id", `req_web_${crypto.randomUUID().replaceAll("-", "")}`);
  }
  headers.set("x-hp-pathname", request.nextUrl.pathname);
  const response = NextResponse.next({ request: { headers } });
  if (isPrivatePath(request.nextUrl.pathname)) response.headers.set("x-robots-tag", "noindex, nofollow");
  return response;
}

export const config = { matcher: ["/((?!api/|_next/|favicon.ico).*)"] };
