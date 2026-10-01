/**
 * The customer site's address (ADR-017): the admin lives on its own
 * subdomain, so links to public pages must name the public site.
 */
export const siteUrl = (path: string) => `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}${path}`;
