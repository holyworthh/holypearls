import { GARMENT_SIZES, type ImportBatch, type ImportField, type ParticipantAnswers, PERSONALIZATION_MAX } from "@holypearls/contracts";
import { and, type Database, desc, eq, inArray, schema, sql, type Transaction } from "@holypearls/db";
import type { StorageAdapter } from "@holypearls/storage";
import { parseCsv } from "../configuration/garment.js";
import { AppError } from "../errors.js";
import type { ActorContext } from "../identity/actor.js";
import { createGuestLink, ensureGuestCustomer, normalizeEmail } from "../identity/customers.js";
import { findFileForActor } from "../files/files.js";
import type { OrganizationDeps } from "../organizations/team.js";
import { recordAudit } from "../platform/audit.js";
import { queueEmail } from "../platform/notifications.js";
import { canSee, changeable, loadCollection } from "./collections.js";
import { requireMember } from "../organizations/members.js";

/*
 * CSV import (T12-03c; PRD-05 B2B-FR-070–073; TECH-04 §12; Pen 75). Upload →
 * match columns → check each row → fix problems and choose for duplicates →
 * import. A row is only ever IMPORTED, SKIPPED by an explicit choice, or still
 * waiting (PENDING) to be fixed: nothing is silently dropped or overwritten.
 * Each imported participant remembers its batch and line. CSV contents are
 * never logged.
 */

type Db = Database | Transaction;
type BatchRow = typeof schema.importBatches.$inferSelect;
type RowRecord = typeof schema.importRows.$inferSelect;
type Values = Partial<Record<ImportField, string | null>>;
type Problem = { field: string; message: string };
const MAX_ROWS = 5_000;
const NAME_CHARACTERS = /^[A-Za-z0-9 .'-]*$/;

/** Columns guessed from their headers ("Work email" → email, "Chest name" → personalization). */
const GUESSES: [ImportField, RegExp][] = [
  ["email", /e-?mail/i],
  ["personalization", /chest|embroider|print|personal|name on/i],
  ["name", /name/i],
  ["size", /size/i],
  ["quantity", /qty|quantity|how many/i],
  ["colour", /colou?r/i],
  ["branch", /branch|location|site|office/i],
];

/** The fields this collection uses: name and email always, then what the organizer allowed. */
function fieldsFor(collection: typeof schema.groupCollections.$inferSelect): ImportField[] {
  const allowed = collection.fields as string[];
  return [
    "name",
    "email",
    ...(allowed.includes("SIZE") ? (["size"] as const) : []),
    ...(allowed.includes("PERSONALIZATION") ? (["personalization"] as const) : []),
    ...(allowed.includes("QUANTITY") ? (["quantity"] as const) : []),
    ...(allowed.includes("COLOUR") ? (["colour"] as const) : []),
    ...(collection.deliveryMode === "BRANCHES" ? (["branch"] as const) : []),
  ];
}

function guessMapping(headers: readonly string[], fields: readonly ImportField[]) {
  const mapping: Partial<Record<ImportField, string | null>> = {};
  const used = new Set<string>();
  for (const [field, pattern] of GUESSES) {
    if (!fields.includes(field)) continue;
    const header = headers.find((item) => !used.has(item) && pattern.test(item));
    mapping[field] = header ?? null;
    if (header) used.add(header);
  }
  return mapping;
}

const normalSize = (value: string) => value.trim().toUpperCase().replace(/^XXXL$/, "3XL").replace(/^XXL$/, "2XL");

/** Every problem in one row (Pen 75 "6 rows need fixing"), with words an organizer can act on. */
function check(values: Values, fields: readonly ImportField[], branches: readonly { id: string; name: string }[]): Problem[] {
  const problems: Problem[] = [];
  if (!values.name?.trim()) problems.push({ field: "name", message: "Name is missing" });
  if (!values.email?.trim()) problems.push({ field: "email", message: "Email is missing" });
  else if (!/^\S+@\S+\.\S+$/.test(values.email.trim())) problems.push({ field: "email", message: `‘${values.email}’ isn't an email address` });
  if (fields.includes("size") && values.size && !(GARMENT_SIZES as readonly string[]).includes(normalSize(values.size))) problems.push({ field: "size", message: `‘${values.size}’ isn't an option (${GARMENT_SIZES[0]}–${GARMENT_SIZES.at(-1)})` });
  if (fields.includes("personalization") && values.personalization) {
    if (values.personalization.length > PERSONALIZATION_MAX) problems.push({ field: "personalization", message: `‘${values.personalization}’ is over ${PERSONALIZATION_MAX} letters` });
    else if (!NAME_CHARACTERS.test(values.personalization)) problems.push({ field: "personalization", message: "Contains unsupported characters" });
  }
  if (fields.includes("quantity") && values.quantity && !/^([1-9]|[1-4]\d|50)$/.test(values.quantity.trim())) problems.push({ field: "quantity", message: `‘${values.quantity}’ isn't a quantity from 1 to 50` });
  if (fields.includes("branch")) {
    if (!values.branch?.trim()) problems.push({ field: "branch", message: "Branch is missing" });
    else if (!branches.some((branch) => branch.name.toLowerCase() === values.branch!.trim().toLowerCase())) problems.push({ field: "branch", message: `‘${values.branch}’ doesn't match a location` });
  }
  return problems;
}

async function branchesOf(db: Db, collection: typeof schema.groupCollections.$inferSelect) {
  return collection.branchLocationIds.length ? db.select({ id: schema.locations.id, name: schema.locations.name }).from(schema.locations).where(inArray(schema.locations.id, collection.branchLocationIds)) : [];
}

/** Re-checks every row and its duplicates: the same email as someone already in the collection, or earlier in this file. */
async function recheck(tx: Transaction, collection: typeof schema.groupCollections.$inferSelect, batch: BatchRow) {
  const fields = fieldsFor(collection);
  const branches = await branchesOf(tx, collection);
  const rows = await tx.select().from(schema.importRows).where(eq(schema.importRows.batchId, batch.id)).orderBy(schema.importRows.line);
  const existing = await tx.select({ id: schema.participants.id, email: schema.participants.email, status: schema.participants.status }).from(schema.participants).where(eq(schema.participants.collectionId, collection.id));
  const byEmail = new Map(existing.filter((person) => person.status !== "REMOVED").map((person) => [normalizeEmail(person.email), person.id]));
  const seen = new Map<string, string>();
  for (const row of rows) {
    if (row.outcome !== "PENDING") continue;
    const values = row.values as Values;
    const problems = check(values, fields, branches);
    const email = values.email?.trim() ? normalizeEmail(values.email) : null;
    const duplicateOf = email ? (byEmail.get(email) ?? null) : null;
    const earlier = email ? seen.get(email) : undefined;
    if (email && !duplicateOf) seen.set(email, row.id);
    if (earlier) problems.push({ field: "email", message: `Same email as line ${rows.find((other) => other.id === earlier)?.line}` });
    await tx.update(schema.importRows).set({ problems, duplicateOfParticipantId: duplicateOf }).where(eq(schema.importRows.id, row.id));
  }
}

function mapped(raw: readonly string[], headers: readonly string[], mapping: Values): Values {
  const values: Values = {};
  for (const [field, header] of Object.entries(mapping) as [ImportField, string | null][]) {
    const index = header ? headers.indexOf(header) : -1;
    values[field] = index >= 0 ? (raw[index] ?? "").trim() || null : null;
  }
  return values;
}

async function view(db: Db, collection: typeof schema.groupCollections.$inferSelect, batch: BatchRow): Promise<ImportBatch> {
  const rows = await db.select().from(schema.importRows).where(eq(schema.importRows.batchId, batch.id)).orderBy(schema.importRows.line);
  const pending = rows.filter((row) => row.outcome === "PENDING");
  const problem = (row: RowRecord) => (row.problems as Problem[]).length > 0;
  return {
    id: batch.id,
    fileName: batch.fileName,
    status: batch.status as ImportBatch["status"],
    headers: batch.headers,
    mapping: batch.mapping as ImportBatch["mapping"],
    fields: fieldsFor(collection),
    counts: {
      rows: rows.length,
      ready: pending.filter((row) => !problem(row) && (!row.duplicateOfParticipantId || (row.decision !== null && row.decision !== "SKIP"))).length,
      problems: pending.filter((row) => problem(row) && row.decision !== "SKIP").length,
      duplicates: pending.filter((row) => row.duplicateOfParticipantId && !row.decision).length,
      imported: rows.filter((row) => row.outcome === "IMPORTED").length,
      skipped: rows.filter((row) => row.outcome === "SKIPPED").length,
    },
    rows: rows.map((row) => ({
      id: row.id,
      line: row.line,
      values: row.values as Record<string, string | null>,
      problems: row.problems as Problem[],
      duplicateOf: row.duplicateOfParticipantId,
      decision: row.decision as ImportBatch["rows"][number]["decision"],
      outcome: row.outcome as ImportBatch["rows"][number]["outcome"],
    })),
    version: batch.version,
  };
}

async function loadBatch(db: Db, collectionId: string, batchId: string, options: { lock?: boolean } = {}) {
  const query = db.select().from(schema.importBatches).where(and(eq(schema.importBatches.id, batchId), eq(schema.importBatches.collectionId, collectionId)));
  const [batch] = options.lock ? await query.for("update") : await query;
  if (!batch) throw new AppError("NOT_FOUND");
  return batch;
}

const IMPORTABLE = ["DRAFT", "OPEN", "PAUSED", "CLOSED", "NEEDS_REVIEW", "READY_TO_ORDER"];

export async function listImports(db: Database, actor: ActorContext, organizationId: string, collectionId: string) {
  const member = await requireMember(db, actor, organizationId);
  const collection = await loadCollection(db, organizationId, collectionId);
  if (!canSee(member, collection)) throw new AppError("NOT_FOUND");
  const batches = await db.select().from(schema.importBatches).where(eq(schema.importBatches.collectionId, collectionId)).orderBy(desc(schema.importBatches.createdAt));
  const result = [];
  for (const batch of batches) {
    const rows = await db.select({ outcome: schema.importRows.outcome }).from(schema.importRows).where(eq(schema.importRows.batchId, batch.id));
    result.push({ id: batch.id, fileName: batch.fileName, status: batch.status, rows: rows.length, imported: rows.filter((row) => row.outcome === "IMPORTED").length, createdAt: batch.createdAt.toISOString() });
  }
  return { batches: result };
}

export async function getImport(db: Database, actor: ActorContext, organizationId: string, collectionId: string, batchId: string) {
  const member = await requireMember(db, actor, organizationId);
  const collection = await loadCollection(db, organizationId, collectionId);
  if (!canSee(member, collection)) throw new AppError("NOT_FOUND");
  return view(db, collection, await loadBatch(db, collectionId, batchId));
}

export async function canSeeImportFile(db: Database, actor: ActorContext, batchId: string) {
  if (actor.type !== "user") return false;
  const [row] = await db.select({ collection: schema.groupCollections }).from(schema.importBatches)
    .innerJoin(schema.groupCollections, eq(schema.groupCollections.id, schema.importBatches.collectionId)).where(eq(schema.importBatches.id, batchId));
  if (!row) return false;
  const member = await requireMember(db, actor, row.collection.organizationId).catch(error => {
    if (error instanceof AppError && error.code === "NOT_FOUND") return null;
    throw error;
  });
  return Boolean(member && canSee(member, row.collection));
}

/** Upload (step 1): read the organizer's own checked CSV into a batch, one row per line, and guess the columns. */
export async function startImport(deps: OrganizationDeps & { storage: StorageAdapter }, actor: ActorContext, organizationId: string, collectionId: string, fileId: string): Promise<ImportBatch> {
  const db = deps.db;
  const { member, row: collection } = await changeable(db, actor, organizationId, collectionId);
  if (!IMPORTABLE.includes(collection.status)) throw new AppError("RULE_FAILED", { message: "People can't be added to this collection now.", context: { reason: "WRONG_STATUS" } });
  const file = await findFileForActor(db, actor, fileId).catch(() => null);
  if (!file || file.purpose !== "CSV_IMPORT") throw new AppError("NOT_FOUND");
  if (file.status !== "READY") throw new AppError("RULE_FAILED", { message: "The file is still being checked. Try again in a moment.", context: { reason: "FILE_NOT_READY" } });
  const table = parseCsv((await deps.storage.read(file.storageKey)).toString("utf8"));
  if (table.length < 2) throw new AppError("VALIDATION_FAILED", { fieldErrors: { fileId: "The file needs a header row and at least one person." } });
  if (table.length - 1 > MAX_ROWS) throw new AppError("VALIDATION_FAILED", { fieldErrors: { fileId: `Up to ${MAX_ROWS.toLocaleString("en-NG")} rows at a time.` } });
  const headers = table[0]!.map((header, index) => header.trim() || `Column ${index + 1}`);
  const fields = fieldsFor(collection);
  const mapping = guessMapping(headers, fields);
  const batchId = await db.transaction(async (tx) => {
    const [batch] = await tx.insert(schema.importBatches).values({ collectionId, fileId: file.id, fileName: file.originalName, headers, mapping, createdByUserId: member.userId, status: "CHECKED" }).returning();
    const lines = table.slice(1);
    for (let start = 0; start < lines.length; start += 500) {
      await tx.insert(schema.importRows).values(lines.slice(start, start + 500).map((raw, index) => ({ batchId: batch!.id, line: start + index + 2, raw, values: mapped(raw, headers, mapping) })));
    }
    await tx.update(schema.files).set({ ownerType: "IMPORT_BATCH", ownerId: batch!.id, attachedAt: actor.now }).where(eq(schema.files.id, file.id));
    await recheck(tx, collection, batch!);
    await recordAudit(tx, actor, { action: "collection.import_started", summary: `CSV import started: ${lines.length} rows (${collection.title})`, recordType: "GROUP_COLLECTION", recordId: collectionId, after: { batchId: batch!.id, rows: lines.length } });
    return batch!.id;
  });
  return view(db, collection, await loadBatch(db, collectionId, batchId));
}

/** Match columns (step 2): every row's values are read again from the file's cells and checked. */
export async function matchColumns(db: Database, actor: ActorContext, organizationId: string, collectionId: string, batchId: string, input: { mapping: Values; version: number }): Promise<ImportBatch> {
  const { row: collection } = await changeable(db, actor, organizationId, collectionId);
  const fields = fieldsFor(collection);
  await db.transaction(async (tx) => {
    const batch = await loadBatch(tx, collectionId, batchId, { lock: true });
    if (batch.version !== input.version) throw new AppError("VERSION_CONFLICT", { context: { currentVersion: batch.version } });
    if (batch.status === "CANCELLED") throw new AppError("RULE_FAILED", { message: "This import was cancelled.", context: { reason: "CANCELLED" } });
    const mapping: Values = {};
    for (const field of fields) {
      const header = input.mapping[field] ?? null;
      if (header && !batch.headers.includes(header)) throw new AppError("VALIDATION_FAILED", { fieldErrors: { [`mapping.${field}`]: "Choose one of the file's columns" } });
      mapping[field] = header;
    }
    const rows = await tx.select().from(schema.importRows).where(and(eq(schema.importRows.batchId, batchId), eq(schema.importRows.outcome, "PENDING")));
    for (const row of rows) await tx.update(schema.importRows).set({ values: mapped(row.raw, batch.headers, mapping) }).where(eq(schema.importRows.id, row.id));
    await tx.update(schema.importBatches).set({ mapping, status: "CHECKED", version: batch.version + 1, updatedAt: actor.now }).where(eq(schema.importBatches.id, batchId));
    await recheck(tx, collection, { ...batch, mapping });
  });
  return view(db, collection, await loadBatch(db, collectionId, batchId));
}

/** Fix a row's values, or choose what to do with a duplicate or a problem row (B2B-FR-072): merge, keep both, replace or skip. */
export async function fixRow(db: Database, actor: ActorContext, organizationId: string, collectionId: string, batchId: string, rowId: string, input: { values?: Values; decision?: string | null; version: number }): Promise<ImportBatch> {
  const { row: collection } = await changeable(db, actor, organizationId, collectionId);
  await db.transaction(async (tx) => {
    const batch = await loadBatch(tx, collectionId, batchId, { lock: true });
    if (batch.version !== input.version) throw new AppError("VERSION_CONFLICT", { context: { currentVersion: batch.version } });
    const [row] = await tx.select().from(schema.importRows).where(and(eq(schema.importRows.id, rowId), eq(schema.importRows.batchId, batchId)));
    if (!row) throw new AppError("NOT_FOUND");
    if (row.outcome !== "PENDING") throw new AppError("RULE_FAILED", { message: "This row was already imported or skipped.", context: { reason: "ROW_DONE" } });
    if (input.decision && input.decision !== "SKIP" && !row.duplicateOfParticipantId) throw new AppError("VALIDATION_FAILED", { fieldErrors: { decision: "Only a duplicate needs that choice." } });
    await tx
      .update(schema.importRows)
      .set({ ...(input.values && { values: { ...(row.values as Values), ...input.values } }), ...(input.decision !== undefined && { decision: input.decision }) })
      .where(eq(schema.importRows.id, rowId));
    await tx.update(schema.importBatches).set({ version: batch.version + 1, updatedAt: actor.now }).where(eq(schema.importBatches.id, batchId));
    await recheck(tx, collection, batch);
  });
  return view(db, collection, await loadBatch(db, collectionId, batchId));
}

function answersFrom(values: Values, branches: readonly { id: string; name: string }[]): ParticipantAnswers {
  return {
    size: values.size ? normalSize(values.size) : null,
    sizeUnsure: false,
    personalization: values.personalization ? values.personalization.toUpperCase() : null,
    quantity: values.quantity ? Number(values.quantity) : null,
    colour: values.colour ?? null,
    branchLocationId: values.branch ? (branches.find((branch) => branch.name.toLowerCase() === values.branch!.trim().toLowerCase())?.id ?? null) : null,
  };
}

/** Complete when every field the collection asks for is there: they're SUBMITTED; otherwise NOT_STARTED and they fill in the rest. */
function complete(answers: ParticipantAnswers, fields: readonly ImportField[]) {
  return (!fields.includes("size") || Boolean(answers.size)) && (!fields.includes("branch") || Boolean(answers.branchLocationId));
}

/**
 * Import (step 4). Rows with problems or an undecided duplicate stop the
 * import unless `partial` is chosen (B2B-FR-071), in which case they stay
 * PENDING to be fixed later. SKIP rows become SKIPPED. Everyone imported gets
 * a personal invite link by email ("Imported people get an invite link").
 */
export async function runImport(deps: OrganizationDeps, actor: ActorContext, organizationId: string, collectionId: string, batchId: string, input: { partial: boolean; version: number }): Promise<ImportBatch> {
  const db = deps.db;
  const { row: collection } = await changeable(db, actor, organizationId, collectionId);
  if (!IMPORTABLE.includes(collection.status)) throw new AppError("RULE_FAILED", { message: "People can't be added to this collection now.", context: { reason: "WRONG_STATUS" } });
  const fields = fieldsFor(collection);
  await db.transaction(async (tx) => {
    const batch = await loadBatch(tx, collectionId, batchId, { lock: true });
    if (batch.version !== input.version) throw new AppError("VERSION_CONFLICT", { context: { currentVersion: batch.version } });
    if (batch.status === "CANCELLED") throw new AppError("RULE_FAILED", { message: "This import was cancelled.", context: { reason: "CANCELLED" } });
    const branches = await branchesOf(tx, collection);
    const rows = (await tx.select().from(schema.importRows).where(and(eq(schema.importRows.batchId, batchId), eq(schema.importRows.outcome, "PENDING")))).sort((a, b) => a.line - b.line);
    const blocked = rows.filter((row) => row.decision !== "SKIP" && ((row.problems as Problem[]).length > 0 || (row.duplicateOfParticipantId && !row.decision)));
    if (blocked.length && !input.partial) {
      throw new AppError("RULE_FAILED", { message: `${blocked.length} ${blocked.length === 1 ? "row needs" : "rows need"} fixing first, or import the valid rows now and fix the others later.`, context: { reason: "ROWS_NEED_FIXING", lines: blocked.map((row) => row.line) } });
    }
    let imported = 0;
    for (const row of rows) {
      if (row.decision === "SKIP") {
        await tx.update(schema.importRows).set({ outcome: "SKIPPED" }).where(eq(schema.importRows.id, row.id));
        continue;
      }
      if (blocked.includes(row)) continue;
      const values = row.values as Values;
      const answers = answersFrom(values, branches);
      const status = complete(answers, fields) ? "SUBMITTED" : "NOT_STARTED";
      let participantId: string;
      if (row.duplicateOfParticipantId && (row.decision === "MERGE" || row.decision === "REPLACE")) {
        // MERGE fills in what's missing; REPLACE takes the file's answers. Either way it's the same person, so no new participant.
        participantId = row.duplicateOfParticipantId;
        const [submission] = await tx.select().from(schema.participantSubmissions).where(eq(schema.participantSubmissions.participantId, participantId));
        const current = (submission?.answers ?? {}) as Partial<ParticipantAnswers>;
        const next = row.decision === "REPLACE" ? answers : { ...answers, ...Object.fromEntries(Object.entries(current).filter(([, value]) => value !== null && value !== false && value !== undefined)) };
        await tx.update(schema.participantSubmissions).set({ answers: next, updatedAt: actor.now }).where(eq(schema.participantSubmissions.participantId, participantId));
      } else {
        const customer = await ensureGuestCustomer(tx, { email: values.email!, name: values.name! });
        const [participant] = await tx
          .insert(schema.participants)
          .values({ collectionId, customerId: customer.id, name: values.name!.trim(), email: values.email!.trim(), status, origin: `IMPORT:${batch.fileName}`, importBatchId: batchId, importRow: row.line })
          .returning();
        participantId = participant!.id;
        await tx.insert(schema.participantSubmissions).values({ participantId, answers, submittedAt: status === "SUBMITTED" ? actor.now : null });
        if (collection.status === "OPEN" || collection.status === "DRAFT" || collection.status === "PAUSED") {
          const link = await createGuestLink(tx, deps.webOrigin, { purpose: "COLLECTION_SUBMISSION", targetType: "PARTICIPANT", targetId: participantId, customerId: customer.id, now: actor.now });
          await queueEmail(deps, tx, {
            template: "guest_link",
            to: values.email!.trim(),
            customerId: customer.id,
            data: { url: link.url, what: `answers for ${collection.title}` },
            record: { type: "PARTICIPANT", id: participantId, label: collection.title },
            linkLabel: "Opens your answers for the group collection",
            requestId: actor.requestId,
          });
        }
      }
      await tx.update(schema.importRows).set({ outcome: "IMPORTED", participantId }).where(eq(schema.importRows.id, row.id));
      imported += 1;
    }
    await tx.update(schema.importBatches).set({ status: "IMPORTED", importedAt: actor.now, version: batch.version + 1, updatedAt: actor.now }).where(eq(schema.importBatches.id, batchId));
    await recordAudit(tx, actor, {
      action: "collection.imported",
      summary: `CSV import: ${imported} rows imported from ${batch.fileName} (${collection.title})`,
      recordType: "GROUP_COLLECTION",
      recordId: collectionId,
      after: { batchId, imported, waiting: blocked.length, partial: input.partial },
    });
  });
  return view(db, collection, await loadBatch(db, collectionId, batchId));
}

/** Retained attachments and snapshots must survive upload cleanup. */
export function importRetainsFile(fileId: string) {
  return sql`exists (select 1 from import_batches where file_id = ${fileId}::uuid)`;
}
