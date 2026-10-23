import { TEST_PEOPLE } from "@holypearls/auth";
import { adminAssetReviewListSchema, adminAssetSchema, adminOrganizationSchema, brandAssetListSchema, brandAssetSchema } from "@holypearls/contracts";
import { desc, eq, schema, sql } from "@holypearls/db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { type Actors, as, expectForbidden, expectHidden, signInActors } from "../testing/actors.js";
import { createHarness, type Harness } from "../testing/harness.js";

/*
 * T11-01: brand assets and versions (PRD-05 B2B-FR-020–024; OPS-FR-083;
 * TECH-01 §4; TECH-04 §9). Done when: uploading V5 keeps V4; a retired
 * version can't be used for new orders.
 */

vi.setConfig({ testTimeout: 300_000 });

let harness: Harness;
let actors: Partial<Actors>;
let acme: string;
const db = () => harness.database.db;
const api = (key: keyof Actors) => as(harness, actors[key] ?? "");

async function userIdOf(key: keyof typeof TEST_PEOPLE) {
  const [row] = await db().select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, TEST_PEOPLE[key].email));
  return row!.id;
}

/** An uploaded brand-asset file, as the files module leaves it after its checks. */
async function uploaded(key: keyof typeof TEST_PEOPLE, status: "READY" | "PROCESSING" = "READY") {
  const storageKey = `files/source/${crypto.randomUUID()}`;
  await harness.storage.write(storageKey, Buffer.from("%PDF-1.4 test logo"), "application/pdf");
  const [file] = await db()
    .insert(schema.files)
    .values({ purpose: "BRAND_ASSET", status, bucket: "private", originalName: "logo.pdf", safeName: "logo.pdf", declaredType: "application/pdf", declaredSize: 18, storageKey, uploadedByUserId: await userIdOf(key) })
    .returning();
  return file!.id;
}

const base = () => `/v1/organizations/${acme}/assets`;

beforeAll(async () => {
  harness = await createHarness();
  actors = await signInActors(harness, ["acmeOwner", "acmeAdmin", "acmeViewer", "acmeBuyer", "customerChidi", "adminAda", "financeFolake"]);
  const [organization] = await db().select().from(schema.organizations).where(sql`${schema.organizations.name} like 'ACME%'`);
  acme = organization!.id;
});

afterAll(async () => {
  await harness?.close();
});

describe("brand asset versions (B2B-FR-020–023)", () => {
  it("V1 waits for review; staff mark it ready; V5 never overwrites V4", async () => {
    const created = await api("acmeAdmin").post(base(), { name: "Primary Logo", kind: "LOGO", fileId: await uploaded("acmeAdmin") });
    expect(created.status).toBe(200);
    const asset = brandAssetSchema.parse(created.body);
    expect(asset.versions).toMatchObject([{ number: 1, status: "NEEDS_REVIEW", uploadedBy: TEST_PEOPLE.acmeAdmin.name }]);

    // Staff mark V1 ready.
    const v1 = asset.versions[0]!.id;
    const ready = adminAssetSchema.parse((await api("adminAda").post(`/v1/admin/brand-assets/versions/${v1}/review`, { decision: "PRODUCTION_READY", note: null })).body);
    expect(ready.versions[0]!.status).toBe("PRODUCTION_READY");

    // V2 arrives while its file is still being checked.
    const processingFile = await uploaded("acmeAdmin", "PROCESSING");
    const replaced = brandAssetSchema.parse((await api("acmeAdmin").post(`${base()}/${asset.id}/versions`, { fileId: processingFile })).body);
    expect(replaced.versions.map((version) => [version.number, version.status])).toEqual([
      [2, "PROCESSING"],
      [1, "PRODUCTION_READY"],
    ]);
    // Staff can't approve a file that's still being checked.
    const v2 = replaced.versions[0]!.id;
    expect((await api("adminAda").post(`/v1/admin/brand-assets/versions/${v2}/review`, { decision: "PRODUCTION_READY", note: null })).body.context?.reason).toBe("NOT_IN_REVIEW");
    // Once the file is ready, V2 waits for review and shows in the staff queue.
    await db().update(schema.files).set({ status: "READY" }).where(eq(schema.files.id, processingFile));
    const queue = adminAssetReviewListSchema.parse((await api("adminAda").get("/v1/admin/brand-assets/review")).body);
    expect(queue.versions.find((row) => row.versionId === v2)).toMatchObject({ number: 2, status: "NEEDS_REVIEW", organizationName: "ACME Hospitality Group (TEST DATA)" });

    // Keep in review needs a note; the uploader is emailed.
    expect((await api("adminAda").post(`/v1/admin/brand-assets/versions/${v2}/review`, { decision: "KEEP_IN_REVIEW", note: null })).status).toBe(400);
    expect((await api("adminAda").post(`/v1/admin/brand-assets/versions/${v2}/review`, { decision: "KEEP_IN_REVIEW", note: "Colour count is 14. Embroidery will merge 2 greys." })).status).toBe(200);
    const [mail] = await db().select().from(schema.notifications).where(eq(schema.notifications.template, "brand_asset_reviewed")).orderBy(desc(schema.notifications.createdAt)).limit(1);
    expect(mail!.recipient).toBe(TEST_PEOPLE.acmeAdmin.email);

    // Ready: V2 becomes current and V1 is superseded, untouched otherwise.
    const final = adminAssetSchema.parse((await api("adminAda").post(`/v1/admin/brand-assets/versions/${v2}/review`, { decision: "PRODUCTION_READY", note: "OK for print and embroidery." })).body);
    expect(final.versions.map((version) => [version.number, version.status])).toEqual([
      [2, "PRODUCTION_READY"],
      [1, "SUPERSEDED"],
    ]);
    const [v1Row] = await db().select().from(schema.brandAssetVersions).where(eq(schema.brandAssetVersions.id, v1));
    expect(v1Row!.fileId).toBe(asset.versions[0]!.fileId);

    // The library shows V2 as current.
    const list = brandAssetListSchema.parse((await api("acmeViewer").get(base())).body);
    expect(list.canManage).toBe(false);
    expect(list.assets.find((row) => row.id === asset.id)).toMatchObject({ current: { number: 2 }, latest: { number: 2 }, versionCount: 2 });
  });

  it("retiring stops new use; archiving works from any status; both are audited", async () => {
    const asset = brandAssetSchema.parse((await api("acmeOwner").post(base(), { name: "Embroidery file", kind: "EMBROIDERY", fileId: await uploaded("acmeOwner") })).body);
    const v1 = asset.versions[0]!.id;
    // Only a version in use can be retired.
    expect((await api("acmeOwner").post(`${base()}/${asset.id}/versions/${v1}/retire`)).body.context?.reason).toBe("NOT_IN_USE");
    await api("adminAda").post(`/v1/admin/brand-assets/versions/${v1}/review`, { decision: "PRODUCTION_READY", note: null });
    const retired = brandAssetSchema.parse((await api("acmeOwner").post(`${base()}/${asset.id}/versions/${v1}/retire`)).body);
    expect(retired.versions[0]!.status).toBe("RETIRED");
    // A retired version can't come back for new orders.
    expect((await api("adminAda").post(`/v1/admin/brand-assets/versions/${v1}/review`, { decision: "PRODUCTION_READY", note: null })).body.context?.reason).toBe("NOT_IN_REVIEW");
    const archived = brandAssetSchema.parse((await api("acmeOwner").post(`${base()}/${asset.id}/versions/${v1}/archive`)).body);
    expect(archived.versions[0]!.status).toBe("ARCHIVED");
    expect((await api("acmeOwner").post(`${base()}/${asset.id}/versions/${v1}/archive`)).body.context?.reason).toBe("ALREADY_ARCHIVED");
    const audit = await db().select({ action: schema.auditLog.action }).from(schema.auditLog).where(eq(schema.auditLog.recordId, asset.id));
    expect(audit.map((row) => row.action)).toEqual(expect.arrayContaining(["brand_asset.created", "brand_asset.version_ready", "brand_asset.version_retired", "brand_asset.version_archived"]));
  });
});

describe("who can see and change assets", () => {
  it("members see them; MANAGE_BRAND changes them; other organizations and outsiders get 404", async () => {
    const asset = brandAssetSchema.parse((await api("acmeAdmin").post(base(), { name: "Brand guidelines", kind: "GUIDELINES", fileId: await uploaded("acmeAdmin") })).body);
    expect((await api("acmeBuyer").get(`${base()}/${asset.id}`)).status).toBe(200);
    expectForbidden(await api("acmeViewer").post(base(), { name: "Sneaky", kind: "LOGO", fileId: await uploaded("acmeViewer") }), "MANAGE_BRAND");
    expectForbidden(await api("acmeViewer").post(`${base()}/${asset.id}/versions`, { fileId: await uploaded("acmeViewer") }), "MANAGE_BRAND");
    expectForbidden(await api("acmeBuyer").post(`${base()}/${asset.id}/versions/${asset.versions[0]!.id}/archive`), "MANAGE_BRAND");
    expectHidden(await api("customerChidi").get(base()));
    expectHidden(await api("customerChidi").get(`${base()}/${asset.id}`));
    // Someone else's upload can't be used.
    const chidiFile = await uploaded("customerChidi");
    expectHidden(await api("acmeAdmin").post(`${base()}/${asset.id}/versions`, { fileId: chidiFile }));
    // An attached file can't be reused for another version.
    const used = await api("acmeAdmin").post(`${base()}/${asset.id}/versions`, { fileId: asset.versions[0]!.fileId });
    expect(used.status).toBe(400);
    // The file downloads for members and staff, not for outsiders.
    const fileId = asset.versions[0]!.fileId;
    expect((await api("acmeViewer").get(`/v1/files/${fileId}/download`)).status).toBe(200);
    expect((await api("adminAda").get(`/v1/files/${fileId}/download`)).status).toBe(200);
    expectHidden(await api("customerChidi").get(`/v1/files/${fileId}/download`));
  });

  it("staff review needs STAFF_ADMIN; non-staff never learn it exists; the support view lists assets", async () => {
    expectForbidden(await api("financeFolake").get("/v1/admin/brand-assets/review"), "STAFF_ADMIN");
    expectHidden(await api("acmeOwner").get("/v1/admin/brand-assets/review"));
    const support = adminOrganizationSchema.parse((await api("adminAda").get(`/v1/admin/organizations/${acme}`)).body);
    expect(support.assets.map((asset) => asset.name)).toEqual(expect.arrayContaining(["Primary Logo", "Embroidery file", "Brand guidelines"]));
  });
});

it("searches brand assets in the current organization without granting access to outsiders", async () => {
  const asset = brandAssetSchema.parse((await api("acmeOwner").post(base(), { name: "Audit Search Logo", kind: "LOGO", fileId: await uploaded("acmeOwner") })).body);
  const search = (await api("acmeViewer").get(`/v1/organizations/${acme}/search?q=Audit%20Search`)).body;
  expect(search.assets.map((row: { id: string }) => row.id)).toContain(asset.id);
  expectHidden(await api("customerChidi").get(`/v1/organizations/${acme}/search?q=Audit%20Search`));
});
