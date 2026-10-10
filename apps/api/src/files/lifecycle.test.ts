import { and, eq, schema } from "@holypearls/db";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { insertConfigurationCopy } from "../configuration/copies.js";
import { as, signInActors, type Actors } from "../testing/actors.js";
import { createHarness, type Harness } from "../testing/harness.js";
import { inspectFile, removeUnattachedFiles } from "./files.js";
import { previewFile } from "./processing.js";

let h: Harness;
let actors: Partial<Actors>;
const bytes = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" fill="blue"/></svg>');
const db = () => h.database.db;
const deps = () => ({ db: db(), jobs: h.jobs, storage: h.storage, publicStorage: h.publicStorage });

async function upload(cookie = actors.customerChidi!, purpose = "ARTWORK") {
  const response = await as(h, cookie).post("/v1/files/uploads", { purpose, fileName: "logo.svg", size: bytes.length, contentType: "image/svg+xml" });
  expect(response.status).toBe(201);
  const created = response.body;
  const path = new URL(created.uploadUrl).pathname.replace(/^\/api/, "");
  const put = () => request(h.url).put(path).set({ "content-type": "image/svg+xml", ...created.uploadHeaders }).send(bytes);
  expect((await put()).status).toBe(200);
  expect((await as(h, cookie).post(`/v1/files/${created.file.id}/complete`)).status).toBe(200);
  await inspectFile(deps(), created.file.id, "lifecycle-test");
  await previewFile(deps(), created.file.id);
  const [file] = await db().select().from(schema.files).where(eq(schema.files.id, created.file.id));
  expect(file!.status).toBe("READY");
  return { file: file!, path, headers: created.uploadHeaders ?? {} };
}

async function draftWithFile(fileId: string) {
  const created = await as(h, actors.customerChidi!).post("/v1/configurations", { productSlug: "business-cards", choices: { paper: "350gsm-matte", sides: "both-sides" } });
  expect(created.status).toBe(201);
  expect((await as(h, actors.customerChidi!).post(`/v1/configurations/${created.body.id}/files`, { fileId, role: "ARTWORK" })).status).toBe(201);
  const [draft] = await db().select().from(schema.configurations).where(eq(schema.configurations.id, created.body.id));
  return draft!;
}

beforeAll(async () => {
  h = await createHarness();
  actors = await signInActors(h, ["customerChidi", "customerAmaka", "acmeAdmin"]);
});
afterAll(async () => { await h?.close(); });

describe("retained and checked files", () => {
  it("cannot replay a signed PUT after checking, even with the same declared size", async () => {
    const { file, path, headers } = await upload();
    const original = await h.storage.read(file.storageKey);
    const replay = await request(h.url).put(path).set({ "content-type": "image/svg+xml", ...headers }).send(Buffer.alloc(bytes.length, 88));
    expect(replay.status).toBe(412);
    expect(await h.storage.read(file.storageKey)).toEqual(original);
    expect((await as(h, actors.customerChidi!).get(`/v1/files/${file.id}`)).body.status).toBe("READY");
  });

  it("accepts exactly one of two concurrent writes to an upload key", async () => {
    const created = await as(h, actors.customerChidi!).post("/v1/files/uploads", { purpose: "ARTWORK", fileName: "logo.svg", size: bytes.length, contentType: "image/svg+xml" });
    const path = new URL(created.body.uploadUrl).pathname.replace(/^\/api/, "");
    const results = await Promise.all([bytes, Buffer.alloc(bytes.length, 88)].map(body => request(h.url).put(path).set({ "content-type": "image/svg+xml", ...created.body.uploadHeaders }).send(body)));
    expect(results.map(r => r.status).sort()).toEqual([200, 412]);
  });

  it("keeps original artwork and renditions when a copy removes its link", async () => {
    const { file } = await upload();
    const original = await draftWithFile(file.id);
    const copyId = await db().transaction(tx => insertConfigurationCopy(tx, original, { ownerUserId: original.ownerUserId, ownerDeviceHash: original.ownerDeviceHash, customerId: original.customerId }));
    const [link] = await db().select().from(schema.configurationFiles).where(eq(schema.configurationFiles.configurationId, copyId));
    const renditions = await db().select().from(schema.fileRenditions).where(eq(schema.fileRenditions.fileId, file.id));
    expect((await as(h, actors.customerChidi!).delete(`/v1/configurations/${copyId}/files/${link!.id}`)).status).toBe(200);
    await db().update(schema.files).set({ createdAt: new Date(Date.now() - 8 * 86_400_000) }).where(eq(schema.files.id, file.id));
    await expect(removeUnattachedFiles(deps(), new Date())).resolves.toBe(0);
    expect(await h.storage.head(file.storageKey)).not.toBeNull();
    for (const rendition of renditions) expect(await h.storage.head(rendition.storageKey)).not.toBeNull();
    expect((await as(h, actors.customerChidi!).get(`/v1/files/${file.id}/download`)).status).toBe(200);
  });

  it("refuses cleanup of a referenced file even if its owner metadata is missing", async () => {
    const { file } = await upload();
    await draftWithFile(file.id);
    await db().update(schema.files).set({ ownerType: null, ownerId: null, createdAt: new Date(Date.now() - 8 * 86_400_000) }).where(eq(schema.files.id, file.id));
    await expect(removeUnattachedFiles(deps(), new Date())).resolves.toBe(0);
    expect(await h.storage.head(file.storageKey)).not.toBeNull();
  });

  it("does not let a deactivated brand-asset uploader bypass its record policy", async () => {
    const { file } = await upload(actors.acmeAdmin!, "BRAND_ASSET");
    const [membership] = await db().select().from(schema.memberships).where(eq(schema.memberships.userId, file.uploadedByUserId!));
    const created = await as(h, actors.acmeAdmin!).post(`/v1/organizations/${membership!.organizationId}/assets`, { name: "Logo", kind: "LOGO", fileId: file.id });
    expect(created.status).toBe(200);
    await db().update(schema.memberships).set({ status: "DEACTIVATED" }).where(and(eq(schema.memberships.organizationId, membership!.organizationId), eq(schema.memberships.userId, file.uploadedByUserId!)));
    expect((await as(h, actors.acmeAdmin!).get(`/v1/organizations/${membership!.organizationId}/assets/${created.body.id}`)).status).toBe(404);
    expect((await as(h, actors.acmeAdmin!).get(`/v1/files/${file.id}/download`)).status).toBe(404);
  });

  it("does not fall back to the uploader for an unknown attached owner type", async () => {
    const { file } = await upload();
    await db().update(schema.files).set({ ownerType: "UNKNOWN", ownerId: crypto.randomUUID() }).where(eq(schema.files.id, file.id));
    expect((await as(h, actors.customerChidi!).get(`/v1/files/${file.id}/download`)).status).toBe(404);
  });
});
