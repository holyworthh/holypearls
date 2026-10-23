/*
 * Canonical and structured-data check over every public page (T14-01; Stage
 * 3 §53). Crawls the sitemap index of a running site and checks each page.
 *
 *   npx tsx apps/web/scripts/check-seo.ts https://staging.holypearls.example
 *
 * A second argument fetches from another address than the canonical one
 * (for a local build whose SITE_URL is the public domain).
 */
import { checkPage, locs } from "./seo-check";

const [site, fetchFrom = site] = process.argv.slice(2);
if (!site) {
  console.error("Usage: check-seo.ts <site URL> [fetch from URL]");
  process.exit(2);
}
const local = (url: string) => url.replace(site.replace(/\/$/, ""), fetchFrom!.replace(/\/$/, ""));
const text = async (url: string) => {
  const response = await fetch(local(url), { redirect: "manual" });
  if (response.status !== 200) throw new Error(`${url} answered ${response.status}`);
  return response.text();
};

const failures: string[] = [];
let pages = 0;
for (const sitemap of locs(await text(`${site.replace(/\/$/, "")}/sitemap.xml`))) {
  for (const url of locs(await text(sitemap))) {
    pages += 1;
    try {
      for (const error of checkPage(await text(url), url).errors) failures.push(`${url}: ${error}`);
    } catch (error) {
      failures.push(`${url}: ${(error as Error).message}`);
    }
  }
}
console.log(`${pages} pages checked, ${failures.length} problems`);
for (const failure of failures) console.log(`  ${failure}`);
process.exit(failures.length ? 1 : 0);
