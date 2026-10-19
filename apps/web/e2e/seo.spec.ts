import { expect, test } from "@playwright/test";
import { checkPage, locs, validateStructuredData } from "../scripts/seo-check";

/*
 * T14-01: every page in the sitemap has a self-referencing canonical, stays
 * indexable, and its structured data passes the validator for its type
 * (Done when: validator passes for every template). Desktop only: the
 * markup is the same at every width.
 */

test("every sitemap page: canonical, indexable, valid structured data for every template", async ({ request, baseURL }, info) => {
  test.skip(info.project.name !== "desktop-1440", "Markup doesn't depend on the viewport");
  test.setTimeout(300_000);
  const index = await (await request.get("/sitemap.xml")).text();
  const site = new URL(locs(index)[0]!).origin;
  const local = (url: string) => url.replace(site, baseURL!);
  const failures: string[] = [];
  const types = new Set<string>();
  for (const sitemap of locs(index)) {
    for (const url of locs(await (await request.get(local(sitemap))).text())) {
      const response = await request.get(local(url));
      if (response.status() !== 200) {
        failures.push(`${url}: ${response.status()}`);
        continue;
      }
      const result = checkPage(await response.text(), url);
      result.types.forEach((type) => types.add(type));
      failures.push(...result.errors.map((error) => `${url}: ${error}`));
    }
  }
  expect(failures).toEqual([]);
  // Every template's type appeared at least once (Stage 3 §48).
  expect([...types].sort()).toEqual(expect.arrayContaining(["Article", "BreadcrumbList", "CollectionPage", "Organization", "Product", "ProductGroup", "WebSite"]));
});

test("the validator catches what templates must never publish", async () => {
  test.skip(test.info().project.name !== "desktop-1440", "No browser needed");
  const ctx = "https://schema.org";
  expect(validateStructuredData([{ "@context": ctx, "@type": "Product", name: "Polo", offers: { "@type": "Offer", price: "0.00", priceCurrency: "NGN", availability: "https://schema.org/InStock" } }])).toEqual(["#1: Offer needs a price above zero"]);
  expect(validateStructuredData([{ "@context": ctx, "@type": "FAQPage" }])).toEqual(["#1: unexpected type FAQPage"]);
  expect(validateStructuredData([{ "@context": ctx, "@type": "ProductGroup", name: "Polo", productGroupID: "polo", variesBy: ["color"], hasVariant: [] }])).toEqual([
    "#1: variesBy must list schema.org properties",
    "#1: ProductGroup needs hasVariant",
  ]);
  expect(validateStructuredData([{ "@context": ctx, "@type": "BreadcrumbList", itemListElement: [{ position: 1, name: "Home" }, { position: 2, name: "Polo" }] }])).toEqual(["#1: breadcrumb 1 needs an absolute item URL"]);
});

test("a product with colour and size choices is one ProductGroup with its variants; a quoted product has no Offer", async ({ request }, info) => {
  test.skip(info.project.name !== "desktop-1440", "Markup doesn't depend on the viewport");
  const html = await (await request.get("/products/polo-shirt")).text();
  const group = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)].flatMap((match) => [JSON.parse(match[1]!)].flat()).find((node) => node["@type"] === "ProductGroup");
  expect(group).toMatchObject({ productGroupID: "polo-shirt", variesBy: expect.arrayContaining(["https://schema.org/color"]) });
  expect(group.hasVariant.length).toBeGreaterThan(1);
  expect(group.hasVariant[0]).not.toHaveProperty("offers");
  expect(await (await request.get("/products/team-staff-branding")).text()).not.toContain('"@type":"Offer"');
});
