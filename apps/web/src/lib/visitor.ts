import { type ProxyIdentity, visitorHeaders as headersFor } from "@holypearls/web-kit/visitor";

/** The customer site's proxy identity (review P1-08, ADR-017): its own secret, shared only with the API. */
export const WEB_IDENTITY: ProxyIdentity = { surface: "web", secret: process.env.WEB_PROXY_SECRET };

export const visitorHeaders = (incoming: Headers) => headersFor(incoming, WEB_IDENTITY);
