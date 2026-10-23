import { loadWebEnv } from "@holypearls/config";
import {
  publicCategoryTreeSchema,
  publicHubSchema,
  publicProductPageSchema,
  publicProductSchema,
  storefrontNavigationSchema,
  type StorefrontNavigation,
} from "@holypearls/contracts";
import { PROXY_SECRET_HEADER } from "@holypearls/web-kit/visitor";
import type { z } from "zod";
import { WEB_IDENTITY } from "./visitor";

const env = loadWebEnv();

/**
 * Public catalogue reads from server components. No cookies are sent, so the
 * responses are the same for everyone and Next caches them under cache tags;
 * publishing in the admin refreshes those tags through /internal/revalidate
 * (TECH-02 §6). A 5-minute revalidate is the safety net if a refresh is missed.
 */
async function storefront<T extends z.ZodType>(path: string, schema: T, tags: string[]): Promise<z.output<T> | null> {
  try {
    const response = await fetch(`${env.API_URL}${path}`, {
      // The secret marks this as the site's own cached read, which the API doesn't count against one visitor's address.
      headers: { accept: "application/json", ...(WEB_IDENTITY.secret ? { [PROXY_SECRET_HEADER]: WEB_IDENTITY.secret } : {}) },
      next: { tags: ["catalogue", ...tags], revalidate: 300 },
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Catalogue request failed (${response.status})`);
    return schema.parse(await response.json());
  } catch (error) {
    // The build and cold starts must not fail when the API is asleep; pages show their error state.
    console.error("storefront fetch failed", path, (error as Error).message);
    throw error;
  }
}

const EMPTY_NAVIGATION: StorefrontNavigation = { categories: [], popular: [], mostOrdered: [], totalProducts: 0 };

/** Header, mega-menu, footer and homepage data. Falls back to an empty menu so the site chrome always renders. */
export async function getNavigation(): Promise<StorefrontNavigation> {
  return (await storefront("/v1/catalogue/navigation", storefrontNavigationSchema, ["navigation"]).catch(() => null)) ?? EMPTY_NAVIGATION;
}

export const getCategories = () => storefront("/v1/catalogue/categories", publicCategoryTreeSchema, []);

export function getProducts(params: URLSearchParams) {
  return storefront(`/v1/catalogue/products?${params}`, publicProductPageSchema, ["directory"]);
}

export function getHub(slug: string) {
  return storefront(`/v1/catalogue/hubs/${encodeURIComponent(slug)}`, publicHubSchema, [`category:${slug}`]);
}

export function getProduct(slug: string) {
  return storefront(`/v1/catalogue/products/${encodeURIComponent(slug)}`, publicProductSchema, [`product:${slug}`]);
}
