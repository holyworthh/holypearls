import { adminContentListSchema, adminContentPageSchema, contentIndexSchema, publicContentPageSchema, sitemapSchema } from "@holypearls/contracts";
import { eq, schema } from "@holypearls/db";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, expectForbidden, expectHidden, signInActors, type Actors } from "../testing/actors.js";
import { createHarness, type Harness, TEST_WEB_ORIGIN } from "../testing/harness.js";

/*
 * T02-06 content pages (PUB-FR-011–013), written before the code.
 * Done when: an admin publishes a guide; script injection in rich text is
 * stripped; private pages can't be indexed; the sitemap lists only
 * published pages.
 */

let harness: Harness;
let actors: Partial<Actors>;
let staff: string;

const get = (path: string) => request(harness.url).get(path);
const staffCall = (method: "post" | "put" | "get", path: string, body?: object) => {
  const call = request(harness.url)[method](path).set("origin", TEST_WEB_ORIGIN).set("cookie", staff);
  return body ? call.send(body) : call;
};

beforeAll(async () => {
  harness = await createHarness();
  actors = await signInActors(harness, ["customerChidi", "catalogueNoMfa"]);
  staff = await harness.signInAs("adminAda");
});

afterAll(async () => {
  await harness?.close();
});

async function createGuide(slug: string, title = "How to fold a brochure") {
  const created = await staffCall("post", "/v1/admin/content", { type: "GUIDE", title, slug });
  expect(created.status).toBe(201);
  return adminContentPageSchema.parse(created.body);
}

async function save(page: { id: string; version: number; fields: object }, changes: object) {
  const response = await staffCall("put", `/v1/admin/content/${page.id}`, { ...page.fields, ...changes, version: page.version });
  if (response.status !== 200) throw new Error(`${response.status} ${JSON.stringify(response.body)}`);
  return adminContentPageSchema.parse(response.body);
}

const READY = { summary: "A short summary.", body: "<p>Practical words.</p>" };

async function publish(page: { id: string; version: number }) {
  const response = await staffCall("post", `/v1/admin/content/${page.id}/publish`, { version: page.version });
  if (response.status !== 200) throw new Error(`${response.status} ${JSON.stringify(response.body)}`);
  return adminContentPageSchema.parse(response.body);
}

describe("content editor (Pen 106)", () => {
  it("publishes a guide: drafts stay private, and later edits show only once published again", async () => {
    let guide = await createGuide("fold-a-brochure");
    expect(guide.status).toBe("DRAFT");
    guide = await save(guide, { summary: "Half, tri and gate folds.", body: "<h2>Pick a fold</h2><p>Tri-fold suits menus.</p>", data: { topic: "PRINT" } });
    expectHidden(await get("/v1/content/GUIDE/fold-a-brochure"));

    guide = await publish(guide);
    expect(guide.status).toBe("PUBLISHED");
    // Read back from the database: the stored snapshot's key order mustn't look like an edit.
    const reread = adminContentPageSchema.parse((await staffCall("get", `/v1/admin/content/${guide.id}`)).body);
    expect(reread.unpublishedChanges).toBe(false);
    const live = publicContentPageSchema.parse((await get("/v1/content/GUIDE/fold-a-brochure")).body);
    expect(live).toMatchObject({ title: "How to fold a brochure", href: "/resources/fold-a-brochure", summary: "Half, tri and gate folds." });
    expect(live.body).toContain("<h2");

    guide = await save(guide, { title: "Brochure folds, explained" });
    expect(guide.unpublishedChanges).toBe(true);
    expect(publicContentPageSchema.parse((await get("/v1/content/GUIDE/fold-a-brochure")).body).title).toBe("How to fold a brochure");
    await publish(guide);
    expect(publicContentPageSchema.parse((await get("/v1/content/GUIDE/fold-a-brochure")).body).title).toBe("Brochure folds, explained");
  });

  it("strips script injection from rich text on save and says what it removed", async () => {
    const guide = await createGuide("safe-text");
    const saved = await save(guide, {
      body: '<h2 onclick="steal()">Title</h2><p>Hi<script>alert(1)</script> <a href="javascript:alert(2)" onmouseover="x()">link</a> <a href="https://example.com/x">ok</a></p><iframe src="https://evil.test"></iframe><img src="x" onerror="alert(3)">',
    });
    expect(saved.fields.body).not.toMatch(/script|onclick|onmouseover|onerror|javascript:|iframe/i);
    expect(saved.fields.body).toContain("<h2>Title</h2>");
    expect(saved.fields.body).toContain('href="https://example.com/x"');
    // Links leaving the site open safely.
    expect(saved.fields.body).toContain('rel="noopener noreferrer"');
    expect(saved.sanitized).toEqual({ scripts: 1, handlers: 3, other: 3 });
    // A clean save clears the warning.
    const clean = await save(saved, { body: "<p>Fine</p>" });
    expect(clean.sanitized).toBeNull();
  });

  it("keeps only images from the media library, with alt text", async () => {
    const guide = await createGuide("images-only-ours");
    const saved = await save(guide, {
      body: '<figure><img src="https://tracker.test/pixel.png" alt="x"></figure><figure><img src="/api/v1/media/0190c5b3-0000-7000-8000-000000000001/preview" alt="Embroidered navy polo, left chest"><figcaption>Chest mark</figcaption></figure>',
    });
    expect(saved.fields.body).not.toContain("tracker.test");
    expect(saved.fields.body).toContain('alt="Embroidered navy polo, left chest"');
    expect(saved.fields.body).toContain("<figcaption>Chest mark</figcaption>");
  });

  it("checks each type's parts, and refuses an address already used by that type", async () => {
    const guide = await createGuide("typed-parts");
    const bad = await staffCall("put", `/v1/admin/content/${guide.id}`, { ...guide.fields, data: { topic: "NOT_A_TOPIC" }, version: guide.version });
    expect(bad.status).toBe(400);
    expect(bad.body.fieldErrors).toHaveProperty(["data.topic"]);
    const duplicate = await staffCall("post", "/v1/admin/content", { type: "GUIDE", title: "Again", slug: "typed-parts" });
    expect(duplicate.status).toBe(400);
    expect(duplicate.body.fieldErrors).toHaveProperty("slug");
    // Another type may use the same slug: it lives at a different address.
    expect((await staffCall("post", "/v1/admin/content", { type: "PROJECT", title: "Typed parts project", slug: "typed-parts" })).status).toBe(201);
  });

  it("won't publish a guide without a summary and text", async () => {
    const guide = await createGuide("empty-guide");
    const refused = await staffCall("post", `/v1/admin/content/${guide.id}/publish`, { version: guide.version });
    expect(refused.status).toBe(422);
    expect(Object.keys(refused.body.fieldErrors)).toEqual(["summary", "body"]);
  });

  it("refuses a stale version", async () => {
    const guide = await createGuide("stale-version");
    await save(guide, { summary: "first" });
    const stale = await staffCall("put", `/v1/admin/content/${guide.id}`, { ...guide.fields, summary: "second", version: guide.version });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe("VERSION_CONFLICT");
  });

  it("archiving takes a page off the site", async () => {
    const guide = await publish(await save(await createGuide("to-archive"), READY));
    const archived = await staffCall("post", `/v1/admin/content/${guide.id}/status`, { to: "ARCHIVED", version: guide.version });
    expect(archived.status).toBe(200);
    expectHidden(await get("/v1/content/GUIDE/to-archive"));
  });

  it("records publishing in the audit log", async () => {
    const guide = await publish(await save(await createGuide("audited-guide"), READY));
    const [entry] = await harness.database.db.select().from(schema.auditLog).where(eq(schema.auditLog.recordId, guide.id));
    expect(entry).toBeDefined();
  });
});

describe("content permissions (TECH-03 §17)", () => {
  it("is for CONTENT_MANAGE staff only: others get 403, customers and visitors 404", async () => {
    expectForbidden(await as(harness, actors.catalogueNoMfa!).get("/v1/admin/content"));
    expectHidden(await as(harness, actors.customerChidi!).get("/v1/admin/content"));
    expectHidden(await as(harness, "").get("/v1/admin/content"));
    expectHidden(await as(harness, actors.customerChidi!).post("/v1/admin/content", { type: "GUIDE", title: "x", slug: "x" }));
    const list = adminContentListSchema.parse((await staffCall("get", "/v1/admin/content?type=GUIDE")).body);
    expect(list.entries.every((entry) => entry.type === "GUIDE")).toBe(true);
  });
});

describe("public content (Pen 12, 54, 56, 59)", () => {
  it("lists only published pages of a type, lead items first", async () => {
    const projects = contentIndexSchema.parse((await get("/v1/content?type=PROJECT")).body);
    expect(projects.entries.length).toBe(9);
    expect(projects.entries.slice(0, 2).every((entry) => entry.featured)).toBe(true);
    expect(projects.entries[0]).toMatchObject({ href: expect.stringMatching(/^\/projects\//) });
    const work = contentIndexSchema.parse((await get("/v1/content?type=CASE_STUDY")).body);
    // Every seeded case study is labelled a demo until real work is approved (PUB-FR-012).
    expect(work.entries.every((entry) => entry.demo)).toBe(true);
  });

  it("returns a project page with its kit's published products", async () => {
    const page = publicContentPageSchema.parse((await get("/v1/content/PROJECT/event-branding")).body);
    expect(page.products.map((product) => product.slug)).toEqual(expect.arrayContaining(["polo-shirt", "roll-up-banner"]));
  });

  it("serves the About page", async () => {
    expect(publicContentPageSchema.parse((await get("/v1/content/ABOUT/about")).body).title).toMatch(/About/);
  });
});

describe("sitemap (PUB-SEO-009)", () => {
  it("lists only published, indexable public pages", async () => {
    const guide = await publish(await save(await createGuide("hidden-from-search"), READY));
    await save(guide, { indexable: false });
    await publish(adminContentPageSchema.parse((await staffCall("get", `/v1/admin/content/${guide.id}`)).body));
    await createGuide("never-published-guide");
    const paths = sitemapSchema.parse((await get("/v1/seo/sitemap")).body).entries.map((entry) => entry.path);
    expect(paths).toEqual(expect.arrayContaining(["/", "/products", "/products/polo-shirt", "/projects/event-branding", "/resources/embroidery-or-print", "/about"]));
    expect(paths).not.toContain("/resources/never-published-guide");
    expect(paths).not.toContain("/resources/hidden-from-search");
    expect(paths).not.toContain("/resources/to-archive");
    expect(paths.some((path) => /^\/(admin|account|search|configure|cart|checkout|help|l)(\/|$)/.test(path))).toBe(false);
  });
});
