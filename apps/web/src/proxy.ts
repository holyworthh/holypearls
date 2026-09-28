import { NextResponse, type NextRequest } from "next/server";

/**
 * Gives each page request a request ID that follows it to the API (TECH-07
 * §10), and tells server layouts which path is being rendered.
 */
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(headers.get("x-request-id") ?? "")) {
    headers.set("x-request-id", `req_web_${crypto.randomUUID().replaceAll("-", "")}`);
  }
  headers.set("x-hp-pathname", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ["/((?!api/|_next/|favicon.ico).*)"] };
