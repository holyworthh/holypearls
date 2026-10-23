/*
 * The Content-Security-Policy of both front ends (TECH-06 §9): scripts run only
 * with this request's nonce, never `unsafe-inline` or (outside development)
 * `unsafe-eval`. Each page request gets its own nonce from the app's proxy.ts,
 * which also makes every page render per request.
 */

export const newNonce = () => btoa(crypto.randomUUID());

export function contentSecurityPolicy(options: { nonce: string; surface: "web" | "admin"; development: boolean; production: boolean }): string {
  const { nonce, surface, development, production } = options;
  const web = surface === "web";
  // 'strict-dynamic' lets the nonced bundle load its own chunks; 'self' and the hosts are for browsers that ignore it.
  const scriptSrc = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(web ? ["https://js.paystack.co"] : []), ...(development ? ["'unsafe-eval'"] : [])];
  // Uploads go straight to R2. Public media is served from this site's own /api/v1/media.
  const connectSrc = ["'self'", "https://*.r2.cloudflarestorage.com", ...(web ? ["https://api.paystack.co"] : []), ...(development ? ["ws:", "http://localhost:*"] : [])];
  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    `style-src 'self' 'unsafe-inline'${web ? " https://paystack.com https://*.paystack.com" : ""}`,
    "img-src 'self' data: blob: https://*.r2.cloudflarestorage.com",
    "font-src 'self' data:",
    `connect-src ${connectSrc.join(" ")}`,
    `frame-src ${web ? "https://checkout.paystack.com https://*.paystack.com" : "'none'"}`,
    `media-src 'self'${web ? "" : " blob:"}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(production ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}
