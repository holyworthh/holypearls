import { searchResultsSchema } from "@holypearls/contracts";
import { launchCatalogueSeedStep, runSeed } from "@holypearls/testkit";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "../testing/harness.js";
import { phraseCoverage, refreshSearchIndex } from "./search.js";

/*
 * T14-01b: search tuned on the full Stage 1.4 launch catalogue (304 products).
 * "First result" means the first entry of the expected type's group, because
 * results are grouped by type (PUB-FR-006). The list is a draft the owner confirms.
 */

let harness: Harness;

beforeAll(async () => {
  harness = await createHarness();
  await runSeed(harness.database.db, [launchCatalogueSeedStep]);
  await refreshSearchIndex(harness.database.db);
});

afterAll(async () => {
  await harness?.close();
});

type Group = "PRODUCT" | "PROJECT" | "GUIDE";
const TOP_QUERIES: [query: string, group: Group, slug: string][] = [
  ["polo shirt", "PRODUCT", "polo-shirt"],
  ["business cards", "PRODUCT", "business-cards"],
  ["roll up banner", "PRODUCT", "roll-up-banner"],
  ["flyers", "PRODUCT", "flyers"],
  ["letterhead", "PRODUCT", "letterheads"],
  ["apron", "PRODUCT", "apron"],
  ["scrubs", "PRODUCT", "scrubs"],
  ["chef jacket", "PRODUCT", "chef-jacket"],
  ["agbada", "PRODUCT", "agbada"],
  ["kaftan", "PRODUCT", "kaftan"],
  ["flex banner", "PRODUCT", "flex-banner"],
  ["backdrop", "PRODUCT", "backdrop-banner"],
  ["notebook", "PRODUCT", "notebook"],
  ["water bottle", "PRODUCT", "water-bottle"],
  ["umbrella", "PRODUCT", "umbrella"],
  ["screen printing", "PRODUCT", "screen-printing"],
  ["envelopes", "PRODUCT", "envelopes"],
  ["wedding invitation", "PRODUCT", "wedding-invitations"],
  ["polo", "PRODUCT", "polo-shirt"],
  ["business card", "PRODUCT", "business-cards"],
  ["t-shirt", "PRODUCT", "crew-neck-t-shirt"],
  ["hoodie", "PRODUCT", "pullover-hoodie"],
  ["mug", "PRODUCT", "standard-mug"],
  ["stickers", "PRODUCT", "label-sticker"],
  ["paper bag", "PRODUCT", "small-paper-bag"],
  ["canvas", "PRODUCT", "landscape-canvas"],
  ["cap", "PRODUCT", "baseball-cap"],
  ["id card", "PRODUCT", "portrait-id-cards"],
  ["calendar", "PRODUCT", "wall-calendars"],
  ["brochure", "PRODUCT", "brochures"],
  ["jersey", "PRODUCT", "football-jersey"],
  ["embroidery", "PRODUCT", "flat-embroidery"],
  ["posters", "PRODUCT", "a3-posters"],
  ["labels", "PRODUCT", "product-label"],
  ["lanyard", "PRODUCT", "event-badges"],
  ["name tag", "PRODUCT", "event-badges"],
  ["company shirts", "PRODUCT", "polo-shirt"],
  ["staff uniform", "PRODUCT", "polo-shirt"],
  ["souvenir", "PRODUCT", "standard-mug"],
  ["banner", "PRODUCT", "roll-up-banner"],
  ["staff shirts", "PRODUCT", "polo-shirt"],
  ["visiting cards", "PRODUCT", "business-cards"],
  ["event branding", "PROJECT", "event-branding"],
  ["school uniform", "PROJECT", "school-uniform-programme"],
  ["corporate gifts", "PROJECT", "corporate-gifts"],
  ["paper stock", "GUIDE", "choosing-paper-stock"],
  ["flyer sizes", "GUIDE", "flyer-sizes-explained"],
  ["polp", "PRODUCT", "polo-shirt"],
  ["busines cards", "PRODUCT", "business-cards"],
  ["embriodery", "PRODUCT", "flat-embroidery"],
];

describe("search quality on the launch catalogue (T14-01b)", () => {
  it("agreed top 50 queries return the expected first result (T14-01b Done when)", async () => {
    expect(TOP_QUERIES).toHaveLength(50);
    const failures: string[] = [];
    for (const [query, group, slug] of TOP_QUERIES) {
      const response = await request(harness.url).get(`/v1/search?q=${encodeURIComponent(query)}`);
      const results = searchResultsSchema.parse(response.body);
      const entries = { PRODUCT: results.products, PROJECT: results.projects, GUIDE: results.guides }[group].entries;
      const got = entries[0]?.slug;
      if (got !== slug) failures.push(`${query} → got ${got}, expected ${slug}`);
    }
    expect(failures).toEqual([]);
  }, 300_000);

  it("phrase coverage shows the polo's phrases leading and flags a phrase two products share", async () => {
    const coverage = await phraseCoverage(harness.database.db);
    expect(coverage.total).toBeGreaterThan(300);
    const missed = coverage.misses.map((miss) => miss.phrase);
    expect(missed).not.toContain("staff shirts");
    expect(missed).toContain("tote bag");
  }, 120_000);
});
