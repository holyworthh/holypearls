import { searchPhraseListSchema, type SearchReport, searchResultsSchema, searchSuggestionsSchema, sitemapSchema } from "@holypearls/contracts";
import { desc, eq, schema, sql } from "@holypearls/db";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, expectForbidden, expectHidden, signInActors, type Actors } from "../testing/actors.js";
import { createHarness, type Harness, TEST_WEB_ORIGIN } from "../testing/harness.js";
import { CORRECTION, correct, refreshSearchIndex, removeExpiredSearchEvents, SEARCH_EVENT_RETENTION_DAYS } from "./search.js";

/*
 * T02-06 search (PUB-FR-006, 007, 016), written before the code.
 * Done when: "staff shirts" finds Polo; "polp" finds Polo; the no-result
 * page keeps the query; results pages are noindex (web test).
 */

let harness: Harness;
let actors: Partial<Actors>;
let staff: string;

const search = async (query: string) => {
  const response = await request(harness.url).get(`/v1/search?${query}`);
  if (response.status !== 200) throw new Error(`${response.status} ${JSON.stringify(response.body)}`);
  return searchResultsSchema.parse(response.body);
};
const staffPost = (path: string, body: object) => request(harness.url).post(path).set("origin", TEST_WEB_ORIGIN).set("cookie", staff).send(body);

beforeAll(async () => {
  harness = await createHarness();
  actors = await signInActors(harness, ["customerChidi", "catalogueNoMfa"]);
  staff = await harness.signInAs("adminAda");
  await refreshSearchIndex(harness.database.db);
});

afterAll(async () => {
  await harness?.close();
});

describe("search (PUB-FR-006, 007)", () => {
  it("finds Polo for the everyday words 'staff shirts'", async () => {
    const results = await search("q=staff%20shirts");
    expect(results.typed).toBeNull();
    expect(results.products.entries[0]?.slug).toBe("polo-shirt");
  });

  it("tolerates small spelling mistakes: 'polp' finds Polo", async () => {
    const results = await search("q=polp");
    expect(results.products.entries.map((product) => product.slug)).toContain("polo-shirt");
  });

  it("corrects a misspelt search and says so, and can search exactly what was typed", async () => {
    const corrected = await search("q=staf%20shrits");
    expect(corrected).toMatchObject({ q: "staff shirts", typed: "staf shrits" });
    expect(corrected.products.entries[0]?.slug).toBe("polo-shirt");
    const exact = await search("q=staf%20shrits&exact=1");
    expect(exact).toMatchObject({ q: "staf shrits", typed: null });
  });

  it("groups products, projects and guides, with counts per scope", async () => {
    const results = await search("q=embroidery");
    expect(results.counts.products).toBeGreaterThan(0);
    expect(results.counts.guides).toBeGreaterThan(0);
    expect(results.counts.all).toBe(results.counts.products + results.counts.projects + results.counts.guides);
    expect(results.guides.entries[0]?.href).toMatch(/^\/resources\//);
    // "All" shows a few of each; a scope shows only that type, paged.
    const guides = await search("q=embroidery&scope=guides");
    expect(guides.products.entries).toEqual([]);
    expect(guides.guides.entries.length).toBe(Math.min(guides.counts.guides, 12));
  });

  it("finds project pages", async () => {
    const results = await search("q=event%20branding");
    expect(results.projects.entries.map((entry) => entry.slug)).toContain("event-branding");
  });

  it("suggests categories to narrow a search", async () => {
    const results = await search("q=staff%20shirts");
    expect(results.narrow.categories[0]?.slug).toBe("apparel-garment-production");
  });

  it("never finds a draft", async () => {
    const [category] = await harness.database.db.select().from(schema.categories).where(eq(schema.categories.slug, "business-stationery"));
    await harness.database.db.insert(schema.products).values({
      sku: "HP-TST-QUILL",
      slug: "quillography-draft",
      name: "Quillography Poster",
      family: "PAPER_PRINT",
      buyingMode: "SIMPLE_CONFIGURABLE",
      categoryId: category!.id,
      status: "DRAFT",
    });
    await refreshSearchIndex(harness.database.db);
    expect((await search("q=quillography")).counts.all).toBe(0);
  });
});

describe("no results (PUB-FR-016, Pen 10)", () => {
  it("keeps the query, offers the closest things, and records the miss without personal details", async () => {
    const results = await search("q=embroidered%20glass%20cup");
    expect(results.counts.all).toBe(0);
    expect(results.q).toBe("embroidered glass cup");
    expect(results.closest?.product).not.toBeNull();

    await search(`q=${encodeURIComponent("call 08031234567 or ada@example.com about zzqv")}`);
    const [event] = await harness.database.db.select().from(schema.searchEvents).orderBy(desc(schema.searchEvents.createdAt)).limit(1);
    expect(event).toMatchObject({ kind: "NO_RESULTS" });
    expect(event!.query).not.toMatch(/08031234567|ada@example\.com/);
    expect(event!.query).toContain("zzqv");
  });

  it("records clicks on results", async () => {
    const response = await request(harness.url).post("/v1/search/clicks").set("origin", TEST_WEB_ORIGIN).send({ q: "polo", type: "PRODUCT", slug: "polo-shirt", position: 0 });
    expect(response.status).toBe(204);
    const [event] = await harness.database.db.select().from(schema.searchEvents).where(eq(schema.searchEvents.kind, "CLICK"));
    expect(event).toMatchObject({ query: "polo", targetSlug: "polo-shirt" });
  });
});

describe("typeahead (Pen 09)", () => {
  it("suggests guides as well as searches, categories and products", async () => {
    const response = await request(harness.url).get("/v1/catalogue/suggest?q=emb");
    const suggestions = searchSuggestionsSchema.parse(response.body);
    expect(suggestions.guides.length).toBeGreaterThan(0);
    expect(suggestions.guides[0]!.href).toMatch(/^\/resources\//);
  });
});

describe("everyday phrases staff add (PUB-FR-007)", () => {
  it("leads a staff phrase to its product in search and suggestions", async () => {
    const [mug] = await harness.database.db.select().from(schema.products).where(eq(schema.products.slug, "standard-mug"));
    const created = await staffPost("/v1/admin/search/phrases", { phrase: "souvenir", targetType: "PRODUCT", targetId: mug!.id });
    expect(created.status).toBe(201);
    await refreshSearchIndex(harness.database.db);
    expect((await search("q=souvenir")).products.entries[0]?.slug).toBe("standard-mug");
    const suggest = searchSuggestionsSchema.parse((await request(harness.url).get("/v1/catalogue/suggest?q=souv")).body);
    // A staff phrase goes straight to its target from the typeahead.
    expect(suggest.shortcuts).toContainEqual({ phrase: "souvenir", href: "/products/standard-mug", label: expect.any(String) });
    expect(suggest.searches).not.toContain("souvenir");
    const list = searchPhraseListSchema.parse((await request(harness.url).get("/v1/admin/search/phrases").set("cookie", staff)).body);
    expect(list.entries.find((entry) => entry.phrase === "souvenir")?.target).toMatchObject({ type: "PRODUCT", href: "/products/standard-mug", active: true, status: "PUBLISHED" });
  });

  it("refuses a phrase pointing at something that doesn't exist", async () => {
    const response = await staffPost("/v1/admin/search/phrases", { phrase: "ghost", targetType: "CATEGORY", targetId: "0190c5b3-0000-7000-8000-000000000009" });
    expect(response.status).toBe(400);
  });

  it("is for catalogue or content staff only", async () => {
    expectForbidden(await as(harness, actors.catalogueNoMfa!).post("/v1/admin/search/phrases", { phrase: "x", targetType: "PRODUCT", targetId: "0190c5b3-0000-7000-8000-000000000009" }));
    expectHidden(await as(harness, actors.customerChidi!).get("/v1/admin/search/phrases"));
    expectHidden(await as(harness, "").get("/v1/admin/search/report"));
  });
});

describe("phrases for targets that aren't public yet (PR #30 review)", () => {
  it("keeps a phrase for a draft inactive, then it works once the page is published and stops when unpublished", async () => {
    const created = await staffPost("/v1/admin/content", { type: "GUIDE", title: "Lanyard lengths", slug: "lanyard-lengths" });
    const page = created.body as { id: string; version: number; fields: Record<string, unknown> };
    const phrase = await staffPost("/v1/admin/search/phrases", { phrase: "neck strap", targetType: "PAGE", targetId: page.id });
    expect(phrase.status).toBe(201);
    expect(phrase.body.target).toMatchObject({ active: false, status: "DRAFT" });
    await refreshSearchIndex(harness.database.db);
    const suggest = async () => searchSuggestionsSchema.parse((await request(harness.url).get("/v1/catalogue/suggest?q=neck")).body);
    expect((await suggest()).shortcuts.map((item) => item.phrase)).not.toContain("neck strap");

    const saved = await request(harness.url)
      .put(`/v1/admin/content/${page.id}`)
      .set("origin", TEST_WEB_ORIGIN)
      .set("cookie", staff)
      .send({ ...page.fields, summary: "How long a lanyard should be.", body: "<p>Words.</p>", version: page.version });
    const published = await staffPost(`/v1/admin/content/${page.id}/publish`, { version: saved.body.version });
    expect(published.status).toBe(200);
    await refreshSearchIndex(harness.database.db);
    expect((await suggest()).shortcuts).toContainEqual({ phrase: "neck strap", href: "/resources/lanyard-lengths", label: "Lanyard lengths" });
    expect((await search("q=neck%20strap")).guides.entries[0]?.slug).toBe("lanyard-lengths");

    await staffPost(`/v1/admin/content/${page.id}/status`, { to: "DRAFT", version: published.body.version });
    await refreshSearchIndex(harness.database.db);
    expect((await suggest()).shortcuts.map((item) => item.phrase)).not.toContain("neck strap");
    const list = searchPhraseListSchema.parse((await request(harness.url).get("/v1/admin/search/phrases").set("cookie", staff)).body);
    expect(list.entries.find((entry) => entry.phrase === "neck strap")?.target).toMatchObject({ active: false, status: "DRAFT" });
  });

  it("lists many phrases with their targets", async () => {
    const products = await harness.database.db.select({ id: schema.products.id, slug: schema.products.slug }).from(schema.products).limit(12);
    // This checks the listing (one lookup per target type), so the rows go straight in.
    await harness.database.db.insert(schema.searchPhrases).values(products.map((product, index) => ({ phrase: `bulk phrase ${index}`, targetType: "PRODUCT" as const, targetId: product.id })));
    const list = searchPhraseListSchema.parse((await request(harness.url).get("/v1/admin/search/phrases").set("cookie", staff)).body);
    for (const [index, product] of products.entries()) {
      expect(list.entries.find((entry) => entry.phrase === `bulk phrase ${index}`)?.target.href).toBe(`/products/${product.slug}`);
    }
  });
});

describe("one destination per staff phrase (PR #30 re-review)", () => {
  it("refuses a phrase that already leads somewhere, whatever the target, case or spacing", async () => {
    const db = harness.database.db;
    const [polo, mug] = await db.select({ id: schema.products.id, slug: schema.products.slug }).from(schema.products).limit(2);
    const [category] = await db.select({ id: schema.categories.id }).from(schema.categories).limit(1);
    const [guide] = await db.select({ id: schema.contentPages.id }).from(schema.contentPages).where(eq(schema.contentPages.type, "GUIDE")).limit(1);
    const first = await staffPost("/v1/admin/search/phrases", { phrase: "company shirts", targetType: "PRODUCT", targetId: polo!.id });
    expect(first.status).toBe(201);

    const attempts = [
      { phrase: "company shirts", targetType: "PRODUCT", targetId: mug!.id },
      { phrase: "company shirts", targetType: "CATEGORY", targetId: category!.id },
      { phrase: "company shirts", targetType: "PAGE", targetId: guide!.id },
      { phrase: "Company Shirts", targetType: "PRODUCT", targetId: mug!.id },
      { phrase: " company shirts ", targetType: "PRODUCT", targetId: mug!.id },
      { phrase: "company   shirts", targetType: "PRODUCT", targetId: mug!.id },
      // The same destination again is still one phrase too many.
      { phrase: "COMPANY shirts", targetType: "PRODUCT", targetId: polo!.id },
    ];
    for (const attempt of attempts) {
      const refused = await staffPost("/v1/admin/search/phrases", attempt);
      expect(refused.status).toBe(400);
      expect(refused.body.fieldErrors.phrase).toMatch(/already has a destination/);
    }
    const list = searchPhraseListSchema.parse((await request(harness.url).get("/v1/admin/search/phrases").set("cookie", staff)).body);
    expect(list.entries.filter((entry) => entry.phrase === "company shirts")).toHaveLength(1);

    // Removing it frees the phrase for a new destination.
    const removed = await request(harness.url).delete(`/v1/admin/search/phrases/${first.body.id}`).set("origin", TEST_WEB_ORIGIN).set("cookie", staff);
    expect(removed.status).toBe(204);
    const again = await staffPost("/v1/admin/search/phrases", { phrase: "Company  Shirts", targetType: "PRODUCT", targetId: mug!.id });
    expect(again.status).toBe(201);
    expect(again.body).toMatchObject({ phrase: "company shirts", target: { href: `/products/${mug!.slug}` } });
  });

  it("stores one row per phrase even if two requests race", async () => {
    const db = harness.database.db;
    const [product] = await db.select({ id: schema.products.id }).from(schema.products).limit(1);
    const [category] = await db.select({ id: schema.categories.id }).from(schema.categories).limit(1);
    const results = await Promise.all([
      staffPost("/v1/admin/search/phrases", { phrase: "race phrase", targetType: "PRODUCT", targetId: product!.id }),
      staffPost("/v1/admin/search/phrases", { phrase: "Race Phrase", targetType: "CATEGORY", targetId: category!.id }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 400]);
    const rows = await db.select().from(schema.searchPhrases).where(sql`lower(${schema.searchPhrases.phrase}) = 'race phrase'`);
    expect(rows).toHaveLength(1);
  });
});

describe("spelling correction stays bounded (PR #30 review)", () => {
  it("leaves known words alone, fixes a one-letter slip, and gives up when nothing is close", async () => {
    const db = harness.database.db;
    expect(await correct(db, "polo")).toBeNull();
    expect(await correct(db, "polp")).toBe("polo");
    expect(await correct(db, "qwxzvbnm")).toBeNull();
  });

  it("looks up at most a few words of a long query", async () => {
    const started = Date.now();
    const result = await correct(harness.database.db, "polp mgu bnaner flyr stikcer xqzv plkq wwzz");
    expect(Date.now() - started).toBeLessThan(10_000);
    // Only the first CORRECTION.maxWords words are looked up; the rest are kept as typed.
    expect(result?.split(" ").slice(CORRECTION.maxWords)).toEqual(["stikcer", "xqzv", "plkq", "wwzz"]);
    expect(CORRECTION.maxWords).toBe(4);
  });
});

describe("search event retention (PR #30 review)", () => {
  it("removes raw events older than 90 days, keeps newer ones, and can run again", async () => {
    const db = harness.database.db;
    const now = new Date();
    const old = new Date(now.getTime() - (SEARCH_EVENT_RETENTION_DAYS + 1) * 86_400_000);
    const recent = new Date(now.getTime() - 5 * 86_400_000);
    const [oldRow] = await db.insert(schema.searchEvents).values({ kind: "SEARCH", query: "retention old", results: 1, createdAt: old }).returning();
    const [recentRow] = await db.insert(schema.searchEvents).values({ kind: "SEARCH", query: "retention recent", results: 1, createdAt: recent }).returning();
    const [oldSite] = await db.insert(schema.siteEvents).values({ kind: "CONTACT", createdAt: old }).returning();
    const [recentSite] = await db.insert(schema.siteEvents).values({ kind: "CONTACT", createdAt: recent }).returning();
    expect(await removeExpiredSearchEvents(db, now)).toBeGreaterThanOrEqual(2);
    expect(await db.select().from(schema.siteEvents).where(eq(schema.siteEvents.id, oldSite!.id))).toHaveLength(0);
    expect(await db.select().from(schema.siteEvents).where(eq(schema.siteEvents.id, recentSite!.id))).toHaveLength(1);
    expect(await db.select().from(schema.searchEvents).where(eq(schema.searchEvents.id, oldRow!.id))).toHaveLength(0);
    expect(await db.select().from(schema.searchEvents).where(eq(schema.searchEvents.id, recentRow!.id))).toHaveLength(1);
    expect(await removeExpiredSearchEvents(db, now)).toBe(0);
    const report = await request(harness.url).get("/v1/admin/search/report").set("cookie", staff);
    expect(report.status).toBe(200);
    expect(report.body.top.map((row: { query: string }) => row.query)).toContain("retention recent");
  });
});

describe("sitemap dates (PR #30 review)", () => {
  it("leaves static pages undated and dates indexes by what they list", async () => {
    const sitemap = sitemapSchema.parse((await request(harness.url).get("/v1/seo/sitemap")).body);
    const entry = (path: string) => sitemap.entries.find((item) => item.path === path);
    expect(entry("/")?.updatedAt).toBeNull();
    expect(entry("/contact")?.updatedAt).toBeNull();
    expect(entry("/products")?.updatedAt).not.toBeNull();
    const guides = sitemap.entries.filter((item) => item.path.startsWith("/resources/")).map((item) => item.updatedAt!);
    expect(entry("/resources")?.updatedAt).toBe(guides.sort().at(-1));
  });
});

describe("result order (T14-01b)", () => {
  it("an exact phrase outranks a closer title match", async () => {
    expect((await search("q=embroidery")).products.entries[0]?.slug).toBe("flat-embroidery");
  });
});

describe("where people go (PRD-01 §11, T14-01b)", () => {
  const report = async () => (await request(harness.url).get("/v1/admin/search/report").set("cookie", staff)).body as SearchReport;
  const post = (body: object) => request(harness.url).post("/v1/analytics/events").set("origin", TEST_WEB_ORIGIN).send(body);

  it("records where people go, without anything personal", async () => {
    const before = await harness.database.db.select().from(schema.siteEvents);
    expect((await post({ kind: "PRODUCT", fromGuide: true })).status).toBe(204);
    const after = await harness.database.db.select().from(schema.siteEvents);
    expect(after).toHaveLength(before.length + 1);
    expect(after.at(-1)).toMatchObject({ kind: "PRODUCT", fromGuide: true });
    expect((await post({ kind: "PRODUCT", fromGuide: false, path: "/x" })).status).toBe(400);
    expect((await post({ kind: "CONFIGURE", fromGuide: false })).status).toBe(400);
    // Like every POST: a foreign Origin is refused, and so is a missing one when a session cookie comes with it.
    const foreign = await request(harness.url).post("/v1/analytics/events").set("origin", "https://evil.example").send({ kind: "PRODUCT", fromGuide: false });
    expect(foreign.status).toBe(403);
    const noOrigin = await request(harness.url).post("/v1/analytics/events").set("cookie", staff).send({ kind: "PRODUCT", fromGuide: false });
    expect(noOrigin.status).toBe(403);
    expect(await harness.database.db.select().from(schema.siteEvents)).toHaveLength(after.length);
  });

  it("accepts the beacon from a visitor with no cookie at all", async () => {
    const response = await request(harness.url).post("/v1/analytics/events").set("origin", TEST_WEB_ORIGIN).send({ kind: "PRODUCT", fromGuide: false });
    expect(response.status).toBe(204);
  });

  it("counts a Configure entry when a design is first saved", async () => {
    const configure = async () => (await report()).entries.find((entry) => entry.kind === "CONFIGURE")!.total;
    const before = await configure();
    const created = await as(harness, actors.customerChidi!).post("/v1/configurations", { productSlug: "business-cards" });
    expect(created.status).toBe(201);
    // The event is written after the response, and the report is slow over a remote test database.
    await expect.poll(configure, { timeout: 30_000, interval: 500 }).toBe(before + 1);
  });

  it("entries count every kind, from guides separately", async () => {
    await post({ kind: "PROJECT", fromGuide: true });
    await post({ kind: "PROJECT", fromGuide: false });
    const { entries } = await report();
    expect(entries.map((entry) => entry.kind).sort()).toEqual(["CATEGORY", "CONFIGURE", "CONTACT", "PRODUCT", "PROJECT", "START_PROJECT"]);
    expect(entries.find((entry) => entry.kind === "PROJECT")).toMatchObject({ total: 2, fromGuides: 1 });
  });

  it("the zero-result report lists queries that found nothing, most frequent first, with when they were last searched", async () => {
    await search("q=zzqv%20alpha");
    await search("q=zzqv%20alpha");
    await search("q=zzqv%20beta");
    await search(`q=${encodeURIComponent("zzqv call 08031234567")}`);
    const { zeroResults } = await report();
    const alpha = zeroResults.findIndex((row) => row.query === "zzqv alpha");
    const beta = zeroResults.findIndex((row) => row.query === "zzqv beta");
    expect(zeroResults[alpha]).toMatchObject({ count: 2 });
    expect(alpha).toBeGreaterThanOrEqual(0);
    expect(alpha).toBeLessThan(beta);
    expect(new Date(zeroResults[alpha]!.lastSearchedAt).toISOString()).toBe(zeroResults[alpha]!.lastSearchedAt);
    expect(JSON.stringify(zeroResults)).not.toContain("08031234567");
  });

  it("the search report is for catalogue or content staff only", async () => {
    const finance = await signInActors(harness, ["financeFolake"]);
    expectForbidden(await as(harness, finance.financeFolake!).get("/v1/admin/search/report"));
    expectForbidden(await as(harness, actors.catalogueNoMfa!).get("/v1/admin/search/report"));
    expectHidden(await as(harness, actors.customerChidi!).get("/v1/admin/search/report"));
    expectHidden(await as(harness, "").get("/v1/admin/search/report"));
  });
});
