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

/** A content image as the worker leaves it: stored, checked, with a preview (and a thumbnail). */
async function makeImage(name: string, options: { status?: "READY" | "PROCESSING" | "REJECTED"; preview?: boolean } = {}) {
  const { status = "READY", preview = true } = options;
  const db = harness.database.db;
  const [file] = await db
    .insert(schema.files)
    .values({ purpose: "CONTENT_MEDIA", status, bucket: "public", originalName: name, safeName: name, declaredType: "image/webp", declaredSize: 4, storageKey: `files/source/${name}-${Date.now()}` })
    .returning();
  for (const kind of preview ? (["PREVIEW", "THUMBNAIL"] as const) : (["THUMBNAIL"] as const)) {
    const key = `files/preview/${file!.id}/${kind.toLowerCase()}-1.webp`;
    await harness.publicStorage.write(key, Buffer.from("RIFF"), "image/webp");
    await db.insert(schema.fileRenditions).values({ fileId: file!.id, kind, storageKey: key, contentType: "image/webp" });
  }
  return file!;
}

const figure = (id: string, alt = "A photo") => `<p>Words.</p><figure><img src="/api/v1/media/${id}/preview" alt="${alt}"></figure>`;
const mediaStatus = async (id: string) => (await get(`/v1/media/${id}/preview`)).status;

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
    const polo = await makeImage("polo.webp");
    const saved = await save(guide, {
      body: `<figure><img src="https://tracker.test/pixel.png" alt="x"></figure><figure><img src="/api/v1/media/${polo.id}/preview" alt="Embroidered navy polo, left chest"><figcaption>Chest mark</figcaption></figure>`,
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

describe("content images are public only while published (PR #30 review)", () => {
  it("keeps draft images private and shows exactly what the live copy uses", async () => {
    const first = await makeImage("first.webp");
    const second = await makeImage("second.webp");
    let guide = await save(await createGuide("private-images"), { ...READY, body: figure(first.id) });
    // A draft's image isn't public.
    expect(await mediaStatus(first.id)).toBe(404);

    guide = await publish(guide);
    const shown = await get(`/v1/media/${first.id}/preview`);
    expect(shown.status).toBe(200);
    // Content images can be unpublished, so they aren't cached for a year.
    expect(shown.headers["cache-control"]).not.toContain("immutable");

    // Added after publishing, not yet republished: still private.
    guide = await save(guide, { body: figure(second.id) });
    expect(await mediaStatus(second.id)).toBe(404);
    expect(await mediaStatus(first.id)).toBe(200);

    // Republished without the first image: it stops being public.
    guide = await publish(guide);
    expect(await mediaStatus(second.id)).toBe(200);
    expect(await mediaStatus(first.id)).toBe(404);

    // Unpublishing takes the images off the site.
    const unpublished = await staffCall("post", `/v1/admin/content/${guide.id}/status`, { to: "DRAFT", version: guide.version });
    expect(unpublished.status).toBe(200);
    expect(await mediaStatus(second.id)).toBe(404);
  });

  it("archiving a page makes its images private", async () => {
    const photo = await makeImage("archived.webp");
    const guide = await publish(await save(await createGuide("archived-images"), { ...READY, body: figure(photo.id) }));
    expect(await mediaStatus(photo.id)).toBe(200);
    expect((await staffCall("post", `/v1/admin/content/${guide.id}/status`, { to: "ARCHIVED", version: guide.version })).status).toBe(200);
    expect(await mediaStatus(photo.id)).toBe(404);
  });

  it("lets content staff preview draft images, privately; nobody else", async () => {
    const photo = await makeImage("preview.webp");
    await save(await createGuide("staff-preview"), { body: figure(photo.id) });
    const preview = await staffCall("get", `/v1/admin/content/media/${photo.id}/preview`);
    expect(preview.status).toBe(200);
    expect(preview.headers["cache-control"]).toBe("private, no-store");
    expectHidden(await as(harness, "").get(`/v1/admin/content/media/${photo.id}/preview`));
    expectHidden(await as(harness, actors.customerChidi!).get(`/v1/admin/content/media/${photo.id}/preview`));
    expectForbidden(await as(harness, actors.catalogueNoMfa!).get(`/v1/admin/content/media/${photo.id}/preview`));
  });
});

describe("publishing checks every image (PR #30 review)", () => {
  const refusal = async (slug: string, changes: object) => {
    const guide = await save(await createGuide(slug), { ...READY, ...changes });
    const response = await staffCall("post", `/v1/admin/content/${guide.id}/publish`, { version: guide.version });
    return response;
  };

  it("refuses an image in the text that doesn't exist, at save and publish", async () => {
    const guide = await createGuide("ghost-figure");
    const response = await staffCall("put", `/v1/admin/content/${guide.id}`, { ...guide.fields, ...READY, body: figure("0190c5b3-0000-7000-8000-00000000abcd"), version: guide.version });
    expect(response.status).toBe(400);
    expect(response.body.fieldErrors.body).toMatch(/no longer available/);
  });

  it("refuses a hero that is missing, still being checked or rejected", async () => {
    const processing = await makeImage("hero-processing.webp", { status: "PROCESSING" });
    let response = await refusal("hero-processing", { heroFileId: processing.id, heroAlt: "Team in polos" });
    expect(response.status).toBe(422);
    expect(response.body.fieldErrors.heroFileId).toMatch(/still being checked/);

    const rejected = await makeImage("hero-rejected.webp", { status: "REJECTED" });
    response = await refusal("hero-rejected", { heroFileId: rejected.id, heroAlt: "Team in polos" });
    expect(response.status).toBe(422);
    expect(response.body.fieldErrors.heroFileId).toMatch(/no longer available/);


    const gone = await createGuide("hero-missing");
    const missing = await staffCall("put", `/v1/admin/content/${gone.id}`, { ...gone.fields, heroFileId: "0190c5b3-0000-7000-8000-00000000abcf", heroAlt: "Gone", version: gone.version });
    expect(missing.status).toBe(400);
    expect(missing.body.fieldErrors.heroFileId).toMatch(/no longer available/);
  });

  it("refuses a figure without the preview it shows, or without alt text", async () => {
    const noPreview = await makeImage("no-preview.webp", { preview: false });
    let response = await refusal("figure-no-preview", { body: figure(noPreview.id) });
    expect(response.status).toBe(422);
    expect(response.body.fieldErrors.body).toMatch(/still being checked/);

    const fine = await makeImage("no-alt.webp");
    response = await refusal("figure-no-alt", { body: `<p>Words.</p><figure><img src="/api/v1/media/${fine.id}/preview" alt=""></figure>` });
    expect(response.status).toBe(422);
    expect(response.body.fieldErrors.body).toMatch(/alt text/);
  });

  it("refuses a gallery image that is missing or not ready, keyed to the item", async () => {
    const ready = await makeImage("gallery-ready.webp");
    const processing = await makeImage("gallery-processing.webp", { status: "PROCESSING" });
    const created = await staffCall("post", "/v1/admin/content", { type: "CASE_STUDY", title: "Gallery check", slug: "gallery-check" });
    let study = adminContentPageSchema.parse(created.body);
    study = await save(study, { ...READY, data: { gallery: [{ fileId: ready.id, alt: "Front" }, { fileId: processing.id, alt: "Back" }] } });
    const response = await staffCall("post", `/v1/admin/content/${study.id}/publish`, { version: study.version });
    expect(response.status).toBe(422);
    expect(Object.keys(response.body.fieldErrors)).toEqual(["data.gallery.1.fileId"]);

    const gone = await staffCall("put", `/v1/admin/content/${study.id}`, { ...study.fields, data: { gallery: [{ fileId: "0190c5b3-0000-7000-8000-00000000abce", alt: "Gone" }] }, version: study.version });
    expect(gone.status).toBe(400);
    expect(gone.body.fieldErrors).toHaveProperty(["data.gallery.0.fileId"]);
  });

  it("publishes when every image is ready, with its hero", async () => {
    const hero = await makeImage("hero-ready.webp");
    const photo = await makeImage("figure-ready.webp");
    const response = await refusal("all-images-ready", { heroFileId: hero.id, heroAlt: "Team in polos", body: figure(photo.id) });
    expect(response.status).toBe(200);
    expect(await mediaStatus(hero.id)).toBe(200);
    expect(await mediaStatus(photo.id)).toBe(200);
  });
});

describe("status changes can't overwrite newer state (PR #30 review)", () => {
  it("refuses stale unpublish, archive and restore requests and changes nothing", async () => {
    const live = await publish(await save(await createGuide("stale-status"), READY));
    // Someone else saves: the version moves on.
    const newer = await save(live, { summary: "Edited by someone else." });

    for (const to of ["DRAFT", "ARCHIVED"] as const) {
      const stale = await staffCall("post", `/v1/admin/content/${live.id}/status`, { to, version: live.version });
      expect(stale.status).toBe(409);
      expect(stale.body.code).toBe("VERSION_CONFLICT");
    }
    const unchanged = adminContentPageSchema.parse((await staffCall("get", `/v1/admin/content/${live.id}`)).body);
    expect(unchanged).toMatchObject({ status: "PUBLISHED", version: newer.version });

    const archived = adminContentPageSchema.parse((await staffCall("post", `/v1/admin/content/${live.id}/status`, { to: "ARCHIVED", version: newer.version })).body);
    const staleRestore = await staffCall("post", `/v1/admin/content/${live.id}/status`, { to: "DRAFT", version: newer.version });
    expect(staleRestore.status).toBe(409);
    const restored = await staffCall("post", `/v1/admin/content/${live.id}/status`, { to: "DRAFT", version: archived.version });
    expect(restored.status).toBe(200);
    expect(restored.body.status).toBe("DRAFT");
  });
});

describe("publication dates (PR #30 review)", () => {
  it("keeps the first publication date and moves the modified date on republish", async () => {
    const guide = await publish(await save(await createGuide("dated-guide"), READY));
    const first = publicContentPageSchema.parse((await get("/v1/content/GUIDE/dated-guide")).body);
    expect(first.publishedAt).toBe(first.updatedAt);

    await new Promise((done) => setTimeout(done, 20));
    await publish(await save(guide, { summary: "Updated summary." }));
    const second = publicContentPageSchema.parse((await get("/v1/content/GUIDE/dated-guide")).body);
    expect(second.publishedAt).toBe(first.publishedAt);
    expect(Date.parse(second.updatedAt)).toBeGreaterThan(Date.parse(first.updatedAt));

    const sitemap = sitemapSchema.parse((await get("/v1/seo/sitemap")).body);
    expect(sitemap.entries.find((entry) => entry.path === "/resources/dated-guide")?.updatedAt).toBe(second.updatedAt);
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

describe("staff preview of a draft on the customer site (owner, 2026-10-05)", () => {
  const link = async (id: string) => {
    const response = await staffCall("post", `/v1/admin/content/${id}/preview-link`);
    expect(response.status).toBe(200);
    return response.body as { url: string; expiresAt: string };
  };
  const tokenOf = (url: string) => new URL(url).pathname.split("/").pop()!;

  it("shows the unpublished draft through a signed, short-lived link, with its draft images", async () => {
    const photo = await makeImage("preview-photo.jpg");
    const guide = await save(await createGuide("preview-guide", "Preview me"), { ...READY, body: figure(photo.id, "A draft photo") });
    expectHidden(await get("/v1/content/GUIDE/preview-guide"));
    const { url, expiresAt } = await link(guide.id);
    expect(url.startsWith(`${TEST_WEB_ORIGIN}/preview/content/`)).toBe(true);
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());
    const token = tokenOf(url);
    const shown = await get(`/v1/content/preview/${token}`);
    expect(shown.status).toBe(200);
    expect(shown.headers["cache-control"]).toContain("no-store");
    const page = publicContentPageSchema.parse(shown.body);
    expect(page.title).toBe("Preview me");
    expect(page.seo.indexable).toBe(false);
    expect(page.body).toContain(`/api/v1/content/preview/${token}/media/${photo.id}/preview`);
    expect((await get(`/v1/content/preview/${token}/media/${photo.id}/preview`)).status).toBe(200);
    // Later edits show on the same link.
    await save(adminContentPageSchema.parse((await staffCall("get", `/v1/admin/content/${guide.id}`)).body), { title: "Preview me again" });
    expect(publicContentPageSchema.parse((await get(`/v1/content/preview/${token}`)).body).title).toBe("Preview me again");
  });

  it("refuses a changed, foreign or expired link, and images the page doesn't use", async () => {
    const other = await makeImage("not-on-page.jpg");
    const guide = await save(await createGuide("preview-guard"), READY);
    const token = tokenOf((await link(guide.id)).url);
    const [id, expires, signature] = token.split(".");
    expectHidden(await get(`/v1/content/preview/${id}.${Number(expires) + 1000}.${signature}`));
    expectHidden(await get(`/v1/content/preview/${id}.${expires}.${signature!.slice(0, -2)}xx`));
    expectHidden(await get(`/v1/content/preview/${token}/media/${other.id}/preview`));
    harness.now.value = new Date(Date.now() + 2 * 60 * 60 * 1000);
    try {
      expectHidden(await get(`/v1/content/preview/${token}`));
    } finally {
      harness.now.value = null;
    }
  });

  it("only content staff can make a preview link", async () => {
    const guide = await createGuide("preview-perm");
    expectHidden(await as(harness, "").post(`/v1/admin/content/${guide.id}/preview-link`, {}));
    expectHidden(await as(harness, actors.customerChidi!).post(`/v1/admin/content/${guide.id}/preview-link`, {}));
    expectForbidden(await as(harness, actors.catalogueNoMfa!).post(`/v1/admin/content/${guide.id}/preview-link`, {}));
  });
});
