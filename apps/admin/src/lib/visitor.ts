import type { ProxyIdentity } from "@holypearls/web-kit/visitor";

/** The admin's proxy identity (ADR-017): its own secret, shared only with the API, never the customer site's. */
export const ADMIN_IDENTITY: ProxyIdentity = { surface: "admin", secret: process.env.ADMIN_PROXY_SECRET };
