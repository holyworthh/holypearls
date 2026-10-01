import { loadAdminEnv } from "@holypearls/config";

const env = loadAdminEnv();
const production = env.HP_ENV === "production";
const development = process.env.NODE_ENV === "development";

/**
 * The staff admin (ADR-017): its own app on its own subdomain, never indexed,
 * never framed. Stricter than the customer site: no third-party scripts,
 * frames or forms. Inline scripts are allowed for Next.js until per-request
 * nonces (as on the customer site). Uploads go straight to R2.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' https://*.r2.cloudflarestorage.com${development ? " ws: http://localhost:*" : ""}`,
  "media-src 'self' blob:",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(production ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
  { key: "Cache-Control", value: "private, no-store" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  ...(production ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
];

export default {
  reactStrictMode: true,
  poweredByHeader: false,
  // packages/ui and packages/web-kit ship TypeScript and CSS Modules source.
  transpilePackages: ["@holypearls/ui", "@holypearls/web-kit"],
  // Links to public pages name the customer site (src/lib/site.ts).
  env: { NEXT_PUBLIC_SITE_URL: env.SITE_URL },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // The browser calls /api/* on the admin domain; Next forwards it to the API (TECH-02 §12, ADR-017).
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${env.API_URL}/:path*` }];
  },
};
