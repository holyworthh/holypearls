import { adminProjectSchema, adminQuoteSchema, adminRequestListSchema, apiErrorSchema, configurationSchema, type Project, projectSchema, quoteSettingsSchema, quoteVersionSchema } from "@holypearls/contracts";
import { eq, schema, sql } from "@holypearls/db";
import { unseal } from "@holypearls/email";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { as, expectHidden, expectNoIdentity, signInActors, type Actors } from "../testing/actors.js";
import { no5xx, STRESS_RUNS } from "../testing/flows.js";
import { createHarness, type Harness, TEST_SEAL_KEY, TEST_WEB_ORIGIN } from "../testing/harness.js";
import { expireQuoteVersion, sendQuoteExpiringReminder } from "./quotes.js";

/*
 * T05-03: submitting a project (PROJ-FR-010–012), the staff request queue
 * (OPS-FR-030) and the quote builder (OPS-FR-031–034, 040; QUOTE-FR-001,
 * 006). Done when: a double submit creates one project; staff see all
 * details and files; a sent version can't change (DB and service tests);
 * V2 supersedes V1. Negative permission tests per TECH-03 §17.
 */

vi.setConfig({ testTimeout: 240_000 });

let harness: Harness;
let actors: Partial<Actors>;
const db = () => harness.database.db;
const notify = () => ({ db: db(), jobs: harness.jobs, sealKey: TEST_SEAL_KEY, webOrigin: TEST_WEB_ORIGIN });

const deviceCookie = (response: request.Response) =>
  ((response.headers["set-cookie"] as unknown as string[] | undefined) ?? []).map((cookie) => cookie.split(";")[0]!).find((cookie) => cookie.startsWith("hp.device="));

function browser() {
  let cookie = "";
  const send = (req: request.Test) => {
    req.set("origin", TEST_WEB_ORIGIN);
    if (cookie) req.set("cookie", cookie);
    return req.then((response) => {
      cookie = deviceCookie(response) ?? cookie;
      return response;
    });
  };
  return {
    post: (path: string, body: object = {}, key = `test_${randomUUID().replaceAll("-", "")}`) => send(request(harness.url).post(path).set("idempotency-key", key).send(body)),
    patch: (path: string, body: object) => send(request(harness.url).patch(path).send(body)),
    get: (path: string) => send(request(harness.url).get(path)),
  };
}

/** Staff calls through the admin routes (PUT and DELETE included). */
const staff = (cookie: string) => {
  const req = (test: request.Test) => test.set("origin", TEST_WEB_ORIGIN).set("cookie", cookie);
  return {
    get: (path: string) => req(request(harness.url).get(path)),
    post: (path: string, body: object = {}) => req(request(harness.url).post(path)).set("idempotency-key", `test_${randomUUID().replaceAll("-", "")}`).send(body),
    put: (path: string, body: object) => req(request(harness.url).put(path)).send(body),
    delete: (path: string) => req(request(harness.url).delete(path)),
  };
};

/** The database's own refusal, under the query wrapper. */
const refusal = (query: PromiseLike<unknown>) =>
  Promise.resolve(query).then(
    () => "allowed",
    (error: Error & { cause?: Error }) => error.cause?.message ?? error.message,
  );

const parse = (response: request.Response): Project => {
  if (response.status >= 300) throw new Error(`${response.status} ${JSON.stringify(response.body)}`);
  return projectSchema.parse(response.body);
};

/** An Event project ready to submit: 250 guests, 30 crew, a custom item. */
async function readyProject() {
  const b = browser();
  let project = parse(await b.post("/v1/projects", { type: "EVENT", title: "Lagos Tech Summit (TEST DATA)" }));
  project = parse(await b.patch(`/v1/projects/${project.id}`, { version: project.version, answers: { attendees: 250, crew: 30, hasStage: "YES", neededBy: "2026-12-14", city: "Lagos" } }));
  project = parse(await b.post(`/v1/projects/${project.id}/items`, { version: project.version, name: "Branded speaker gifts", description: "Something for 12 speakers", quantityNote: "About 12" }));
  return { b, project };
}

async function submitted() {
  const { b, project } = await readyProject();
  const done = parse(await b.post(`/v1/projects/${project.id}/submit`, { version: project.version, email: "bisi.quote@example.com", name: "Bisi (TEST DATA)" }));
  return { b, project: done };
}

beforeAll(async () => {
  harness = await createHarness();
  actors = await signInActors(harness, ["adminAda", "adminTunde", "customerChidi"]);
});

afterAll(async () => {
  await harness?.close();
});

describe("submitting a project (PROJ-FR-010–011)", () => {
  it("gives an HP-P reference, starts the quote and sends a secure link; no account needed", async () => {
    const { project } = await submitted();
    expect(project).toMatchObject({ status: "SUBMITTED", reference: expect.stringMatching(/^HP-P-\d{4}-\d{4,}$/), quote: { status: "PENDING_REVIEW", reference: expect.stringMatching(/^HP-Q-/) } });
    expect(project.sentTo).toMatch(/^b.*@example\.com$/);
    const [email] = await db().select().from(schema.notifications).where(eq(schema.notifications.recordId, project.id));
    expect(email).toMatchObject({ template: "project_submitted", recipient: "bisi.quote@example.com", recordLabel: project.reference });
    const { url } = unseal(email!.sealedData!, TEST_SEAL_KEY) as { url: string };
    const redeemed = await request(harness.url).post("/v1/guest-links/redeem").set("origin", TEST_WEB_ORIGIN).send({ secret: url.split("#")[1] });
    expect(redeemed.body).toMatchObject({ purpose: "PROJECT", redirectTo: `/start/${project.id}` });
  });

  it("creates one project, one reference and one quote however many times it is pressed", async () => {
    const { b, project } = await readyProject();
    const presses = await Promise.all(Array.from({ length: STRESS_RUNS }, () => b.post(`/v1/projects/${project.id}/submit`, { version: project.version, email: "double.press@example.com" })));
    no5xx(presses);
    const references = new Set(presses.filter((response) => response.status === 200).map((response) => projectSchema.parse(response.body).reference));
    expect(references.size).toBe(1);
    expect(await db().select().from(schema.quotes).where(eq(schema.quotes.projectId, project.id))).toHaveLength(1);
    // The same key again replays the first answer.
    const key = `test_${randomUUID().replaceAll("-", "")}`;
    const first = await b.post(`/v1/projects/${project.id}/submit`, { version: project.version, email: "double.press@example.com" }, key);
    const again = await b.post(`/v1/projects/${project.id}/submit`, { version: project.version, email: "double.press@example.com" }, key);
    expect(again.body).toEqual(first.body);
  });

  it("asks a guest for an email, refuses an empty project, and freezes the brief once sent", async () => {
    const { b, project } = await readyProject();
    const noEmail = await b.post(`/v1/projects/${project.id}/submit`, { version: project.version });
    expect(apiErrorSchema.parse(noEmail.body).fieldErrors).toEqual({ email: "Add an email so we can send your quote." });

    const empty = browser();
    const bare = parse(await empty.post("/v1/projects", { type: "WEDDING" }));
    const refused = await empty.post(`/v1/projects/${bare.id}/submit`, { version: bare.version, email: "empty@example.com" });
    expect(apiErrorSchema.parse(refused.body)).toMatchObject({ code: "RULE_FAILED", context: { reason: "NOTHING_TO_QUOTE" } });

    const done = parse(await b.post(`/v1/projects/${project.id}/submit`, { version: project.version, email: "frozen@example.com" }));
    const late = await b.patch(`/v1/projects/${project.id}`, { version: done.version, title: "Changed after sending" });
    expect(apiErrorSchema.parse(late.body).context).toMatchObject({ reason: "NOT_DRAFT" });
  });

  it("is hidden from everyone but its owner and link", async () => {
    const { project } = await submitted();
    expectNoIdentity(await browser().post(`/v1/projects/${project.id}/submit`, { version: project.version, email: "x@example.com" }));
    expectHidden(await as(harness, actors.customerChidi!).get(`/v1/projects/${project.id}`));
  });
});

describe("the request queue (OPS-FR-030, Pen 124B)", () => {
  it("shows staff everything the customer sent, and moves it to UNDER_REVIEW", async () => {
    const { project } = await submitted();
    const ada = staff(actors.adminAda!);
    const queue = adminRequestListSchema.parse((await ada.get("/v1/admin/requests")).body);
    expect(queue.items.find((item) => item.id === project.id)).toMatchObject({ kind: "PROJECT", reference: project.reference, status: "SUBMITTED", guest: true, neededBy: "2026-12-14" });

    const detail = adminProjectSchema.parse((await ada.get(`/v1/admin/projects/${project.id}`)).body);
    expect(detail.contact).toEqual({ name: "Bisi (TEST DATA)", email: "bisi.quote@example.com", guest: true });
    expect(detail.brief).toEqual(expect.arrayContaining([{ step: "Scale", question: "How many guests?", answer: "250" }, { step: "Project", question: "Is there a stage or photo area?", answer: "Yes" }]));
    expect(detail.items.map((item) => item.name)).toEqual(expect.arrayContaining(["Crew polo shirts", "Name badges and lanyards", "Branded speaker gifts"]));

    const reviewing = adminProjectSchema.parse((await ada.post(`/v1/admin/projects/${project.id}/start-review`)).body);
    expect(reviewing.status).toBe("UNDER_REVIEW");
    expect((await ada.post(`/v1/admin/projects/${project.id}/start-review`)).status).toBe(409);
    const [audit] = await db().select().from(schema.auditLog).where(eq(schema.auditLog.action, "project.review_started"));
    expect(audit).toMatchObject({ permission: "QUOTE_MANAGE", recordLabel: project.reference });
  });

  it("includes configuration quote requests (PROJ-FR-012)", async () => {
    const b = browser();
    const draft = configurationSchema.parse((await b.post("/v1/configurations", { productSlug: "business-cards", choices: { paper: "350gsm-matte", sides: "both-sides" } })).body);
    const priced = configurationSchema.parse((await b.patch(`/v1/configurations/${draft.id}`, { version: draft.version, quantity: 5000 })).body.draft);
    const asked = await b.post(`/v1/configurations/${priced.id}/quote-request`, { email: "cards.quote@example.com", name: "Cards (TEST DATA)" });
    const queue = adminRequestListSchema.parse((await staff(actors.adminAda!).get("/v1/admin/requests")).body);
    expect(queue.items.find((item) => item.reference === asked.body.reference)).toMatchObject({ kind: "CONFIGURATION", status: "PENDING_REVIEW", title: expect.stringContaining("Business Cards") });
  });

  it("needs QUOTE_MANAGE; customers don't learn it exists", async () => {
    const { project } = await submitted();
    expect((await staff(actors.adminTunde!).get("/v1/admin/requests")).status).toBe(403);
    expect((await staff(actors.adminTunde!).get(`/v1/admin/projects/${project.id}`)).status).toBe(403);
    expect((await staff(actors.adminTunde!).post(`/v1/admin/projects/${project.id}/start-review`)).status).toBe(403);
    expectHidden(await as(harness, actors.customerChidi!).get("/v1/admin/requests"));
    expectHidden(await staff(actors.adminAda!).get(`/v1/admin/projects/${randomUUID()}`));
  });
});

describe("the quote builder (OPS-FR-031–034, 040; Pen 111)", () => {
  const ada = () => staff(actors.adminAda!);

  async function draftFor(quoteId: string) {
    const quote = adminQuoteSchema.parse((await ada().post(`/v1/admin/quotes/${quoteId}/versions`)).body);
    return { quote, draft: quote.versions.find((version) => version.status === "DRAFT")! };
  }

  function linesFrom(quote: ReturnType<typeof adminQuoteSchema.parse>) {
    return quote.candidates.map((candidate, index) => ({ source: candidate.source, sourceKey: candidate.sourceKey, title: candidate.title, summary: candidate.summary, quantity: candidate.quantity ?? 1, unitMinor: candidate.unitMinor ?? String((index + 1) * 100_000) }));
  }

  const fees = { designMinor: "2500000", deliveryMinor: "650000", deliveryNote: "Lagos Island", installationMinor: "4500000", installationNote: "Backdrop", otherMinor: "0", otherLabel: "" };

  it("builds a draft from the project's items, works out the money on the server and sends it", async () => {
    const { project } = await submitted();
    const { quote, draft } = await draftFor(project.quote!.id);
    expect(draft).toMatchObject({ number: 1, status: "DRAFT", validDays: 14, lines: [] });
    expect(draft.schedule.map((entry) => entry.value)).toEqual(["5000", "5000"]);
    expect(quote.candidates.map((candidate) => candidate.title)).toEqual(expect.arrayContaining(["Crew polo shirts", "Branded speaker gifts"]));

    const lines = linesFrom(quote);
    const saved = quoteVersionSchema.parse(
      (await ada().put(`/v1/admin/quotes/${quote.id}/versions/${draft.id}`, { version: draft.version, currency: "NGN", lines, fees, validDays: 14, terms: "One proof round per item.", assumptions: "", productionSequence: "", schedule: draft.schedule })).body,
    );
    const goods = lines.reduce((sum, line) => sum + BigInt(line.quantity) * BigInt(line.unitMinor), 0n);
    expect(saved.totals.goodsMinor).toBe(goods.toString());
    expect(saved.totals.feesMinor).toBe("7650000");
    expect(BigInt(saved.totals.totalMinor)).toBe(goods + 7_650_000n + BigInt(saved.totals.vatMinor));
    expect(saved.payments!.reduce((sum, payment) => sum + BigInt(payment.amountMinor), 0n)).toBe(BigInt(saved.totals.totalMinor));

    const sent = adminQuoteSchema.parse((await ada().post(`/v1/admin/quotes/${quote.id}/versions/${draft.id}/send`, { version: saved.version })).body);
    expect(sent.status).toBe("READY");
    expect(sent.versions[0]).toMatchObject({ number: 1, status: "SENT", validUntil: expect.any(String) });
    const [row] = await db().select({ status: schema.projects.status }).from(schema.projects).where(eq(schema.projects.id, project.id));
    expect(row!.status).toBe("QUOTED");

    const [email] = await db().select().from(schema.notifications).where(sql`${schema.notifications.recordId} = ${quote.id} and ${schema.notifications.template} = 'quote_ready'`);
    const data = unseal(email!.sealedData!, TEST_SEAL_KEY) as { url: string; revised: boolean; version: number };
    expect(data).toMatchObject({ revised: false, version: 1 });
    const redeemed = await request(harness.url).post("/v1/guest-links/redeem").set("origin", TEST_WEB_ORIGIN).send({ secret: data.url.split("#")[1] });
    expect(redeemed.body).toMatchObject({ purpose: "QUOTE", redirectTo: `/quotes/${quote.id}` });

    const jobs = await db().execute<{ name: string }>(sql`select name from pgboss.job where data->>'quoteVersionId' = ${draft.id} or data->>'recordId' = ${draft.id} order by name`);
    expect(jobs.rows.map((job) => job.name)).toEqual(["quote.expire", "reminder.send"]);
    const [audit] = await db().select().from(schema.auditLog).where(sql`${schema.auditLog.action} = 'quote.sent' and ${schema.auditLog.recordId} = ${quote.id}`);
    expect(audit).toMatchObject({ permission: "QUOTE_MANAGE" });
  });

  it("never changes a sent version: the service refuses and the database refuses", async () => {
    const { project } = await submitted();
    const { quote, draft } = await draftFor(project.quote!.id);
    const saved = quoteVersionSchema.parse((await ada().put(`/v1/admin/quotes/${quote.id}/versions/${draft.id}`, { version: draft.version, currency: "NGN", lines: linesFrom(quote), fees, validDays: 14, terms: "", assumptions: "", productionSequence: "", schedule: draft.schedule })).body);
    await ada().post(`/v1/admin/quotes/${quote.id}/versions/${draft.id}/send`, { version: saved.version });

    const service = await ada().put(`/v1/admin/quotes/${quote.id}/versions/${draft.id}`, { version: saved.version, currency: "NGN", lines: [], fees, validDays: 14, terms: "Changed", assumptions: "", productionSequence: "", schedule: draft.schedule });
    expect(service.status).toBe(409);
    expect(apiErrorSchema.parse(service.body).context).toMatchObject({ reason: "VERSION_SENT" });

    expect(await refusal(db().update(schema.quoteVersions).set({ terms: "Sneaky change" }).where(eq(schema.quoteVersions.id, draft.id)))).toMatch(/was sent and cannot change/);
    expect(await refusal(db().update(schema.quoteLineItems).set({ quantity: 999 }).where(eq(schema.quoteLineItems.quoteVersionId, draft.id)))).toMatch(/cannot change/);
    expect(await refusal(db().insert(schema.quoteLineItems).values({ quoteVersionId: draft.id, position: 99, source: "MANUAL", title: "Extra", quantity: 1, unitMinor: 1n, totalMinor: 1n }))).toMatch(/cannot change/);
    expect(await refusal(db().delete(schema.quoteVersions).where(eq(schema.quoteVersions.id, draft.id)))).toMatch(/cannot be deleted/);
    // Only the status may move on.
    await db().update(schema.quoteVersions).set({ status: "SUPERSEDED" }).where(eq(schema.quoteVersions.id, draft.id));
    await db().update(schema.quoteVersions).set({ status: "SENT" }).where(eq(schema.quoteVersions.id, draft.id));
  });

  it("V2 copies V1, and sending it supersedes V1", async () => {
    const { project } = await submitted();
    const { quote, draft } = await draftFor(project.quote!.id);
    const lines = linesFrom(quote);
    const v1 = quoteVersionSchema.parse((await ada().put(`/v1/admin/quotes/${quote.id}/versions/${draft.id}`, { version: draft.version, currency: "NGN", lines, fees, validDays: 14, terms: "V1 terms", assumptions: "", productionSequence: "", schedule: draft.schedule })).body);
    await ada().post(`/v1/admin/quotes/${quote.id}/versions/${draft.id}/send`, { version: v1.version });

    const { draft: v2 } = await draftFor(quote.id);
    expect(v2).toMatchObject({ number: 2, status: "DRAFT", terms: "V1 terms" });
    expect(v2.lines.map((line) => line.title)).toEqual(lines.map((line) => line.title));
    const changed = quoteVersionSchema.parse(
      (await ada().put(`/v1/admin/quotes/${quote.id}/versions/${v2.id}`, { version: v2.version, currency: "NGN", lines: lines.map((line, index) => (index === 0 ? { ...line, quantity: line.quantity + 10 } : line)), fees, validDays: 7, terms: "V2 terms", assumptions: "", productionSequence: "", schedule: v2.schedule })).body,
    );
    const sent = adminQuoteSchema.parse((await ada().post(`/v1/admin/quotes/${quote.id}/versions/${v2.id}/send`, { version: changed.version })).body);
    expect(sent.versions.map((version) => [version.number, version.status])).toEqual([
      [2, "SENT"],
      [1, "SUPERSEDED"],
    ]);
    const emails = await db().select().from(schema.notifications).where(sql`${schema.notifications.recordId} = ${quote.id} and ${schema.notifications.template} = 'quote_ready'`);
    expect(emails.map((email) => (unseal(email.sealedData!, TEST_SEAL_KEY) as { revised: boolean }).revised).sort()).toEqual([false, true]);
  });

  it("refuses to send a version that isn't ready", async () => {
    const { project } = await submitted();
    const { quote, draft } = await draftFor(project.quote!.id);
    const empty = await ada().post(`/v1/admin/quotes/${quote.id}/versions/${draft.id}/send`, { version: draft.version });
    expect(apiErrorSchema.parse(empty.body).fieldErrors).toMatchObject({ lines: "Add at least one line before sending." });
    const lines = linesFrom(quote).map((line) => ({ ...line, unitMinor: "0" }));
    const unpriced = quoteVersionSchema.parse(
      (await ada().put(`/v1/admin/quotes/${quote.id}/versions/${draft.id}`, { version: draft.version, currency: "NGN", lines, fees, validDays: 14, terms: "", assumptions: "", productionSequence: "", schedule: [{ label: "Deposit", kind: "PERCENT", value: "5000", trigger: "ON_ACCEPTANCE" }, { label: "Balance", kind: "PERCENT", value: "4000", trigger: "BEFORE_DISPATCH" }] })).body,
    );
    expect(unpriced.scheduleProblem).toBe("The payments add up to 90% of the total. They must add up to 100%.");
    const refused = await ada().post(`/v1/admin/quotes/${quote.id}/versions/${draft.id}/send`, { version: unpriced.version });
    expect(Object.keys(apiErrorSchema.parse(refused.body).fieldErrors ?? {})).toEqual(expect.arrayContaining(["lines.0.unitMinor", "schedule"]));
    const usd = await ada().put(`/v1/admin/quotes/${quote.id}/versions/${draft.id}`, { version: unpriced.version, currency: "USD", lines, fees, validDays: 14, terms: "", assumptions: "", productionSequence: "", schedule: draft.schedule });
    expect(apiErrorSchema.parse(usd.body).fieldErrors).toEqual({ currency: "USD needs USD quotes switched on in Payment settings." });
    const stale = await ada().put(`/v1/admin/quotes/${quote.id}/versions/${draft.id}`, { version: draft.version, currency: "NGN", lines, fees, validDays: 14, terms: "", assumptions: "", productionSequence: "", schedule: draft.schedule });
    expect(stale.status).toBe(409);
  });

  it("expires at valid-until and skips the reminder afterwards (QUOTE-FR-006)", async () => {
    const { project } = await submitted();
    const { quote, draft } = await draftFor(project.quote!.id);
    const saved = quoteVersionSchema.parse((await ada().put(`/v1/admin/quotes/${quote.id}/versions/${draft.id}`, { version: draft.version, currency: "NGN", lines: linesFrom(quote), fees, validDays: 14, terms: "", assumptions: "", productionSequence: "", schedule: draft.schedule })).body);
    await ada().post(`/v1/admin/quotes/${quote.id}/versions/${draft.id}/send`, { version: saved.version });
    expect(await expireQuoteVersion(db(), draft.id)).toBe("skipped");
    expect(await sendQuoteExpiringReminder(notify(), draft.id, "test")).toBe("sent");
    const later = new Date(Date.now() + 15 * 86_400_000);
    expect(await expireQuoteVersion(db(), draft.id, later)).toBe("expired");
    expect(await expireQuoteVersion(db(), draft.id, later)).toBe("skipped");
    expect(await sendQuoteExpiringReminder(notify(), draft.id, "test")).toBe("skipped");
    const after = adminQuoteSchema.parse((await ada().get(`/v1/admin/quotes/${quote.id}`)).body);
    expect(after).toMatchObject({ status: "EXPIRED", versions: [expect.objectContaining({ status: "EXPIRED" })] });
  });

  it("needs QUOTE_MANAGE for quotes", async () => {
    const { project } = await submitted();
    const tunde = staff(actors.adminTunde!);
    expect((await tunde.get(`/v1/admin/quotes/${project.quote!.id}`)).status).toBe(403);
    expect((await tunde.post(`/v1/admin/quotes/${project.quote!.id}/versions`)).status).toBe(403);
    expectHidden(await as(harness, actors.customerChidi!).get(`/v1/admin/quotes/${project.quote!.id}`));
  });
});

describe("quote settings (QUOTE-FR-006, TECH-05 §4)", () => {
  it("saves validity, reminder and the default schedule with a version check; needs QUOTE_MANAGE and a recent MFA check", async () => {
    const ada = staff(actors.adminAda!);
    const settings = quoteSettingsSchema.parse((await ada.get("/v1/admin/quote-settings")).body);
    const bad = await ada.put("/v1/admin/quote-settings", { ...settings, defaultSchedule: [{ label: "All", kind: "PERCENT", value: "9000", trigger: "ON_ACCEPTANCE" }] });
    expect(apiErrorSchema.parse(bad.body).fieldErrors).toHaveProperty("defaultSchedule");
    const schedule = [
      { label: "Deposit", kind: "PERCENT", value: "6500", trigger: "ON_ACCEPTANCE" },
      { label: "Balance", kind: "PERCENT", value: "3500", trigger: "BEFORE_DISPATCH" },
    ];
    const saved = quoteSettingsSchema.parse((await ada.put("/v1/admin/quote-settings", { version: settings.version, validDays: 21, expiringNoticeDays: 5, defaultSchedule: schedule, defaultTerms: "New terms" })).body);
    expect(saved).toMatchObject({ validDays: 21, expiringNoticeDays: 5, defaultTerms: "New terms" });
    expect((await ada.put("/v1/admin/quote-settings", { version: settings.version, validDays: 14, expiringNoticeDays: 3, defaultSchedule: schedule, defaultTerms: "" })).status).toBe(409);
    expect((await staff(actors.adminTunde!).put("/v1/admin/quote-settings", { version: saved.version, validDays: 14, expiringNoticeDays: 3, defaultSchedule: schedule, defaultTerms: "" })).status).toBe(403);

    await db().execute(sql`update sessions set mfa_verified_at = now() - interval '16 minutes'`);
    const stale = await ada.put("/v1/admin/quote-settings", { version: saved.version, validDays: 14, expiringNoticeDays: 3, defaultSchedule: schedule, defaultTerms: "" });
    expect(apiErrorSchema.parse(stale.body).code).toBe("RECENT_MFA_REQUIRED");
    await db().execute(sql`update sessions set mfa_verified_at = now()`);
    // Put the starting values back for the other tests in this file.
    await ada.put("/v1/admin/quote-settings", { version: saved.version, validDays: 14, expiringNoticeDays: 3, defaultSchedule: [{ ...schedule[0], value: "5000" }, { ...schedule[1], value: "5000" }], defaultTerms: settings.defaultTerms });
  });
});
