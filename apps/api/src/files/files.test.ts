import { fileUrlSchema, fileViewSchema, uploadCreatedSchema } from "@holypearls/contracts";
import { eq, schema } from "@holypearls/db";
import { Jobs } from "@holypearls/jobs";
import * as mupdf from "mupdf";
import sharp from "sharp";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, expectHidden, signInActors, type Actors } from "../testing/actors.js";
import { createHarness, type Harness } from "../testing/harness.js";
import { runDailyCleanup } from "../platform/cleanup.js";
import { detectType } from "./rules.js";
import { inspectFile, markFileNeedsReview } from "./files.js";
import { previewFile } from "./processing.js";

let harness: Harness;
let worker: Jobs;
let actors: Partial<Actors>;

let png: Buffer;
let pdf: Buffer;
const brokenPdf = Buffer.from("%PDF-1.7\n1 0 obj << /Type /Catalog >> this is not really a pdf\n%%EOF");
const textPretendingToBePng = Buffer.from("hello, this is plain text and not an image\n");

const until = async (check: () => Promise<boolean>, timeoutMs = 60_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error("Timed out waiting");
};

/** The whole browser flow: intent → PUT to the signed URL → complete → wait for the worker. */
async function upload(cookie: string, body: Buffer, meta: { fileName: string; contentType: string; purpose?: string; size?: number }) {
  const intent = await as(harness, cookie).post("/v1/files/uploads", {
    purpose: meta.purpose ?? "ARTWORK",
    fileName: meta.fileName,
    size: meta.size ?? body.length,
    contentType: meta.contentType,
  });
  if (intent.status !== 201) return { intent, file: null };
  const created = uploadCreatedSchema.parse(intent.body);
  // Local storage URLs go through the web app's /api; call the API directly.
  const path = new URL(created.uploadUrl).pathname.replace(/^\/api/, "");
  const put = await request(harness.url).put(path).set("content-type", meta.contentType).send(body);
  expect(put.status).toBe(200);
  const done = await as(harness, cookie).post(`/v1/files/${created.file.id}/complete`);
  expect(done.status).toBe(200);
  return { intent, file: fileViewSchema.parse(done.body) };
}

const status = async (cookie: string, id: string) => fileViewSchema.parse((await as(harness, cookie).get(`/v1/files/${id}`)).body);

beforeAll(async () => {
  png = await sharp({ create: { width: 2400, height: 1600, channels: 3, background: { r: 210, g: 49, b: 26 } } })
    .withMetadata({ exif: { IFD0: { Copyright: "secret-exif-marker" } } })
    .png()
    .toBuffer();
  const doc = new mupdf.PDFDocument();
  const page = doc.addPage([0, 0, 595, 842], 0, doc.addObject({}), "0 0 1 rg 50 50 200 200 re f");
  doc.insertPage(-1, page);
  pdf = Buffer.from(doc.saveToBuffer("").asUint8Array());

  harness = await createHarness();
  actors = await signInActors(harness, ["customerChidi", "customerAmaka", "adminAda"]);
  const files = { db: harness.database.db, jobs: harness.jobs, storage: harness.storage, publicStorage: harness.publicStorage };
  worker = new Jobs({ connectionString: harness.database.url, role: "worker" });
  await worker.start();
  await worker.work("file.inspect", (payload) => inspectFile({ ...files, jobs: worker }, payload.fileId, payload.requestId), {
    pollingIntervalSeconds: 0.5,
  });
  await worker.work("file.preview", (payload) => previewFile(files, payload.fileId), { pollingIntervalSeconds: 0.5 });
  await worker.workDeadLetters("file.preview", (payload) => markFileNeedsReview(harness.database.db, payload.fileId, "Needs review"));
});

afterAll(async () => {
  await worker?.stop(1000);
  await harness?.close();
});

describe("real type detection", () => {
  it("reads the first bytes, not the name or the claimed type", () => {
    expect(detectType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(detectType(Buffer.from("%PDF-1.4"))).toBe("application/pdf");
    expect(detectType(Buffer.from("name,size\nlogo,12\n"))).toBe("text/csv");
    expect(detectType(Buffer.from('<?xml version="1.0"?>\n<!-- logo -->\n<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBe("image/svg+xml");
    expect(detectType(Buffer.from("%PDF-1.6"), "Logo.AI")).toBe("application/illustrator");
    expect(detectType(Buffer.from("%!PS-Adobe-3.0"), "old.ai")).toBe("application/illustrator");
    expect(detectType(Buffer.from("%!PS-Adobe-3.0"), "old.eps")).toBeNull();
    expect(detectType(Buffer.from("<html><svg></svg></html>"))).toBeNull();
    // Plain text is never an image, whatever its name says.
    expect(detectType(textPretendingToBePng)).not.toBe("image/png");
    expect(detectType(Buffer.from([0x00, 0x01, 0x02, 0x03]))).toBeNull();
  });
});

describe("design files: SVG and Illustrator (docs/research/UPLOAD-FORMATS.md)", () => {
  const svg = Buffer.from(
    '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="120" height="60">' +
      '<script>alert(1)</script><image xlink:href="file:///etc/passwd" width="10" height="10"/>' +
      '<rect width="120" height="60" fill="#d2311a"/></svg>',
  );

  it("draws an SVG to a raster preview without running or fetching anything", async () => {
    const { file } = await upload(actors.customerChidi!, svg, { fileName: "logo.svg", contentType: "" });
    await until(async () => (await status(actors.customerChidi!, file!.id)).status === "READY");
    const ready = await status(actors.customerChidi!, file!.id);
    expect(ready).toMatchObject({ type: "image/svg+xml", hasThumbnail: true });
    const preview = fileUrlSchema.parse((await as(harness, actors.customerChidi!).get(`/v1/files/${file!.id}/preview?kind=preview`)).body);
    const image = await request(harness.url).get(new URL(preview.url).pathname.replace(/^\/api/, "")).buffer(true);
    const info = await sharp(image.body as Buffer).metadata();
    // 120 × 60 at 300 dpi.
    expect(info).toMatchObject({ format: "webp", width: 500, height: 250 });

    // The original is only ever a download, so its script can't run on our domain.
    const original = fileUrlSchema.parse((await as(harness, actors.customerChidi!).get(`/v1/files/${file!.id}/download`)).body);
    const got = await request(harness.url).get(new URL(original.url).pathname.replace(/^\/api/, ""));
    expect(got.headers["content-disposition"]).toMatch(/^attachment/);
  });

  it("previews a PDF-compatible Illustrator file and explains an old one it can't show", async () => {
    const { file } = await upload(actors.customerChidi!, pdf, { fileName: "Logo.ai", contentType: "application/postscript" });
    await until(async () => (await status(actors.customerChidi!, file!.id)).status === "READY");
    expect(await status(actors.customerChidi!, file!.id)).toMatchObject({ type: "application/illustrator", hasThumbnail: true });

    const legacy = Buffer.from("%!PS-Adobe-3.0\n%%Creator: Adobe Illustrator(R) 8.0\n%%EOF\n");
    const old = await upload(actors.customerChidi!, legacy, { fileName: "old.ai", contentType: "application/illustrator" });
    await until(async () => (await status(actors.customerChidi!, old.file!.id)).status === "NEEDS_REVIEW");
    expect((await status(actors.customerChidi!, old.file!.id)).reason).toContain("Create PDF Compatible File");
  });
});

describe("uploads (TECH-04 §3–4)", () => {
  it("uploads an image, strips its metadata and makes a preview and thumbnail", async () => {
    const { file } = await upload(actors.customerChidi!, png, { fileName: "Logo (final).png", contentType: "image/png" });
    expect(file!.status).toBe("PROCESSING");
    await until(async () => (await status(actors.customerChidi!, file!.id)).status === "READY");
    const ready = await status(actors.customerChidi!, file!.id);
    expect(ready).toMatchObject({ name: "Logo _final_.png", type: "image/png", hasThumbnail: true, metadata: { width: 2400, height: 1600 } });

    const preview = fileUrlSchema.parse((await as(harness, actors.customerChidi!).get(`/v1/files/${file!.id}/preview?kind=preview`)).body);
    const image = await request(harness.url).get(new URL(preview.url).pathname.replace(/^\/api/, "")).buffer(true);
    const info = await sharp(image.body as Buffer).metadata();
    expect(Math.max(info.width!, info.height!)).toBe(2000);
    expect(info.exif).toBeUndefined();
    expect((image.body as Buffer).toString("latin1")).not.toContain("secret-exif-marker");
  });

  it("rejects a file whose real type is wrong, with a reason a customer understands", async () => {
    const { file } = await upload(actors.customerChidi!, textPretendingToBePng, { fileName: "logo.png", contentType: "image/png" });
    await until(async () => (await status(actors.customerChidi!, file!.id)).status === "REJECTED");
    expect((await status(actors.customerChidi!, file!.id)).reason).toContain("Upload PDF, AI, SVG, PNG or JPEG");
  });

  it("refuses oversize and disallowed types before signing anything", async () => {
    const tooBig = await as(harness, actors.customerChidi!).post("/v1/files/uploads", {
      purpose: "PROBLEM_PHOTO",
      fileName: "photo.jpg",
      size: 16 * 1024 * 1024,
      contentType: "image/jpeg",
    });
    expect(tooBig.status).toBe(400);
    expect(tooBig.body.fieldErrors.file).toBe("This file is too big. Upload JPEG or PNG, up to 15 MB.");
    expect(tooBig.body).not.toHaveProperty("uploadUrl");

    const eps = await as(harness, actors.customerChidi!).post("/v1/files/uploads", {
      purpose: "ARTWORK",
      fileName: "logo.eps",
      size: 100,
      contentType: "application/postscript",
    });
    expect(eps.status).toBe(400);
    expect(eps.body.context).toEqual({ reason: "TYPE_NOT_ALLOWED" });
    const rows = await harness.database.db.select().from(schema.files).where(eq(schema.files.originalName, "logo.eps"));
    expect(rows).toHaveLength(0);
  });

  it("won't accept more bytes than were signed", async () => {
    const intent = uploadCreatedSchema.parse(
      (await as(harness, actors.customerChidi!).post("/v1/files/uploads", { purpose: "ARTWORK", fileName: "x.png", size: 10, contentType: "image/png" }))
        .body,
    );
    const put = await request(harness.url).put(new URL(intent.uploadUrl).pathname.replace(/^\/api/, "")).send(png);
    expect(put.status).toBe(413);
  });

  it("needs a sign-in or guest session, and staff purposes need their permission", async () => {
    expect((await as(harness, "").post("/v1/files/uploads", { purpose: "ARTWORK", fileName: "a.png", size: 10, contentType: "image/png" })).status).toBe(401);
    expectHidden(
      await as(harness, actors.customerChidi!).post("/v1/files/uploads", { purpose: "PROOF", fileName: "p.pdf", size: 10, contentType: "application/pdf" }),
    );
    // Tunde is STAFF_ADMIN only, without CATALOGUE_MANAGE.
    const tunde = await harness.signInAs("adminTunde");
    const staff = await as(harness, tunde).post("/v1/files/uploads", { purpose: "PRODUCT_MEDIA", fileName: "m.png", size: 10, contentType: "image/png" });
    expect(staff.status).toBe(403);
  });
});

describe("downloads and ownership (TECH-04 §6–7)", () => {
  it("gives the owner a 5-minute URL and hides the file from everyone else", async () => {
    const { file } = await upload(actors.customerChidi!, png, { fileName: "mine.png", contentType: "image/png" });
    await until(async () => (await status(actors.customerChidi!, file!.id)).status === "READY");
    const link = fileUrlSchema.parse((await as(harness, actors.customerChidi!).get(`/v1/files/${file!.id}/download`)).body);
    expect(link.expiresInSeconds).toBe(300);
    expect(harness.logs.join("\n")).not.toContain(new URL(link.url).pathname);

    expectHidden(await as(harness, actors.customerAmaka!).get(`/v1/files/${file!.id}/download`));
    expectHidden(await as(harness, actors.customerAmaka!).get(`/v1/files/${file!.id}`));
    expectHidden(await as(harness, "").get(`/v1/files/${file!.id}/download`));

    // A forged or altered storage URL is refused.
    const tampered = new URL(link.url).pathname.replace(/^\/api/, "").slice(0, -3) + "abc";
    expect((await request(harness.url).get(tampered)).status).toBe(403);
  });
});

describe("PDF previews (TECH-04 §5)", () => {
  it("renders the first page in an isolated process", async () => {
    const { file } = await upload(actors.customerChidi!, pdf, { fileName: "artwork.pdf", contentType: "application/pdf" });
    await until(async () => (await status(actors.customerChidi!, file!.id)).status === "READY");
    const ready = await status(actors.customerChidi!, file!.id);
    expect(ready).toMatchObject({ pages: 1, hasThumbnail: true, metadata: { pages: 1 } });
  });

  it("marks a broken PDF NEEDS_REVIEW instead of crashing", async () => {
    const { file } = await upload(actors.customerChidi!, brokenPdf, { fileName: "broken.pdf", contentType: "application/pdf" });
    await until(async () => (await status(actors.customerChidi!, file!.id)).status === "NEEDS_REVIEW");
    expect((await status(actors.customerChidi!, file!.id)).reason).toContain("couldn't open this PDF");
  });
});

describe("daily clean-up (TECH-04 §13)", () => {
  it("removes only unattached files older than 7 days", async () => {
    const db = harness.database.db;
    const insert = async (name: string, ageDays: number, attached: boolean) => {
      const [row] = await db
        .insert(schema.files)
        .values({
          purpose: "ARTWORK",
          originalName: name,
          safeName: name,
          declaredType: "image/png",
          declaredSize: 10,
          storageKey: `uploads/pending/cleanup-${name}`,
          ownerType: attached ? "HELP_REQUEST" : null,
          ownerId: attached ? "0190a0e0-0000-7000-8000-000000000001" : null,
          createdAt: new Date(Date.now() - ageDays * 86_400_000),
        })
        .returning();
      await harness.storage.write(row!.storageKey, Buffer.from("x"));
      return row!;
    };
    const old = await insert("old-unattached", 8, false);
    const young = await insert("young-unattached", 6, false);
    const attached = await insert("old-attached", 30, true);

    await runDailyCleanup({ db, storage: harness.storage, publicStorage: harness.publicStorage });
    const remaining = new Set((await db.select({ id: schema.files.id }).from(schema.files)).map((row) => row.id));
    expect(remaining.has(old.id)).toBe(false);
    expect(remaining.has(young.id)).toBe(true);
    expect(remaining.has(attached.id)).toBe(true);
    expect(await harness.storage.head(old.storageKey)).toBeNull();
    expect(await harness.storage.head(attached.storageKey)).not.toBeNull();
  });
});
