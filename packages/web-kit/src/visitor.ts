/**
 * What each front end's proxy tells the API (review P1-08, ADR-017).
 *
 * - The visitor's address, for rate limits. Vercel replaces any
 *   X-Forwarded-For a browser sends with the real address, so a front end can
 *   trust it; the API can't trust it from anyone else.
 * - Which front end the request came through: the customer site ("web") or
 *   the staff admin ("admin").
 *
 * Both are vouched for by that front end's own secret (WEB_PROXY_SECRET or
 * ADMIN_PROXY_SECRET). Without a secret (locally) the address is left out and
 * the API takes the front end from the origin.
 */
export const CLIENT_IP_HEADER = "x-hp-client-ip";
export const PROXY_SECRET_HEADER = "x-hp-proxy-secret";
export const SURFACE_HEADER = "x-hp-surface";

export type Surface = "web" | "admin";

export interface ProxyIdentity {
  surface: Surface;
  /** This front end's proxy secret, if set. */
  secret: string | undefined;
}

export function visitorHeaders(incoming: Headers, identity: ProxyIdentity): Record<string, string> {
  const headers: Record<string, string> = { [SURFACE_HEADER]: identity.surface };
  if (!identity.secret) return headers;
  headers[PROXY_SECRET_HEADER] = identity.secret;
  const ip = incoming.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (ip) headers[CLIENT_IP_HEADER] = ip;
  return headers;
}

/** Removes what a browser might have sent itself, then adds the proxy's own headers. */
export function proxyRequestHeaders(incoming: Headers, identity: ProxyIdentity): Headers {
  const headers = new Headers(incoming);
  for (const name of [CLIENT_IP_HEADER, PROXY_SECRET_HEADER, SURFACE_HEADER]) headers.delete(name);
  for (const [name, value] of Object.entries(visitorHeaders(incoming, identity))) headers.set(name, value);
  return headers;
}
