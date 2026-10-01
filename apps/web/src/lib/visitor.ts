/**
 * The visitor's address for the API's rate limits (review P1-08). Vercel
 * replaces any X-Forwarded-For a browser sends with the real address, so here
 * it can be trusted; the API can't trust it from anyone else, so the web app
 * passes it on in its own header with a secret both share (WEB_PROXY_SECRET).
 * Without the secret (locally) nothing is added and the API uses the address
 * that connected.
 */
export const CLIENT_IP_HEADER = "x-hp-client-ip";
export const PROXY_SECRET_HEADER = "x-hp-proxy-secret";

export function visitorHeaders(incoming: Headers): Record<string, string> {
  const secret = process.env.WEB_PROXY_SECRET;
  const ip = incoming.get("x-forwarded-for")?.split(",")[0]?.trim();
  return secret && ip ? { [CLIENT_IP_HEADER]: ip, [PROXY_SECRET_HEADER]: secret } : {};
}
