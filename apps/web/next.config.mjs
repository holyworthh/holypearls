import { loadWebEnv } from "@holypearls/config";

const env = loadWebEnv();
const production = env.HP_ENV === "production";
const development = process.env.NODE_ENV === "development";

/**
 * Security headers on every page (TECH-06, review P2-07). Scripts may only come
 * from this site. Next.js and the motion boot script run inline, so inline
 * scripts are allowed until pages get per-request nonces (which make every page
 * dynamic; recorded in docs/reports/ENGINEERING-REVIEW-2026-10-01.md). Uploads
 * go straight to R2, so its endpoints may be called. Paystack's popup script and
 * checkout frame are allowed for payment (T04-03), and the frame may use the
 * Payment Request API for Apple Pay.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://js.paystack.co${development ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://paystack.com https://*.paystack.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' https://*.r2.cloudflarestorage.com https://api.paystack.co${development ? " ws: http://localhost:*" : ""}`,
  "frame-src https://checkout.paystack.com https://*.paystack.com",
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(production ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: 'camera=(), microphone=(), geolocation=(), payment=(self "https://checkout.paystack.com"), usb=(), interest-cohort=()' },
  ...(production ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
];

/** Pages a guest link opens never pass their address on (review P2-07). */
const GUEST_PAGES = ["/l", "/l/:path*", "/invitations", "/quotes/:path*", "/proofs/:path*", "/orders/:path*", "/configure/:path*", "/collections/:path*", "/help/:path*"];

export default {
  reactStrictMode: true,
  poweredByHeader: false,
  // packages/ui and packages/web-kit ship TypeScript and CSS Modules source.
  transpilePackages: ["@holypearls/ui", "@holypearls/web-kit"],
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      ...GUEST_PAGES.map((source) => ({ source, headers: [{ key: "Referrer-Policy", value: "no-referrer" }] })),
    ];
  },
  // TECH-02 §12: the browser calls /api/* on the web domain; Next forwards it to the API.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${env.API_URL}/:path*` }];
  },
};
