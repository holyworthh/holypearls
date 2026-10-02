import {
  type AdminProject,
  type AdminQuote,
  type AdminRequestSummary,
  BRAND_READINESS,
  COMMON_QUESTIONS,
  NOT_SURE,
  OPEN_ITEM_LABEL,
  type Project,
  PROJECT_QUESTIONS,
  PROJECT_TYPE_INFO,
  type ProjectQuestion,
  type QuoteSettings,
  type QuoteSettingsInput,
  type QuoteVersion,
  type SaveQuoteVersion,
  type ScheduleEntry,
} from "@holypearls/contracts";
import { and, asc, type Database, desc, eq, inArray, isNotNull, schema, sql } from "@holypearls/db";
import { currentTaxSetting } from "../catalogue/rules.js";
import { AppError } from "../errors.js";
import { type ActorContext, requireRecentMfa } from "../identity/actor.js";
import { createGuestLink, ensureGuestCustomer } from "../identity/customers.js";
import { displayMoney } from "../orders/orders.js";
import { recordAudit } from "../platform/audit.js";
import { type NotificationDeps, queueEmail } from "../platform/notifications.js";
import { quoteTotals, schedulePayments } from "./quote-math.js";

/*
 * Project submissions, the staff request queue and the quote builder
 * (T05-03; OPS-FR-030–034, 040, QUOTE-FR-001, 006; TECH-01 §4–5, TECH-05 §4).
 * Staff need QUOTE_MANAGE (checked by the controller's guard). A sent
 * version never changes: the service refuses it and a database trigger
 * backs that up (migration 0029).
 */

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type VersionRow = typeof schema.quoteVersions.$inferSelect;
type QuoteRow = typeof schema.quotes.$inferSelect;

const DAY = 86_400_000;
const LIST_LIMIT = 100;
const staffId = (actor: ActorContext) => (actor.type === "user" ? (actor.staff?.staffProfileId ?? null) : null);
const formatMoney = (minor: bigint, currency: string) => displayMoney(minor, currency);
const day = (at: Date) => at.toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lagos" });

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export async function getQuoteSettings(db: Database | Tx): Promise<QuoteSettings> {
  const [row] = await db
    .select({ settings: schema.quoteSettings, by: schema.staffProfiles.displayName })
    .from(schema.quoteSettings)
    .leftJoin(schema.staffProfiles, eq(schema.staffProfiles.id, schema.quoteSettings.updatedByStaffId))
    .where(eq(schema.quoteSettings.id, 1));
  if (!row) throw new AppError("INTERNAL", { message: "Quote settings are missing." });
  const { settings, by } = row;
  return {
    validDays: settings.validDays,
    expiringNoticeDays: settings.expiringNoticeDays,
    defaultSchedule: settings.defaultSchedule as ScheduleEntry[],
    defaultTerms: settings.defaultTerms,
    version: settings.version,
    updatedAt: settings.updatedAt.toISOString(),
    updatedBy: by,
  };
}

/** The default schedule and validity (TECH-05 §4). High-risk: it decides what customers pay, so it needs a recent authenticator check. */
export async function saveQuoteSettings(db: Database, actor: ActorContext, input: QuoteSettingsInput): Promise<QuoteSettings> {
  requireRecentMfa(actor);
  const sample = schedulePayments(10_000_000n, input.defaultSchedule);
  if (!sample.ok) throw new AppError("VALIDATION_FAILED", { fieldErrors: { defaultSchedule: sample.problem } });
  if (input.defaultSchedule.some((entry) => entry.kind === "AMOUNT")) {
    throw new AppError("VALIDATION_FAILED", { fieldErrors: { defaultSchedule: "The default schedule uses percentages, so it fits any total." } });
  }
  const before = await getQuoteSettings(db);
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(schema.quoteSettings)
      .set({
        validDays: input.validDays,
        expiringNoticeDays: input.expiringNoticeDays,
        defaultSchedule: input.defaultSchedule,
        defaultTerms: input.defaultTerms,
        version: sql`${schema.quoteSettings.version} + 1`,
        updatedByStaffId: staffId(actor),
        updatedAt: new Date(),
      })
      .where(and(eq(schema.quoteSettings.id, 1), eq(schema.quoteSettings.version, input.version)))
      .returning({ id: schema.quoteSettings.id });
    if (!row) throw new AppError("VERSION_CONFLICT", { context: { latest: before } });
    await recordAudit(tx, actor, {
      action: "quote_settings.saved",
      summary: `Quote settings: valid ${input.validDays} days, reminder ${input.expiringNoticeDays} days before, ${input.defaultSchedule.length} default payments`,
      recordType: "QUOTE_SETTINGS",
      before: { validDays: before.validDays, expiringNoticeDays: before.expiringNoticeDays, defaultSchedule: before.defaultSchedule },
      after: { validDays: input.validDays, expiringNoticeDays: input.expiringNoticeDays, defaultSchedule: input.defaultSchedule },
      permission: "QUOTE_MANAGE",
    });
  });
  return getQuoteSettings(db);
}

/* ------------------------------------------------------------------ */
/* The request queue (OPS-FR-030, Pen 124B)                            */
/* ------------------------------------------------------------------ */

type ContactJson = { name?: string | null; email: string };

/** New and in-review projects and configuration quote requests, oldest first. `done` lists those already quoted. */
export async function listRequests(db: Database, filter: { view?: string }): Promise<{ items: AdminRequestSummary[]; nextCursor: null }> {
  const done = filter.view === "quoted";
  const projectStatuses = done ? (["QUOTED", "ORDERED"] as const) : (["SUBMITTED", "UNDER_REVIEW"] as const);
  const projects = await db
    .select({ project: schema.projects, quote: { id: schema.quotes.id, reference: schema.quotes.reference, status: schema.quotes.status }, guest: sql<boolean>`${schema.projects.ownerUserId} is null` })
    .from(schema.projects)
    .leftJoin(schema.quotes, eq(schema.quotes.projectId, schema.projects.id))
    .where(and(inArray(schema.projects.status, [...projectStatuses]), isNotNull(schema.projects.submittedAt)))
    .orderBy(asc(schema.projects.submittedAt))
    .limit(LIST_LIMIT);
  const quoteStatuses = done ? (["READY", "ACCEPTED", "DECLINED", "EXPIRED"] as const) : (["PENDING_REVIEW", "REVISION_REQUESTED"] as const);
  const configurationQuotes = await db
    .select({ quote: schema.quotes, guest: sql<boolean>`${schema.customers.userId} is null` })
    .from(schema.quotes)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.quotes.customerId))
    .where(and(isNotNull(schema.quotes.configurationId), inArray(schema.quotes.status, [...quoteStatuses])))
    .orderBy(asc(schema.quotes.createdAt))
    .limit(LIST_LIMIT);
  const items: AdminRequestSummary[] = [
    ...projects.map(({ project, quote, guest }) => {
      const contact = project.contact as ContactJson | null;
      const neededBy = (project.answers as Record<string, unknown>).neededBy;
      return {
        kind: "PROJECT" as const,
        id: project.id,
        reference: project.reference!,
        title: project.title || PROJECT_TYPE_INFO[project.type].label,
        customer: contact?.name || contact?.email || "Customer",
        guest,
        submittedAt: project.submittedAt!.toISOString(),
        status: project.status,
        quote: quote?.id ? { id: quote.id, reference: quote.reference!, status: quote.status! } : null,
        neededBy: typeof neededBy === "string" && neededBy !== NOT_SURE ? neededBy : null,
      };
    }),
    ...configurationQuotes.map(({ quote, guest }) => {
      const snapshot = quote.requestSnapshot as { productName?: string; quantity?: number | null };
      const contact = quote.contact as ContactJson;
      return {
        kind: "CONFIGURATION" as const,
        id: quote.id,
        reference: quote.reference,
        title: [snapshot.productName ?? "Configuration", snapshot.quantity ? `× ${snapshot.quantity}` : null].filter(Boolean).join(" "),
        customer: contact.name || contact.email,
        guest,
        submittedAt: quote.createdAt.toISOString(),
        status: quote.status,
        quote: { id: quote.id, reference: quote.reference, status: quote.status },
        neededBy: null,
      };
    }),
  ].sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
  return { items: items.slice(0, LIST_LIMIT), nextCursor: null };
}

function answerText(question: ProjectQuestion, value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (value === NOT_SURE) return "Not sure yet";
  if (question.kind === "YES_NO") return value === "YES" ? "Yes" : "No";
  if (question.kind === "CHOICE" || question.kind === "MULTI") {
    const values = Array.isArray(value) ? value : [value];
    return values.map((item) => question.options.find((option) => option.value === item)?.label ?? String(item)).join(", ");
  }
  return typeof value === "number" ? value.toLocaleString("en-NG") : String(value);
}

/** Everything the customer sent, as submitted (OPS-FR-030; Pen 124B "Everything the customer sent"). */
export async function getAdminProject(db: Database, id: string): Promise<AdminProject> {
  const [row] = await db
    .select({ project: schema.projects, quote: { id: schema.quotes.id, reference: schema.quotes.reference, status: schema.quotes.status }, ownerUserId: schema.projects.ownerUserId })
    .from(schema.projects)
    .leftJoin(schema.quotes, eq(schema.quotes.projectId, schema.projects.id))
    .where(eq(schema.projects.id, id));
  if (!row || !row.project.submittedSnapshot) throw new AppError("NOT_FOUND");
  const { project } = row;
  const snapshot = project.submittedSnapshot as Project;
  const steps: [string, ProjectQuestion[]][] = [
    ["Project", PROJECT_QUESTIONS[project.type].project],
    ["Scale", PROJECT_QUESTIONS[project.type].scale],
    ["Date & location", COMMON_QUESTIONS.filter((question) => !["brand", "brandNote"].includes(question.key))],
    ["Brand", COMMON_QUESTIONS.filter((question) => ["brand", "brandNote"].includes(question.key))],
  ];
  const brief = steps.flatMap(([step, questions]) =>
    questions.flatMap((question) => {
      const answer = question.key === "brand" && Array.isArray(snapshot.answers.brand) ? BRAND_READINESS.filter((item) => (snapshot.answers.brand as string[]).includes(item.value)).map((item) => item.label).join(", ") : answerText(question, snapshot.answers[question.key]);
      return answer ? [{ step, question: question.label, answer }] : [];
    }),
  );
  const items = [
    ...snapshot.recommendations
      .filter((rec) => rec.state === "INCLUDED")
      .map((rec) => ({ name: rec.name, detail: `${rec.group === "RECOMMENDED" ? "Recommended" : rec.group === "USEFUL" ? "Useful addition" : "Optional"} · ${rec.reason}`, quantity: rec.customerQuantity ?? rec.suggestedQuantity, kind: rec.product ? "Catalogue" : "Described item" })),
    ...snapshot.items.map((item) => ({ name: item.name, detail: [item.description, item.quantityNote].filter(Boolean).join(" · "), quantity: item.quantity, kind: item.kind === "CUSTOM" ? "Custom item" : "Catalogue" })),
  ];
  const contact = project.contact as ContactJson;
  return {
    id: project.id,
    reference: project.reference!,
    type: project.type,
    title: project.title,
    status: project.status,
    submittedAt: project.submittedAt!.toISOString(),
    contact: { name: contact.name ?? null, email: contact.email, guest: row.ownerUserId === null },
    brief,
    items,
    files: snapshot.files.map((file) => ({ id: file.fileId, name: file.name, status: file.status, item: file.itemId ? (snapshot.items.find((item) => item.id === file.itemId)?.name ?? null) : null })),
    openItems: snapshot.openItems.map((item) => OPEN_ITEM_LABEL[item]),
    quote: row.quote?.id ? { id: row.quote.id, reference: row.quote.reference!, status: row.quote.status! } : null,
    version: project.version,
  };
}

/** Start review: SUBMITTED → UNDER_REVIEW (TECH-01 §4). Audited. */
export async function startReview(db: Database, actor: ActorContext, id: string) {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(schema.projects)
      .set({ status: "UNDER_REVIEW", version: sql`${schema.projects.version} + 1` })
      .where(and(eq(schema.projects.id, id), eq(schema.projects.status, "SUBMITTED")))
      .returning({ reference: schema.projects.reference });
    if (!row) {
      const [current] = await tx.select({ status: schema.projects.status }).from(schema.projects).where(eq(schema.projects.id, id));
      if (!current) throw new AppError("NOT_FOUND");
      throw new AppError("CONFLICT", { message: `This project is ${current.status.toLowerCase().replace("_", " ")}.`, context: { reason: "NOT_SUBMITTED", status: current.status } });
    }
    await recordAudit(tx, actor, { action: "project.review_started", summary: `Started reviewing ${row.reference}`, recordType: "PROJECT", recordId: id, recordLabel: row.reference, permission: "QUOTE_MANAGE" });
  });
  return getAdminProject(db, id);
}

/* ------------------------------------------------------------------ */
/* Quotes and versions (OPS-FR-031–034, Pen 111)                       */
/* ------------------------------------------------------------------ */

export async function listQuotes(db: Database, filter: { status?: string }) {
  const rows = await db
    .select({ quote: schema.quotes, project: { title: schema.projects.title, type: schema.projects.type } })
    .from(schema.quotes)
    .leftJoin(schema.projects, eq(schema.projects.id, schema.quotes.projectId))
    .where(filter.status ? eq(schema.quotes.status, filter.status as QuoteRow["status"]) : undefined)
    .orderBy(desc(schema.quotes.updatedAt))
    .limit(LIST_LIMIT);
  const latest = rows.length
    ? await db
        .select({ quoteId: schema.quoteVersions.quoteId, number: schema.quoteVersions.number, totalMinor: schema.quoteVersions.totalMinor, currency: schema.quoteVersions.currency })
        .from(schema.quoteVersions)
        .where(inArray(schema.quoteVersions.quoteId, rows.map(({ quote }) => quote.id)))
        .orderBy(desc(schema.quoteVersions.number))
    : [];
  return {
    items: rows.map(({ quote, project }) => {
      const version = latest.find((item) => item.quoteId === quote.id);
      const snapshot = quote.requestSnapshot as { productName?: string };
      const contact = quote.contact as ContactJson;
      return {
        id: quote.id,
        reference: quote.reference,
        status: quote.status,
        title: project?.type ? project.title || PROJECT_TYPE_INFO[project.type].label : (snapshot.productName ?? "Configuration"),
        customer: contact.name || contact.email,
        latestVersion: version?.number ?? null,
        totalMinor: version ? version.totalMinor.toString() : null,
        currency: version ? (version.currency as "NGN" | "USD") : null,
        updatedAt: quote.updatedAt.toISOString(),
      };
    }),
    nextCursor: null,
  };
}

async function loadQuote(db: Database | Tx, id: string): Promise<QuoteRow> {
  const [row] = await db.select().from(schema.quotes).where(eq(schema.quotes.id, id));
  if (!row) throw new AppError("NOT_FOUND");
  return row;
}

async function versionView(db: Database | Tx, row: VersionRow): Promise<QuoteVersion> {
  const lines = await db.select().from(schema.quoteLineItems).where(eq(schema.quoteLineItems.quoteVersionId, row.id)).orderBy(asc(schema.quoteLineItems.position));
  const [sentBy] = row.sentByStaffId ? await db.select({ name: schema.staffProfiles.displayName }).from(schema.staffProfiles).where(eq(schema.staffProfiles.id, row.sentByStaffId)) : [];
  const schedule = row.schedule as ScheduleEntry[];
  const payments = schedulePayments(row.totalMinor, schedule);
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    currency: row.currency as "NGN" | "USD",
    lines: lines.map((line) => ({ id: line.id, source: line.source, sourceKey: line.sourceKey, title: line.title, summary: line.summary, quantity: line.quantity, unitMinor: line.unitMinor.toString(), totalMinor: line.totalMinor.toString() })),
    fees: {
      designMinor: row.designMinor.toString(),
      deliveryMinor: row.deliveryMinor.toString(),
      deliveryNote: row.deliveryNote,
      installationMinor: row.installationMinor.toString(),
      installationNote: row.installationNote,
      otherMinor: row.otherMinor.toString(),
      otherLabel: row.otherLabel,
    },
    totals: { goodsMinor: row.goodsMinor.toString(), feesMinor: row.feesMinor.toString(), vatRateBps: row.vatRateBps, vatMinor: row.vatMinor.toString(), totalMinor: row.totalMinor.toString() },
    validDays: row.validDays,
    validUntil: row.validUntil?.toISOString() ?? null,
    terms: row.terms,
    assumptions: row.assumptions,
    productionSequence: row.productionSequence,
    schedule,
    payments: payments.ok ? payments.payments.map((payment) => ({ ...payment, amountMinor: payment.amountMinor.toString() })) : null,
    scheduleProblem: payments.ok ? null : payments.problem,
    sentAt: row.sentAt?.toISOString() ?? null,
    sentBy: sentBy?.name ?? null,
    version: row.version,
  };
}

/** What can become a line: the project's chosen items, or the configuration (Pen 111 "Add line from project item"). */
function candidatesOf(quote: QuoteRow): AdminQuote["candidates"] {
  if (quote.projectId) {
    const snapshot = quote.requestSnapshot as Project;
    const unit = (price: { amountMinor: string; basis: string } | null | undefined) => (price && price.basis === "PER_UNIT" ? price.amountMinor : null);
    return [
      ...snapshot.recommendations
        .filter((rec) => rec.state === "INCLUDED")
        .map((rec) => ({ source: "PROJECT_RECOMMENDATION" as const, sourceKey: rec.key, title: rec.name, summary: rec.product ? rec.product.name : "Described item", quantity: rec.customerQuantity ?? rec.suggestedQuantity, unitMinor: unit(rec.product?.price) })),
      ...snapshot.items.map((item) => ({
        source: "PROJECT_ITEM" as const,
        sourceKey: item.id,
        title: item.name,
        summary: [item.kind === "CUSTOM" ? "Custom item" : item.product?.name, item.description, item.quantityNote].filter(Boolean).join(" · "),
        quantity: item.quantity,
        unitMinor: unit(item.product?.price),
      })),
    ];
  }
  const snapshot = quote.requestSnapshot as { productName?: string; quantity?: number | null; choices?: Record<string, string>; price?: { goodsMinor: string | null; quantity: number } | null };
  const goods = snapshot.price?.goodsMinor ? BigInt(snapshot.price.goodsMinor) : null;
  return [
    {
      source: "CONFIGURATION" as const,
      sourceKey: quote.configurationId ?? quote.id,
      title: snapshot.productName ?? "Configuration",
      summary: Object.values(snapshot.choices ?? {}).join(" · "),
      quantity: snapshot.quantity ?? null,
      unitMinor: goods !== null && snapshot.price?.quantity ? (goods / BigInt(snapshot.price.quantity)).toString() : null,
    },
  ];
}

export async function getAdminQuote(db: Database, id: string): Promise<AdminQuote> {
  const quote = await loadQuote(db, id);
  const versions = await db.select().from(schema.quoteVersions).where(eq(schema.quoteVersions.quoteId, id)).orderBy(desc(schema.quoteVersions.number));
  const [settings] = await db.select({ usdEnabled: schema.paymentSettings.usdEnabled }).from(schema.paymentSettings).limit(1);
  const tax = await currentTaxSetting(db, new Date());
  const project = quote.projectId ? (await db.select({ reference: schema.projects.reference, title: schema.projects.title, type: schema.projects.type }).from(schema.projects).where(eq(schema.projects.id, quote.projectId)))[0] : null;
  const snapshot = quote.requestSnapshot as { productName?: string };
  const contact = quote.contact as ContactJson;
  const requests = await db
    .select({ request: schema.quoteChangeRequests, version: schema.quoteVersions.number, line: schema.quoteLineItems.title })
    .from(schema.quoteChangeRequests)
    .leftJoin(schema.quoteVersions, eq(schema.quoteVersions.id, schema.quoteChangeRequests.quoteVersionId))
    .leftJoin(schema.quoteLineItems, eq(schema.quoteLineItems.id, schema.quoteChangeRequests.lineId))
    .where(eq(schema.quoteChangeRequests.quoteId, id))
    .orderBy(desc(schema.quoteChangeRequests.createdAt));
  return {
    requests: requests.map(({ request, version, line }) => ({ kind: request.kind, version, line, changeType: request.changeType, note: request.note, createdAt: request.createdAt.toISOString() })),
    id: quote.id,
    reference: quote.reference,
    status: quote.status,
    source: project
      ? { kind: "PROJECT", id: quote.projectId!, reference: project.reference, title: project.title || PROJECT_TYPE_INFO[project.type].label }
      : { kind: "CONFIGURATION", id: quote.configurationId ?? quote.id, reference: null, title: snapshot.productName ?? "Configuration" },
    contact: { name: contact.name ?? null, email: contact.email },
    versions: await Promise.all(versions.map((version) => versionView(db, version))),
    candidates: candidatesOf(quote),
    usdEnabled: settings?.usdEnabled ?? false,
    vatRateBps: tax?.vatRateBps ?? 0,
    createdAt: quote.createdAt.toISOString(),
  };
}

const CLOSED = new Set<QuoteRow["status"]>(["ACCEPTED", "DECLINED"]);

/**
 * New version (OPS-FR-032): a revision copies the latest version as a DRAFT;
 * the first one starts empty with the admin defaults. Only one draft at a
 * time; asking again returns it.
 */
export async function createQuoteVersion(db: Database, actor: ActorContext, quoteId: string): Promise<AdminQuote> {
  const quote = await loadQuote(db, quoteId);
  if (CLOSED.has(quote.status)) throw new AppError("CONFLICT", { message: `This quote was ${quote.status.toLowerCase()}. It can't be revised.`, context: { reason: "QUOTE_CLOSED" } });
  await db.transaction(async (tx) => {
    await tx.select({ id: schema.quotes.id }).from(schema.quotes).where(eq(schema.quotes.id, quoteId)).for("update");
    const versions = await tx.select().from(schema.quoteVersions).where(eq(schema.quoteVersions.quoteId, quoteId)).orderBy(desc(schema.quoteVersions.number));
    if (versions.some((version) => version.status === "DRAFT")) return;
    const latest = versions[0];
    const tax = await currentTaxSetting(db, actor.now);
    const settings = await getQuoteSettings(tx);
    const vat = { vatRateBps: tax?.vatRateBps ?? 0, vatOnDelivery: tax?.vatOnDelivery ?? false };
    const base = latest
      ? {
          currency: latest.currency,
          designMinor: latest.designMinor,
          deliveryMinor: latest.deliveryMinor,
          deliveryNote: latest.deliveryNote,
          installationMinor: latest.installationMinor,
          installationNote: latest.installationNote,
          otherMinor: latest.otherMinor,
          otherLabel: latest.otherLabel,
          validDays: latest.validDays,
          terms: latest.terms,
          assumptions: latest.assumptions,
          productionSequence: latest.productionSequence,
          schedule: latest.schedule,
        }
      : { currency: "NGN", designMinor: 0n, deliveryMinor: 0n, deliveryNote: "", installationMinor: 0n, installationNote: "", otherMinor: 0n, otherLabel: "", validDays: settings.validDays, terms: settings.defaultTerms, assumptions: "", productionSequence: "", schedule: settings.defaultSchedule };
    const lines = latest ? await tx.select().from(schema.quoteLineItems).where(eq(schema.quoteLineItems.quoteVersionId, latest.id)).orderBy(asc(schema.quoteLineItems.position)) : [];
    const totals = quoteTotals(lines, base, vat);
    const [created] = await tx
      .insert(schema.quoteVersions)
      .values({ quoteId, number: (latest?.number ?? 0) + 1, ...base, ...vat, ...totals, createdByStaffId: staffId(actor) })
      .returning({ id: schema.quoteVersions.id });
    if (lines.length) {
      await tx.insert(schema.quoteLineItems).values(
        lines.map((line) => ({ quoteVersionId: created!.id, position: line.position, source: line.source, sourceKey: line.sourceKey, productId: line.productId, title: line.title, summary: line.summary, quantity: line.quantity, unitMinor: line.unitMinor, totalMinor: line.totalMinor })),
      );
    }
    await recordAudit(tx, actor, { action: "quote.version_created", summary: `Started version ${(latest?.number ?? 0) + 1} of ${quote.reference}`, recordType: "QUOTE", recordId: quoteId, recordLabel: quote.reference, permission: "QUOTE_MANAGE" });
  });
  return getAdminQuote(db, quoteId);
}

async function draftFor(tx: Tx, quoteId: string, versionId: string, expected: number) {
  const [row] = await tx.select().from(schema.quoteVersions).where(and(eq(schema.quoteVersions.id, versionId), eq(schema.quoteVersions.quoteId, quoteId))).for("update");
  if (!row) throw new AppError("NOT_FOUND");
  if (row.status !== "DRAFT") throw new AppError("CONFLICT", { message: `Version ${row.number} was sent and can't change. Create a new version to revise.`, context: { reason: "VERSION_SENT" } });
  if (row.version !== expected) throw new AppError("VERSION_CONFLICT", { context: { latest: await versionView(tx, row) } });
  return row;
}

/** Saves a draft version. The server works out every line total, VAT and the total (TECH-05 §1). */
export async function saveQuoteVersion(db: Database, actor: ActorContext, quoteId: string, versionId: string, input: SaveQuoteVersion): Promise<QuoteVersion> {
  if (input.currency === "USD") {
    const [settings] = await db.select({ usdEnabled: schema.paymentSettings.usdEnabled }).from(schema.paymentSettings).limit(1);
    if (!settings?.usdEnabled) throw new AppError("VALIDATION_FAILED", { fieldErrors: { currency: "USD needs USD quotes switched on in Payment settings." } });
  }
  return db.transaction(async (tx) => {
    const row = await draftFor(tx, quoteId, versionId, input.version);
    const fees = {
      designMinor: BigInt(input.fees.designMinor),
      deliveryMinor: BigInt(input.fees.deliveryMinor),
      installationMinor: BigInt(input.fees.installationMinor),
      otherMinor: BigInt(input.fees.otherMinor),
    };
    const lines = input.lines.map((line, position) => ({ ...line, position, unitMinor: BigInt(line.unitMinor), totalMinor: BigInt(line.quantity) * BigInt(line.unitMinor) }));
    const totals = quoteTotals(lines, fees, { vatRateBps: row.vatRateBps, vatOnDelivery: row.vatOnDelivery });
    await tx.delete(schema.quoteLineItems).where(eq(schema.quoteLineItems.quoteVersionId, versionId));
    if (lines.length) {
      await tx.insert(schema.quoteLineItems).values(
        lines.map((line) => ({ quoteVersionId: versionId, position: line.position, source: line.source, sourceKey: line.sourceKey, title: line.title, summary: line.summary, quantity: line.quantity, unitMinor: line.unitMinor, totalMinor: line.totalMinor })),
      );
    }
    const [saved] = await tx
      .update(schema.quoteVersions)
      .set({
        currency: input.currency,
        ...fees,
        deliveryNote: input.fees.deliveryNote,
        installationNote: input.fees.installationNote,
        otherLabel: input.fees.otherLabel,
        ...totals,
        validDays: input.validDays,
        terms: input.terms,
        assumptions: input.assumptions,
        productionSequence: input.productionSequence,
        schedule: input.schedule,
        version: sql`${schema.quoteVersions.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(schema.quoteVersions.id, versionId))
      .returning();
    void actor;
    return versionView(tx, saved!);
  });
}

/** Deletes a draft that isn't wanted (only drafts; sent versions are kept forever). */
export async function discardQuoteVersion(db: Database, actor: ActorContext, quoteId: string, versionId: string, expected: number) {
  await db.transaction(async (tx) => {
    const row = await draftFor(tx, quoteId, versionId, expected);
    await tx.delete(schema.quoteVersions).where(eq(schema.quoteVersions.id, row.id));
    await recordAudit(tx, actor, { action: "quote.version_discarded", summary: `Discarded draft version ${row.number}`, recordType: "QUOTE", recordId: quoteId, permission: "QUOTE_MANAGE" });
  });
  return getAdminQuote(db, quoteId);
}

/**
 * Send a version (OPS-FR-031–033, QUOTE-FR-001, 006). In one transaction,
 * under the quote's lock: the previous sent version becomes SUPERSEDED, this
 * one SENT with valid-until and a frozen copy of what the customer sees; the
 * quote becomes READY and its project QUOTED. The expiry job, the expiring
 * reminder and the "Quote ready" email with the quote's secure link are
 * queued in the same transaction.
 */
export async function sendQuoteVersion(deps: NotificationDeps & { webOrigin: string }, actor: ActorContext, quoteId: string, versionId: string, expected: number): Promise<AdminQuote> {
  const { now } = actor;
  await deps.db.transaction(async (tx) => {
    const [quote] = await tx.select().from(schema.quotes).where(eq(schema.quotes.id, quoteId)).for("update");
    if (!quote) throw new AppError("NOT_FOUND");
    if (CLOSED.has(quote.status)) throw new AppError("CONFLICT", { message: `This quote was ${quote.status.toLowerCase()}.`, context: { reason: "QUOTE_CLOSED" } });
    const row = await draftFor(tx, quoteId, versionId, expected);
    const view = await versionView(tx, row);
    const fieldErrors: Record<string, string> = {};
    if (!view.lines.length) fieldErrors.lines = "Add at least one line before sending.";
    view.lines.forEach((line, index) => {
      if (line.unitMinor === "0") fieldErrors[`lines.${index}.unitMinor`] = `Enter a price for ${line.title}.`;
    });
    if (view.scheduleProblem) fieldErrors.schedule = view.scheduleProblem;
    if (Object.keys(fieldErrors).length) throw new AppError("VALIDATION_FAILED", { fieldErrors });

    const validUntil = new Date(now.getTime() + row.validDays * DAY);
    const previous = await tx
      .update(schema.quoteVersions)
      .set({ status: "SUPERSEDED", updatedAt: new Date() })
      .where(and(eq(schema.quoteVersions.quoteId, quoteId), eq(schema.quoteVersions.status, "SENT")))
      .returning({ number: schema.quoteVersions.number });
    const snapshot = { schema: "quote-version/v1", quoteReference: quote.reference, ...view, status: "SENT", validUntil: validUntil.toISOString(), sentAt: now.toISOString() };
    await tx
      .update(schema.quoteVersions)
      .set({ status: "SENT", validUntil, sentAt: now, sentByStaffId: staffId(actor), snapshot, updatedAt: new Date() })
      .where(eq(schema.quoteVersions.id, versionId));
    await tx.update(schema.quotes).set({ status: "READY", version: sql`${schema.quotes.version} + 1`, updatedAt: new Date() }).where(eq(schema.quotes.id, quoteId));
    if (quote.projectId) {
      await tx
        .update(schema.projects)
        .set({ status: "QUOTED", version: sql`${schema.projects.version} + 1` })
        .where(and(eq(schema.projects.id, quote.projectId), inArray(schema.projects.status, ["SUBMITTED", "UNDER_REVIEW", "QUOTED"])));
    }

    const settings = await getQuoteSettings(tx);
    const seconds = (at: Date) => Math.max(1, Math.ceil((at.getTime() - now.getTime()) / 1000));
    await deps.jobs.send("quote.expire", { v: 1, requestId: actor.requestId, quoteVersionId: versionId }, { tx, startAfterSeconds: seconds(validUntil) });
    const remindAt = new Date(validUntil.getTime() - settings.expiringNoticeDays * DAY);
    if (settings.expiringNoticeDays > 0 && remindAt > now) {
      await deps.jobs.send("reminder.send", { v: 1, requestId: actor.requestId, kind: "QUOTE_EXPIRING", recordId: versionId }, { tx, startAfterSeconds: seconds(remindAt) });
    }

    const contact = quote.contact as ContactJson;
    const recipient = await ensureGuestCustomer(tx, { email: contact.email, name: contact.name ?? null });
    const link = await createGuestLink(tx, deps.webOrigin, { purpose: "QUOTE", targetType: "QUOTE", targetId: quoteId, customerId: recipient.id, now });
    await queueEmail(deps, tx, {
      template: "quote_ready",
      to: contact.email,
      customerId: recipient.id,
      data: { reference: quote.reference, version: row.number, total: formatMoney(row.totalMinor, row.currency), validUntil: day(validUntil), revised: previous.length > 0, url: link.url },
      record: { type: "QUOTE", id: quoteId, label: `${quote.reference} V${row.number}` },
      linkLabel: "Opens the quote",
      requestId: actor.requestId,
    });
    await recordAudit(tx, actor, {
      action: "quote.sent",
      summary: `Sent ${quote.reference} V${row.number} (${formatMoney(row.totalMinor, row.currency)})${previous.length ? `; V${previous[0]!.number} superseded` : ""}`,
      recordType: "QUOTE",
      recordId: quoteId,
      recordLabel: quote.reference,
      after: { version: row.number, totalMinor: row.totalMinor.toString(), currency: row.currency, validUntil: validUntil.toISOString() },
      permission: "QUOTE_MANAGE",
    });
  });
  return getAdminQuote(deps.db, quoteId);
}

/* ------------------------------------------------------------------ */
/* Jobs: expiry and the expiring reminder (TECH-02 §8)                 */
/* ------------------------------------------------------------------ */

/** quote.expire: a version still SENT at its valid-until becomes EXPIRED, and so does a READY quote (QUOTE-FR-006). Safe to repeat. */
export async function expireQuoteVersion(db: Database, versionId: string, now = new Date()): Promise<"expired" | "skipped"> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(schema.quoteVersions).where(eq(schema.quoteVersions.id, versionId)).for("update");
    if (!row || row.status !== "SENT" || !row.validUntil || row.validUntil > now) return "skipped";
    await tx.update(schema.quoteVersions).set({ status: "EXPIRED", updatedAt: new Date() }).where(eq(schema.quoteVersions.id, versionId));
    await tx.update(schema.quotes).set({ status: "EXPIRED", version: sql`${schema.quotes.version} + 1`, updatedAt: new Date() }).where(and(eq(schema.quotes.id, row.quoteId), eq(schema.quotes.status, "READY")));
    await recordAudit(tx, null, { action: "quote.expired", summary: `Quote version ${row.number} expired`, recordType: "QUOTE", recordId: row.quoteId });
    return "expired";
  });
}

/** reminder.send QUOTE_EXPIRING: only if the version is still the sent one and the quote still READY. */
export async function sendQuoteExpiringReminder(deps: NotificationDeps & { webOrigin: string }, versionId: string, requestId: string, now = new Date()): Promise<"sent" | "skipped"> {
  return deps.db.transaction(async (tx) => {
    const [row] = await tx
      .select({ version: schema.quoteVersions, quote: schema.quotes })
      .from(schema.quoteVersions)
      .innerJoin(schema.quotes, eq(schema.quotes.id, schema.quoteVersions.quoteId))
      .where(eq(schema.quoteVersions.id, versionId));
    if (!row || row.version.status !== "SENT" || row.quote.status !== "READY" || !row.version.validUntil || row.version.validUntil <= now) return "skipped";
    const contact = row.quote.contact as ContactJson;
    const recipient = await ensureGuestCustomer(tx, { email: contact.email, name: contact.name ?? null });
    const link = await createGuestLink(tx, deps.webOrigin, { purpose: "QUOTE", targetType: "QUOTE", targetId: row.quote.id, customerId: recipient.id, now });
    await queueEmail(deps, tx, {
      template: "quote_expiring",
      to: contact.email,
      customerId: recipient.id,
      data: { reference: row.quote.reference, validUntil: day(row.version.validUntil), url: link.url },
      record: { type: "QUOTE", id: row.quote.id, label: `${row.quote.reference} V${row.version.number}` },
      linkLabel: "Opens the quote",
      requestId,
    });
    return "sent";
  });
}
