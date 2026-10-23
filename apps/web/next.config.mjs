import { loadWebEnv } from "@holypearls/config";

const env = loadWebEnv();
const production = env.HP_ENV === "production";

/**
 * Security headers on every response (TECH-06, review P2-07). The
 * Content-Security-Policy is set per page request in src/proxy.ts, with a nonce
 * for scripts (TECH-06 §9); it is not set here so /api responses don't get one.
 * Paystack's popup script and checkout frame are allowed for payment (T04-03),
 * and the frame may use the Payment Request API for Apple Pay.
 */

const securityHeaders = [
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
