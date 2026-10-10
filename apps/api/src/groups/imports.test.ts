import { TEST_PEOPLE } from "@holypearls/auth";
import { collectionDashboardSchema, collectionSchema, configurationSchema, type ImportBatch, importBatchSchema } from "@holypearls/contracts";
import { eq, schema, sql } from "@holypearls/db";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { type Actors, as, expectForbidden, expectHidden, signInActors } from "../testing/actors.js";
import { createHarness, type Harness } from "../testing/harness.js";

/*
 * T12-03c: CSV import for group collections (PRD-05 B2B-FR-070–073; TECH-04
 * §12; Pen 75). Done when: a 120-row file works, and the test proves no row
 * is silently lost.
 */

vi.setConfig({ testTimeout: 600_000 });

let harness: Harness;
let actors: Partial<Actors>;
let acme: string;
let lekki: string;
let victoriaIsland: string;
const db = () => harness.database.db;
const api = (key: keyof Actors) => as(harness, actors[key] ?? "");
const base = () => `/v1/organizations/${acme}/collections`;

async function openCollection() {
  const polo = configurationSchema.parse((await api("acmeOwner").post("/v1/configurations", { productSlug: "polo-shirt", choices: { colour: "navy", fabric: "pique-cotton" } })).body);
  let collection = collectionSchema.parse((await api("acmeOwner").post(base(), { title: `Staff 2027 ${randomUUID().slice(0, 6)}`, locationId: lekki, configurationId: polo.id })).body);
  collection = collectionSchema.parse(
    (
      await api("acmeOwner").put(`${base()}/${collection.id}`, {
        title: collection.title,
        fields: ["SIZE", "PERSONALIZATION"],
        deadline: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        deliveryMode: "BRANCHES",
        centralLocationId: null,
        branchLocationIds: [lekki, victoriaIsland],
        unsureSizeRule: "ALLOW_UNSURE",
        version: collection.version,
      })
    ).body,
  );
  collection = collectionSchema.parse((await api("acmeOwner").post(`${base()}/${collection.id}/open`, { version: collection.version })).body);
  return collection;
}

/** A checked CSV upload owned by `person`. */
async function upload(text: string, person: keyof typeof TEST_PEOPLE = "acmeOwner", status: "READY" | "PROCESSING" = "READY") {
  const [user] = await db().select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, TEST_PEOPLE[person].email));
  const storageKey = `files/source/${randomUUID()}`;
  await harness.storage.write(storageKey, Buffer.from(text, "utf8"), "text/csv");
  const [file] = await db()
    .insert(schema.files)
    .values({ purpose: "CSV_IMPORT", status, bucket: "private", originalName: "staff-2027.csv", safeName: "staff-2027.csv", declaredType: "text/csv", declaredSize: text.length, storageKey, uploadedByUserId: user!.id })
    .returning();
  return file!.id;
}

/**
 * Pen 75's file: 120 people, 114 ready. Line numbers count the header as line
 * 1, so person n is on line n + 1.
 */
function staffFile(existingEmail: string) {
  const lines = ["Full name,Work email,Size,Chest name,Delivery branch"];
  for (let person = 1; person <= 120; person++) {
    const cells = [`Staff ${person}`, `staff${person}@example.com`, ["S", "M", "L", "XL"][person % 4]!, `STAFF${person}`, person % 2 ? "Lekki" : "Victoria Island"];
    if (person === 13) cells[2] = "XXXXXL"; // line 14: not a size
    if (person === 26) cells[3] = "OLUWABUKOLAAA"; // line 27: over 12 letters
    if (person === 40) cells[4] = "Lekki Phase 1"; // line 41: not a location
    if (person === 57) cells[1] = ""; // line 58: no email
    if (person === 76) cells[3] = "B@D!"; // line 77: characters that can't be stitched
    if (person === 102) cells[2] = ""; // line 103: no size yet; they'll choose it
    if (person === 90) cells[1] = existingEmail; // line 91: already in the collection
    if (person === 96) cells[1] = "staff95@example.com"; // line 97: same email as line 96
    lines.push(cells.map((cell) => (cell.includes(",") ? `"${cell}"` : cell)).join(","));
  }
  return `${lines.join("\n")}\n`;
}

const lineOf = (batch: ImportBatch, line: number) => batch.rows.find((row) => row.line === line)!;

beforeAll(async () => {
  harness = await createHarness();
  actors = await signInActors(harness, ["acmeOwner", "acmeViewer", "acmeLekkiManager"]);
  const [organization] = await db().select().from(schema.organizations).where(sql`${schema.organizations.name} like 'ACME%'`);
  acme = organization!.id;
  const locations = await db().select().from(schema.locations).where(eq(schema.locations.organizationId, acme));
  lekki = locations.find((location) => location.name === "Lekki")!.id;
  victoriaIsland = locations.find((location) => location.name !== "Lekki")!.id;
});

afterAll(async () => {
  await harness?.close();
});

describe("CSV import (B2B-FR-070–073)", () => {
  it("a 120-row file: columns matched, problems shown by line, duplicates chosen, valid rows imported first, and no row is ever lost", async () => {
    const collection = await openCollection();
    // Someone already joined by link with the email line 91 uses.
    const existingEmail = `existing.${randomUUID().slice(0, 6)}@example.com`;
    await as(harness, "").post("/v1/collections/join", { secret: collection.shareUrl!.split("#")[1], name: "Existing Person", email: existingEmail });

    // Upload and check: the columns are matched from their headers.
    const started = await api("acmeOwner").post(`${base()}/${collection.id}/imports`, { fileId: await upload(staffFile(existingEmail)) });
    let batch = importBatchSchema.parse(started.body);
    expect(batch.mapping).toEqual({ name: "Full name", email: "Work email", size: "Size", personalization: "Chest name", branch: "Delivery branch" });
    expect(batch.counts).toMatchObject({ rows: 120, problems: 6, duplicates: 1, imported: 0, skipped: 0 });
    expect(lineOf(batch, 14).problems).toEqual([{ field: "size", message: "‘XXXXXL’ isn't an option (XS–4XL)" }]);
    expect(lineOf(batch, 27).problems).toEqual([{ field: "personalization", message: "‘OLUWABUKOLAAA’ is over 12 letters" }]);
    expect(lineOf(batch, 41).problems).toEqual([{ field: "branch", message: "‘Lekki Phase 1’ doesn't match a location" }]);
    expect(lineOf(batch, 58).problems).toEqual([{ field: "email", message: "Email is missing" }]);
    expect(lineOf(batch, 77).problems).toEqual([{ field: "personalization", message: "Contains unsupported characters" }]);
    expect(lineOf(batch, 97).problems).toEqual([{ field: "email", message: "Same email as line 96" }]);
    expect(lineOf(batch, 103).problems).toEqual([]);
    expect(lineOf(batch, 91).duplicateOf).not.toBeNull();

    // Everything at once is refused while rows need fixing; valid rows can go in first (B2B-FR-071).
    const refused = await api("acmeOwner").post(`${base()}/${collection.id}/imports/${batch.id}/import`, { partial: false, version: batch.version });
    expect(refused.body.context).toMatchObject({ reason: "ROWS_NEED_FIXING", lines: [14, 27, 41, 58, 77, 91, 97] });
    batch = importBatchSchema.parse((await api("acmeOwner").post(`${base()}/${collection.id}/imports/${batch.id}/import`, { partial: true, version: batch.version })).body);
    expect(batch.counts).toMatchObject({ imported: 113, skipped: 0 });
    expect(batch.rows.filter((row) => row.outcome === "PENDING").map((row) => row.line)).toEqual([14, 27, 41, 58, 77, 91, 97]);

    // Fix, skip and choose: line 14's size, skip line 58, merge line 91 into the existing person, fix the rest.
    const fix = async (line: number, body: Record<string, unknown>) => {
      batch = importBatchSchema.parse((await api("acmeOwner").put(`${base()}/${collection.id}/imports/${batch.id}/rows/${lineOf(batch, line).id}`, { ...body, version: batch.version })).body);
    };
    await fix(14, { values: { size: "XL" } });
    await fix(27, { values: { personalization: "BUKOLA" } });
    await fix(41, { values: { branch: "Lekki" } });
    await fix(58, { decision: "SKIP" });
    await fix(77, { values: { personalization: "BAD" } });
    await fix(91, { decision: "MERGE" });
    await fix(97, { values: { email: "staff96@example.com" } });
    expect(batch.counts).toMatchObject({ problems: 0, duplicates: 0 });
    batch = importBatchSchema.parse((await api("acmeOwner").post(`${base()}/${collection.id}/imports/${batch.id}/import`, { partial: false, version: batch.version })).body);

    // Every one of the 120 lines has an outcome: 119 imported, 1 skipped by choice, none waiting, none missing.
    expect(batch.counts).toMatchObject({ rows: 120, imported: 119, skipped: 1 });
    const stored = await db().select().from(schema.importRows).where(eq(schema.importRows.batchId, batch.id));
    expect(stored.map((row) => row.line).sort((a, b) => a - b)).toEqual(Array.from({ length: 120 }, (_, index) => index + 2));
    expect(stored.every((row) => row.outcome === "IMPORTED" || (row.outcome === "SKIPPED" && row.decision === "SKIP"))).toBe(true);
    // Each imported person remembers the batch and line; line 91 merged into the person who joined by link.
    const people = await db().select().from(schema.participants).where(eq(schema.participants.importBatchId, batch.id));
    expect(people).toHaveLength(118);
    expect(new Set(people.map((person) => person.importRow)).size).toBe(118);
    expect(people.find((person) => person.importRow === 103)).toMatchObject({ status: "NOT_STARTED", origin: "IMPORT:staff-2027.csv" });
    expect(people.find((person) => person.importRow === 2)).toMatchObject({ status: "SUBMITTED" });
    const merged = stored.find((row) => row.line === 91)!;
    const [existing] = await db().select().from(schema.participants).where(eq(schema.participants.id, merged.participantId!));
    expect(existing).toMatchObject({ email: existingEmail, origin: "LINK" });
    // Imported people get their invite link by email.
    const invites = await db().select({ id: schema.notifications.id }).from(schema.notifications).where(sql`${schema.notifications.template} = 'guest_link' and ${schema.notifications.recordId} in (select id::text from participants where import_batch_id = ${batch.id})`);
    expect(invites).toHaveLength(118);
    // The organizer's dashboard counts them: 117 complete from the file, plus line 103 and the existing person still to finish.
    const board = collectionDashboardSchema.parse((await api("acmeOwner").get(`${base()}/${collection.id}/dashboard`)).body);
    expect(board.progress).toMatchObject({ total: 119, submitted: 117, notStarted: 1, incomplete: 1 });
  });

  it("only organizers import, only their own checked CSV", async () => {
    const collection = await openCollection();
    const csv = "Name,Email\nAda,ada@example.com\n";
    expectForbidden(await api("acmeViewer").post(`${base()}/${collection.id}/imports`, { fileId: await upload(csv, "acmeViewer") }), "MANAGE_COLLECTIONS");
    // Someone else's upload, a file still being checked, and a file with no people.
    expectHidden(await api("acmeOwner").post(`${base()}/${collection.id}/imports`, { fileId: await upload(csv, "acmeLekkiManager") }));
    expect((await api("acmeOwner").post(`${base()}/${collection.id}/imports`, { fileId: await upload(csv, "acmeOwner", "PROCESSING") })).body.context?.reason).toBe("FILE_NOT_READY");
    expect((await api("acmeOwner").post(`${base()}/${collection.id}/imports`, { fileId: await upload("Name,Email\n") })).status).toBe(400);
    // Matching a column the file doesn't have is refused.
    const batch = importBatchSchema.parse((await api("acmeOwner").post(`${base()}/${collection.id}/imports`, { fileId: await upload(csv) })).body);
    expect((await api("acmeOwner").put(`${base()}/${collection.id}/imports/${batch.id}/mapping`, { mapping: { name: "Nope" }, version: batch.version })).status).toBe(400);
  });
});
