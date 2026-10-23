import { apiErrorSchema, type Project, projectSchema, recommendationRuleSetSchema } from "@holypearls/contracts";
import { eq, schema, sql } from "@holypearls/db";
import { unseal } from "@holypearls/email";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { runDailyCleanup } from "../platform/cleanup.js";
import { as, expectHidden, expectNoIdentity, signInActors, type Actors } from "../testing/actors.js";
import { createHarness, type Harness, TEST_SEAL_KEY, TEST_WEB_ORIGIN } from "../testing/harness.js";

/*
 * T05-01: Start a Project drafts and recommendations (PROJ-FR-001–007).
 * Done when: resume lands on the same step; a guest resumes by link; a
 * removed suggestion stays removed after scale changes; a custom item is
 * kept. Negative access tests per TECH-03 §17.
 */

vi.setConfig({ testTimeout: 240_000 });

let harness: Harness;
let actors: Partial<Actors>;
const db = () => harness.database.db;

const cookieOf = (response: request.Response, name: string) =>
  ((response.headers["set-cookie"] as unknown as string[] | undefined) ?? []).map((cookie) => cookie.split(";")[0]!).find((cookie) => cookie.startsWith(`${name}=`));

/** A browser that keeps its device cookie (and a guest cookie once it has one). */
function browser(initial: string[] = []) {
  const jar = new Map(initial.map((cookie) => [cookie.split("=")[0]!, cookie]));
  const send = (req: request.Test) => {
    req.set("origin", TEST_WEB_ORIGIN);
    if (jar.size) req.set("cookie", [...jar.values()].join("; "));
    return req.then((response) => {
      for (const name of ["hp.device", "hp.guest"]) {
        const value = cookieOf(response, name);
        if (value) jar.set(name, value);
      }
      return response;
    });
  };
  return {
    post: (path: string, body: object = {}) => send(request(harness.url).post(path).set("idempotency-key", `test_${randomUUID().replaceAll("-", "")}`).send(body)),
    patch: (path: string, body: object) => send(request(harness.url).patch(path).send(body)),
    put: (path: string, body: object) => send(request(harness.url).put(path).send(body)),
    delete: (path: string) => send(request(harness.url).delete(path)),
    get: (path: string) => send(request(harness.url).get(path)),
    cookies: () => [...jar.values()],
  };
}

const parse = (response: request.Response): Project => {
  if (response.status >= 300) throw new Error(`${response.status} ${JSON.stringify(response.body)}`);
  return projectSchema.parse(response.body);
};

async function eventProject() {
  const b = browser();
  let project = parse(await b.post("/v1/projects", { type: "EVENT", title: "Lagos Tech Summit (TEST DATA)" }));
  project = parse(await b.patch(`/v1/projects/${project.id}`, { version: project.version, step: "SCALE", answers: { eventType: "CONFERENCE", hasStage: "YES", goals: ["SIGNAGE"] } }));
  project = parse(await b.patch(`/v1/projects/${project.id}`, { version: project.version, step: "RECOMMENDATIONS", answers: { attendees: 250, crew: 30, venues: 1 } }));
  return { b, project };
}

const rec = (project: Project, name: string) => project.recommendations.find((item) => item.name === name);

beforeAll(async () => {
  harness = await createHarness();
  actors = await signInActors(harness, ["adminAda", "adminTunde", "customerChidi"]);
});

afterAll(async () => {
  await harness?.close();
});

describe("starting and resuming a project (PROJ-FR-001, 007)", () => {
  it("starts from a goal and gives the browser a draft it can come back to on the same step", async () => {
    const { b, project } = await eventProject();
    expect(project).toMatchObject({ type: "EVENT", status: "DRAFT", step: "RECOMMENDATIONS", reference: null, priceState: "QUOTE_REQUIRED" });
    const current = (await b.get("/v1/projects/current")).body.project;
    expect(current).toMatchObject({ id: project.id, type: "EVENT", step: "RECOMMENDATIONS" });
    expect(parse(await b.get(`/v1/projects/${project.id}`)).step).toBe("RECOMMENDATIONS");
  });

  it("lets a guest resume by the emailed link, on the step they were on", async () => {
    const { b, project } = await eventProject();
    const emailed = await b.post(`/v1/projects/${project.id}/email`, { email: "bisi.project@example.com" });
    expect(emailed.status).toBe(200);
    expect(parse(emailed).linkEmailed).toBe(true);
    const [notification] = await db().select().from(schema.notifications).where(eq(schema.notifications.recordId, project.id));
    expect(notification).toMatchObject({ template: "guest_link", recordType: "PROJECT" });
    // Another device opens the link: the guest session it starts can open this project only.
    const { url } = unseal(notification!.sealedData!, TEST_SEAL_KEY) as { url: string };
    const guest = browser();
    const redeemed = await guest.post("/v1/guest-links/redeem", { secret: url.split("#")[1]! });
    expect(redeemed.body).toMatchObject({ purpose: "PROJECT", redirectTo: `/start/${project.id}` });
    expect(parse(await guest.get(`/v1/projects/${project.id}`)).step).toBe("RECOMMENDATIONS");
    expectHidden(await guest.get(`/v1/projects/${(await eventProject()).project.id}`));
  });

  it("keeps answers, and accepts \"I'm not sure\" wherever staff can still work with it (PROJ-FR-002)", async () => {
    const b = browser();
    let project = parse(await b.post("/v1/projects", { type: "STAFF_UNIFORMS" }));
    project = parse(await b.patch(`/v1/projects/${project.id}`, { version: project.version, answers: { people: "NOT_SURE", sizesKnown: "NOT_SURE", programme: "NOT_SURE", neededBy: "NOT_SURE" } }));
    expect(project.answers).toMatchObject({ people: "NOT_SURE", sizesKnown: "NOT_SURE" });
    expect(project.openItems).toEqual(expect.arrayContaining(["SIZES_LATER", "DATE_UNKNOWN"]));
    // The polo is suggested; staff confirm how many.
    expect(rec(project, "Front-of-house polos")).toMatchObject({ state: "INCLUDED", suggestedQuantity: null });
  });

  it("refuses answers to questions this kind of project doesn't have, and bad shapes", async () => {
    const b = browser();
    const project = parse(await b.post("/v1/projects", { type: "WEDDING" }));
    const unknown = await b.patch(`/v1/projects/${project.id}`, { version: project.version, answers: { crew: 30, needs: ["ROCKETS"] } });
    expect(unknown.status).toBe(400);
    expect(apiErrorSchema.parse(unknown.body).fieldErrors).toMatchObject({ crew: expect.any(String), needs: "Choose from the options." });
    const negative = await b.patch(`/v1/projects/${project.id}`, { version: project.version, answers: { attendees: -4 } });
    expect(apiErrorSchema.parse(negative.body).fieldErrors).toEqual({ "answers.attendees": "Enter 0 or more" });
  });

  it("starts a Something else project from the customer's own words", async () => {
    const b = browser();
    const project = parse(await b.post("/v1/projects", { type: "SOMETHING_ELSE", description: "Branded umbrellas for a rainy-season campaign" }));
    expect(project.answers.description).toBe("Branded umbrellas for a rainy-season campaign");
    expect(project.recommendations).toEqual([]);
  });

  it("returns the latest project on a stale save instead of overwriting it (TECH-02 §5)", async () => {
    const { b, project } = await eventProject();
    parse(await b.patch(`/v1/projects/${project.id}`, { version: project.version, title: "First tab" }));
    const stale = await b.patch(`/v1/projects/${project.id}`, { version: project.version, title: "Second tab" });
    expect(stale.status).toBe(409);
    expect(apiErrorSchema.parse(stale.body).code).toBe("VERSION_CONFLICT");
    expect(projectSchema.parse(apiErrorSchema.parse(stale.body).context!.latest).title).toBe("First tab");
  });
});

describe("recommendations and the customer's edits (PROJ-FR-003–006)", () => {
  it("suggests grouped items with reasons and quantities from the brief", async () => {
    const { project } = await eventProject();
    expect(rec(project, "Crew polo shirts")).toMatchObject({ group: "RECOMMENDED", state: "INCLUDED", suggestedQuantity: 30, reason: expect.any(String) });
    expect(rec(project, "Crew polo shirts")!.product?.slug).toBe("polo-shirt");
    expect(rec(project, "Name badges and lanyards")).toMatchObject({ suggestedQuantity: 250 });
    expect(rec(project, "Roll-up banners")).toMatchObject({ suggestedQuantity: 4 });
    expect(rec(project, "Main backdrop")).toMatchObject({ group: "USEFUL", state: "SUGGESTED", product: null });
    expect(rec(project, "Tote bags")).toBeUndefined();
  });

  it("keeps a removed suggestion removed after the scale changes, and keeps custom items", async () => {
    const { b, project: start } = await eventProject();
    const badges = rec(start, "Name badges and lanyards")!;
    let project = parse(await b.patch(`/v1/projects/${start.id}/recommendations/${badges.key}`, { version: start.version, state: "REMOVED" }));
    project = parse(await b.post(`/v1/projects/${project.id}/items`, { version: project.version, name: "Sponsor welcome kit", description: "A box for each sponsor", quantityNote: "About 20" }));
    const rollups = rec(project, "Roll-up banners")!;
    project = parse(await b.patch(`/v1/projects/${project.id}/recommendations/${rollups.key}`, { version: project.version, quantity: 2 }));

    project = parse(await b.patch(`/v1/projects/${project.id}`, { version: project.version, answers: { attendees: 400, crew: 40 } }));
    expect(rec(project, "Name badges and lanyards")).toMatchObject({ state: "REMOVED", suggestedQuantity: 400 });
    expect(rec(project, "Roll-up banners")).toMatchObject({ state: "INCLUDED", customerQuantity: 2, suggestedQuantity: 4 });
    expect(rec(project, "Crew polo shirts")).toMatchObject({ suggestedQuantity: 40 });
    expect(project.items).toEqual([expect.objectContaining({ kind: "CUSTOM", name: "Sponsor welcome kit", quantityNote: "About 20" })]);

    // A smaller event: the roll-ups the customer chose stay, marked as no longer suggested.
    project = parse(await b.patch(`/v1/projects/${project.id}`, { version: project.version, answers: { attendees: 60 } }));
    expect(rec(project, "Roll-up banners")).toMatchObject({ state: "INCLUDED", stillSuggested: false });
    expect(rec(project, "Notebooks")).toBeUndefined();
  });

  it("adds an offered item when the customer adds it or changes its quantity", async () => {
    const { b, project: start } = await eventProject();
    const backdrop = rec(start, "Main backdrop")!;
    const project = parse(await b.patch(`/v1/projects/${start.id}/recommendations/${backdrop.key}`, { version: start.version, quantity: 2 }));
    expect(rec(project, "Main backdrop")).toMatchObject({ state: "INCLUDED", customerQuantity: 2 });
  });

  it("adds catalogue products loosely (PROJ-FR-006) and removes items", async () => {
    const { b, project: start } = await eventProject();
    let project = parse(await b.post(`/v1/projects/${start.id}/items`, { version: start.version, productSlug: "standard-mug", quantityNote: "About 100, configure later" }));
    const mug = project.items[0]!;
    expect(mug).toMatchObject({ kind: "CATALOGUE", name: "Standard Mug", quantity: null, product: expect.objectContaining({ slug: "standard-mug" }) });
    project = parse(await b.patch(`/v1/projects/${project.id}/items/${mug.id}`, { version: project.version, quantity: 120 }));
    expect(project.items[0]!.quantity).toBe(120);
    project = parse(await b.delete(`/v1/projects/${project.id}/items/${mug.id}?version=${project.version}`));
    expect(project.items).toEqual([]);
    const unknown = await b.post(`/v1/projects/${project.id}/items`, { version: project.version, productSlug: "not-a-product" });
    expect(apiErrorSchema.parse(unknown.body).fieldErrors).toHaveProperty("productSlug");
  });
});

describe("who can open a project (TECH-03 §17)", () => {
  it("is hidden from other browsers, other customers and staff on the customer site", async () => {
    const { project } = await eventProject();
    expectHidden(await browser().get(`/v1/projects/${project.id}`));
    expectHidden(await as(harness, actors.customerChidi!).get(`/v1/projects/${project.id}`));
    expectHidden(await as(harness, actors.adminAda!).get(`/v1/projects/${project.id}`));
    expectHidden(await browser().get(`/v1/projects/${randomUUID()}`));
    const changed = await browser().patch(`/v1/projects/${project.id}`, { version: project.version, title: "Not mine" });
    expectNoIdentity(changed);
  });

  it("becomes the account's when the browser signs in", async () => {
    const { b, project } = await eventProject();
    const device = b.cookies().find((cookie) => cookie.startsWith("hp.device="))!;
    const signedIn = as(harness, `${actors.customerChidi!}; ${device}`);
    expect((await signedIn.get(`/v1/projects/${project.id}`)).status).toBe(200);
    expect((await as(harness, actors.customerChidi!).get(`/v1/projects/${project.id}`)).status).toBe(200);
  });

  it("can't change once it is no longer a draft", async () => {
    const { b, project } = await eventProject();
    await db().update(schema.projects).set({ status: "SUBMITTED" }).where(eq(schema.projects.id, project.id));
    const response = await b.patch(`/v1/projects/${project.id}`, { version: project.version, title: "Late change" });
    expect(response.status).toBe(409);
    expect(apiErrorSchema.parse(response.body).context).toMatchObject({ reason: "NOT_DRAFT" });
  });

  it("expires after 90 days without activity (TECH-01 §4)", async () => {
    const { project } = await eventProject();
    await db().update(schema.projects).set({ lastActivityAt: sql`now() - interval '91 days'` }).where(eq(schema.projects.id, project.id));
    await runDailyCleanup({ db: db(), storage: harness.storage, publicStorage: harness.publicStorage });
    const [row] = await db().select({ status: schema.projects.status }).from(schema.projects).where(eq(schema.projects.id, project.id));
    expect(row!.status).toBe("EXPIRED");
  });
});

describe("recommendation rules admin (Pen 110; QUOTE_MANAGE)", () => {
  const staff = (cookie: string) => ({
    get: (path: string) => request(harness.url).get(path).set("origin", TEST_WEB_ORIGIN).set("cookie", cookie),
    put: (path: string, body: object) => request(harness.url).put(path).set("origin", TEST_WEB_ORIGIN).set("cookie", cookie).send(body),
    post: (path: string, body: object) => request(harness.url).post(path).set("origin", TEST_WEB_ORIGIN).set("cookie", cookie).send(body),
  });

  it("needs QUOTE_MANAGE; customers don't learn it exists", async () => {
    expect((await staff(actors.adminTunde!).get("/v1/admin/recommendation-rules/EVENT")).status).toBe(403);
    expectHidden(await as(harness, actors.customerChidi!).get("/v1/admin/recommendation-rules/EVENT"));
    expect((await staff(actors.adminTunde!).put("/v1/admin/recommendation-rules/EVENT", { version: 1, rules: [] })).status).toBe(403);
  });

  it("previews, saves with a version check, keeps rule ids and is audited", async () => {
    const ada = staff(actors.adminAda!);
    const set = recommendationRuleSetSchema.parse((await ada.get("/v1/admin/recommendation-rules/WEDDING")).body);
    expect(set.rules).toEqual([]);
    const saved = recommendationRuleSetSchema.parse(
      (
        await ada.put("/v1/admin/recommendation-rules/WEDDING", {
          version: set.version,
          rules: [
            { group: "RECOMMENDED", productSlug: null, itemName: "Welcome sign", condition: { kind: "ALWAYS" }, quantity: { kind: "FIXED", value: 1 }, reason: "Guests know they're in the right place.", active: true },
            { group: "USEFUL", productSlug: "standard-mug", itemName: "Favour mugs", condition: { kind: "NUMBER", field: "attendees", op: ">=", value: 50 }, quantity: { kind: "PER", field: "attendees", factor: 1 }, reason: "A favour every guest takes home.", active: true },
          ],
        })
      ).body,
    );
    expect(saved.rules.map((rule) => rule.itemName)).toEqual(["Welcome sign", "Favour mugs"]);
    expect(saved.version).toBe(set.version + 1);

    const preview = await ada.post("/v1/admin/recommendation-rules/WEDDING/preview", { answers: { attendees: 120 } });
    expect(preview.body.items.map((item: { name: string; suggestedQuantity: number | null }) => [item.name, item.suggestedQuantity])).toEqual([
      ["Welcome sign", 1],
      ["Favour mugs", 120],
    ]);

    // A customer's choice survives the rule being edited, because the id stays.
    const b = browser();
    let project = parse(await b.post("/v1/projects", { type: "WEDDING" }));
    project = parse(await b.patch(`/v1/projects/${project.id}`, { version: project.version, answers: { attendees: 120 } }));
    project = parse(await b.patch(`/v1/projects/${project.id}/recommendations/${rec(project, "Favour mugs")!.key}`, { version: project.version, state: "REMOVED" }));
    const edited = recommendationRuleSetSchema.parse(
      (await ada.put("/v1/admin/recommendation-rules/WEDDING", { version: saved.version, rules: saved.rules.map(({ id, group, productSlug, itemName, condition, quantity, active }) => ({ id, group, productSlug, itemName, condition, quantity, active, reason: `${itemName}: updated reason.` })) })).body,
    );
    expect(edited.rules.map((rule) => rule.id)).toEqual(saved.rules.map((rule) => rule.id));
    project = parse(await b.patch(`/v1/projects/${project.id}`, { version: project.version, answers: { attendees: 150 } }));
    expect(rec(project, "Favour mugs")).toMatchObject({ state: "REMOVED", reason: "Favour mugs: updated reason." });

    const stale = await ada.put("/v1/admin/recommendation-rules/WEDDING", { version: saved.version, rules: [] });
    expect(stale.status).toBe(409);
    const [audit] = await db().select().from(schema.auditLog).where(eq(schema.auditLog.action, "recommendation_rules.saved"));
    expect(audit).toMatchObject({ permission: "QUOTE_MANAGE", recordLabel: "WEDDING" });
  });

  it("refuses rules that point at questions the type doesn't have", async () => {
    const ada = staff(actors.adminAda!);
    const set = recommendationRuleSetSchema.parse((await ada.get("/v1/admin/recommendation-rules/PACKAGING")).body);
    const response = await ada.put("/v1/admin/recommendation-rules/PACKAGING", {
      version: set.version,
      rules: [{ group: "RECOMMENDED", productSlug: "no-such-product", itemName: "Boxes", condition: { kind: "NUMBER", field: "attendees", op: ">", value: 1 }, quantity: { kind: "PER", field: "needs", factor: 1 }, reason: "Boxes.", active: true }],
    });
    expect(response.status).toBe(400);
    expect(Object.keys(apiErrorSchema.parse(response.body).fieldErrors ?? {}).sort()).toEqual(["rules.0.condition", "rules.0.productSlug", "rules.0.quantity"]);
  });
});
