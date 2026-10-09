import { TEST_PEOPLE } from "@holypearls/auth";
import { adminTemplateListSchema, adminTemplateSchema, brandAssetSchema, configurationSchema, templateListSchema, templateSchema, templateSourceListSchema } from "@holypearls/contracts";
import { eq, schema, sql } from "@holypearls/db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { type Actors, as, expectForbidden, expectHidden, signInActors } from "../testing/actors.js";
import { createHarness, type Harness } from "../testing/harness.js";

/*
 * T11-01b: Workspace Product Templates and HolyPearls approval (PRD-05
 * B2B-FR-024, 030–032; OPS-FR-082). Done when: both V4/V5 journeys pass —
 * a newer version leaves templates usable on the old one ("Available using
 * logo V4"); retiring the old one blocks them until they move to the new one.
 */

vi.setConfig({ testTimeout: 300_000 });

let harness: Harness;
let actors: Partial<Actors>;
let acme: string;
let lekki: string;
const db = () => harness.database.db;
const api = (key: keyof Actors) => as(harness, actors[key] ?? "");
const base = () => `/v1/organizations/${acme}`;

async function uploaded(key: keyof typeof TEST_PEOPLE) {
  const [user] = await db().select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, TEST_PEOPLE[key].email));
  const storageKey = `files/source/${crypto.randomUUID()}`;
  await harness.storage.write(storageKey, Buffer.from("%PDF-1.4 logo"), "application/pdf");
  const [file] = await db()
    .insert(schema.files)
    .values({ purpose: "BRAND_ASSET", status: "READY", bucket: "private", originalName: "logo.pdf", safeName: "logo.pdf", declaredType: "application/pdf", declaredSize: 13, storageKey, uploadedByUserId: user!.id })
    .returning();
  return file!.id;
}

/** A logo with V1 production ready, and a saved business-cards design owned by the Owner. */
async function setup() {
  const asset = brandAssetSchema.parse((await api("acmeOwner").post(`${base()}/assets`, { name: "Primary Logo", kind: "LOGO", fileId: await uploaded("acmeOwner") })).body);
  const v1 = asset.versions[0]!.id;
  await api("adminAda").post(`/v1/admin/brand-assets/versions/${v1}/review`, { decision: "PRODUCTION_READY", note: null });
  const draft = configurationSchema.parse((await api("acmeOwner").post("/v1/configurations", { productSlug: "business-cards", choices: { paper: "350gsm-matte", sides: "both-sides" } })).body);
  return { assetId: asset.id, v1, configurationId: draft.id };
}

const approve = async (templateId: string) => {
  const current = adminTemplateSchema.parse((await api("adminAda").get(`/v1/admin/templates/${templateId}`)).body);
  return api("adminAda").post(`/v1/admin/templates/${templateId}/decision`, { decision: "APPROVE", note: null, version: current.version });
};

beforeAll(async () => {
  harness = await createHarness();
  actors = await signInActors(harness, ["acmeOwner", "acmeAdmin", "acmeBuyer", "acmeLekkiManager", "acmeViewer", "customerChidi", "adminAda", "financeFolake"]);
  const [organization] = await db().select().from(schema.organizations).where(sql`${schema.organizations.name} like 'ACME%'`);
  acme = organization!.id;
  const locations = await db().select().from(schema.locations).where(eq(schema.locations.organizationId, acme));
  lekki = locations.find((location) => location.name === "Lekki")!.id;
});

afterAll(async () => {
  await harness?.close();
});

describe("templates (B2B-FR-030–032)", () => {
  it("a draft starts from a saved design with locked brand fields and editable order fields", async () => {
    const { v1, configurationId } = await setup();
    const sources = templateSourceListSchema.parse((await api("acmeOwner").get(`${base()}/templates/sources`)).body);
    expect(sources.sources.map((source) => source.configurationId)).toContain(configurationId);
    const created = await api("acmeOwner").post(`${base()}/templates`, { name: "ACME Business Cards", configurationId, assetVersionIds: [v1], allLocations: true });
    expect(created.status).toBe(200);
    const template = templateSchema.parse(created.body);
    expect(template).toMatchObject({ status: "DRAFT", productName: "Business Cards", assets: [{ number: 1, status: "PRODUCTION_READY" }] });
    expect(template.fields.find((field) => field.key === "option:paper")).toMatchObject({ control: "LOCKED", reason: expect.stringContaining("brand template") });
    expect(template.fields.find((field) => field.key === "quantity")).toMatchObject({ control: "EDITABLE", reason: "Chosen per order" });
    expect(template.fields.find((field) => field.key === "logo")?.control).toBe("LOCKED");
    // Drafts are for the people who manage templates.
    expectHidden(await api("acmeViewer").get(`${base()}/templates/${template.id}`));
    expect(templateListSchema.parse((await api("acmeViewer").get(`${base()}/templates`)).body).templates.map((row) => row.id)).not.toContain(template.id);
  });

  it("only Owners and Admins create; nobody uses another person's design or another organization's asset", async () => {
    const { v1, configurationId } = await setup();
    expectForbidden(await api("acmeLekkiManager").post(`${base()}/templates`, { name: "Nope", configurationId, assetVersionIds: [], allLocations: false, locationIds: [lekki] }), "MANAGE_BRAND");
    // The Admin can't start from the Owner's private draft.
    expectHidden(await api("acmeAdmin").post(`${base()}/templates`, { name: "Borrowed", configurationId, assetVersionIds: [v1], allLocations: true }));
    expectHidden(await api("customerChidi").get(`${base()}/templates`));
    const chidiDraft = configurationSchema.parse((await api("customerChidi").post("/v1/configurations", { productSlug: "business-cards", choices: { paper: "350gsm-matte", sides: "both-sides" } })).body);
    expectHidden(await api("acmeOwner").post(`${base()}/templates`, { name: "Stolen", configurationId: chidiDraft.id, assetVersionIds: [], allLocations: true }));
  });

  it("HolyPearls approves after the checks; returning to draft needs a note; staff need STAFF_ADMIN", async () => {
    const { v1, configurationId } = await setup();
    let template = templateSchema.parse((await api("acmeOwner").post(`${base()}/templates`, { name: "ACME Cards Approval", configurationId, assetVersionIds: [v1], allLocations: true })).body);
    template = templateSchema.parse((await api("acmeOwner").post(`${base()}/templates/${template.id}/submit`, { version: template.version })).body);
    expect(template.status).toBe("AWAITING_APPROVAL");
    const queue = adminTemplateListSchema.parse((await api("adminAda").get("/v1/admin/templates")).body);
    expect(queue.templates.map((row) => row.id)).toContain(template.id);
    const detail = adminTemplateSchema.parse((await api("adminAda").get(`/v1/admin/templates/${template.id}`)).body);
    expect(detail.checks.every((check) => check.pass)).toBe(true);
    expect((await api("adminAda").post(`/v1/admin/templates/${template.id}/decision`, { decision: "RETURN_TO_DRAFT", note: null, version: detail.version })).status).toBe(400);
    const returned = adminTemplateSchema.parse((await api("adminAda").post(`/v1/admin/templates/${template.id}/decision`, { decision: "RETURN_TO_DRAFT", note: "Lock the finish too.", version: detail.version })).body);
    expect(returned).toMatchObject({ status: "DRAFT", reviewNote: "Lock the finish too." });
    expectForbidden(await api("financeFolake").get("/v1/admin/templates"), "STAFF_ADMIN");
    expectHidden(await api("acmeOwner").get("/v1/admin/templates"));
  });

  it("a template for Lekki is only seen in Lekki", async () => {
    const { v1, configurationId } = await setup();
    let template = templateSchema.parse((await api("acmeOwner").post(`${base()}/templates`, { name: "Lekki Aprons", configurationId, assetVersionIds: [v1], allLocations: false, locationIds: [lekki] })).body);
    template = templateSchema.parse((await api("acmeOwner").post(`${base()}/templates/${template.id}/submit`, { version: template.version })).body);
    expect((await approve(template.id)).status).toBe(200);
    expect((await api("acmeLekkiManager").get(`${base()}/templates/${template.id}`)).status).toBe(200);
    expectHidden(await api("acmeBuyer").get(`${base()}/templates/${template.id}`));
  });
});

describe("the V4/V5 journeys (B2B-FR-024)", () => {
  it("a newer version leaves the template usable on the old one; retiring the old one blocks it until it moves", async () => {
    const { assetId, v1, configurationId } = await setup();
    let template = templateSchema.parse((await api("acmeOwner").post(`${base()}/templates`, { name: "ACME Staff Cards", configurationId, assetVersionIds: [v1], allLocations: true })).body);
    template = templateSchema.parse((await api("acmeOwner").post(`${base()}/templates/${template.id}/submit`, { version: template.version })).body);
    expect((await approve(template.id)).status).toBe(200);

    // Journey 1: V2 becomes production ready. The template stays APPROVED, on V1.
    const v2Asset = brandAssetSchema.parse((await api("acmeOwner").post(`${base()}/assets/${assetId}/versions`, { fileId: await uploaded("acmeOwner") })).body);
    const v2 = v2Asset.versions.find((version) => version.number === 2)!.id;
    await api("adminAda").post(`/v1/admin/brand-assets/versions/${v2}/review`, { decision: "PRODUCTION_READY", note: null });
    template = templateSchema.parse((await api("acmeViewer").get(`${base()}/templates/${template.id}`)).body);
    expect(template).toMatchObject({ status: "APPROVED", assetLabel: "Available using primary logo V1", assets: [{ number: 1, status: "SUPERSEDED", currentNumber: 2 }] });
    // The asset shows which templates use it.
    expect(brandAssetSchema.parse((await api("acmeOwner").get(`${base()}/assets/${assetId}`)).body).templates.map((row) => row.name)).toContain("ACME Staff Cards");

    // Journey 2: V1 is retired. The template is blocked until it moves to V2.
    await api("acmeOwner").post(`${base()}/assets/${assetId}/versions/${v1}/retire`);
    template = templateSchema.parse((await api("acmeViewer").get(`${base()}/templates/${template.id}`)).body);
    expect(template).toMatchObject({ status: "NEEDS_REVIEW", assetLabel: "Blocked — asset review required" });
    // It can't go back for approval on the retired version.
    expect((await api("acmeOwner").post(`${base()}/templates/${template.id}/submit`, { version: template.version })).body.context?.reason).toBe("ASSET_NOT_READY");
    // "Update to V2": the change sends it back to draft, then through HolyPearls again.
    const owner = templateSchema.parse((await api("acmeOwner").get(`${base()}/templates/${template.id}`)).body);
    let moved = templateSchema.parse(
      (await api("acmeOwner").put(`${base()}/templates/${template.id}`, { name: owner.name, fields: owner.fields.map(({ key, control, reason }) => ({ key, control, reason })), assetVersionIds: [v2], allLocations: true, version: owner.version })).body,
    );
    expect(moved).toMatchObject({ status: "DRAFT", assets: [{ number: 2 }] });
    moved = templateSchema.parse((await api("acmeOwner").post(`${base()}/templates/${template.id}/submit`, { version: moved.version })).body);
    expect((await approve(template.id)).status).toBe(200);
    const final = templateSchema.parse((await api("acmeViewer").get(`${base()}/templates/${template.id}`)).body);
    expect(final).toMatchObject({ status: "APPROVED", assetLabel: null, assets: [{ number: 2, status: "PRODUCTION_READY" }] });
    const audit = await db().select({ action: schema.auditLog.action }).from(schema.auditLog).where(eq(schema.auditLog.recordId, template.id));
    expect(audit.map((row) => row.action)).toEqual(expect.arrayContaining(["template.created", "template.submitted", "template.approved", "template.needs_review", "template.updated"]));
  });
});
