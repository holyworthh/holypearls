import type { AdminTemplate, AdminTemplateList, CreateTemplate, Template, TemplateField, TemplateList, TemplateSourceList, TemplateStatus, UpdateTemplate } from "@holypearls/contracts";
import { and, type Database, desc, eq, inArray, schema, type Transaction } from "@holypearls/db";
import { configurationSpecification, draftSources, ownsConfiguration, productIsLive } from "../configuration/specification.js";
import { AppError } from "../errors.js";
import type { ActorContext } from "../identity/actor.js";
import { assertStaff } from "../identity/staff.guard.js";
import { isOrganizationOrderItem, organizationOrderItemSources } from "../orders/workspace.js";
import { recordAudit } from "../platform/audit.js";
import { enforce } from "../platform/policy.js";
import { type Member, requireMember } from "./members.js";
import { canSeeLocation, needsPermission } from "./policies.js";
import { scopeFor } from "./scope.js";

/*
 * Workspace Product Templates (T11-01b; PRD-05 B2B-FR-024, 030–032;
 * OPS-FR-082). A template is a catalogue product with a saved copy of an
 * approved configuration and specific asset versions; each field is locked
 * by the company or editable by the buyer, with a reason. DRAFT →
 * AWAITING_APPROVAL (HolyPearls) → APPROVED → NEEDS_REVIEW (a linked asset
 * version retired) → AWAITING_APPROVAL; any → ARCHIVED (TECH-01 §4).
 */

type Db = Database | Transaction;
type TemplateRow = typeof schema.templates.$inferSelect;
const READY_FOR_PRODUCTION = new Set(["PRODUCTION_READY", "SUPERSEDED"]);
const APPROVAL_PERMISSION = "STAFF_ADMIN" as const;

async function linkedAssets(db: Db, templateIds: readonly string[]) {
  if (!templateIds.length) return new Map<string, Template["assets"]>();
  const rows = await db
    .select({ templateId: schema.templateAssetLinks.templateId, version: schema.brandAssetVersions, asset: schema.brandAssets })
    .from(schema.templateAssetLinks)
    .innerJoin(schema.brandAssetVersions, eq(schema.brandAssetVersions.id, schema.templateAssetLinks.assetVersionId))
    .innerJoin(schema.brandAssets, eq(schema.brandAssets.id, schema.brandAssetVersions.assetId))
    .where(inArray(schema.templateAssetLinks.templateId, [...templateIds]));
  const assetIds = [...new Set(rows.map((row) => row.asset.id))];
  const current = assetIds.length
    ? await db
        .select({ assetId: schema.brandAssetVersions.assetId, number: schema.brandAssetVersions.number })
        .from(schema.brandAssetVersions)
        .where(and(inArray(schema.brandAssetVersions.assetId, assetIds), eq(schema.brandAssetVersions.status, "PRODUCTION_READY")))
    : [];
  const currentByAsset = new Map(current.map((row) => [row.assetId, row.number]));
  const byTemplate = new Map<string, Template["assets"]>();
  for (const row of rows) {
    const now = currentByAsset.get(row.asset.id) ?? null;
    byTemplate.set(row.templateId, [
      ...(byTemplate.get(row.templateId) ?? []),
      { assetId: row.asset.id, assetName: row.asset.name, versionId: row.version.id, number: row.version.number, status: row.version.status, currentNumber: now !== row.version.number ? now : null },
    ]);
  }
  return byTemplate;
}

async function templateLocationsOf(db: Db, templateIds: readonly string[]) {
  if (!templateIds.length) return new Map<string, { id: string; name: string }[]>();
  const rows = await db
    .select({ templateId: schema.templateLocations.templateId, id: schema.locations.id, name: schema.locations.name })
    .from(schema.templateLocations)
    .innerJoin(schema.locations, eq(schema.locations.id, schema.templateLocations.locationId))
    .where(inArray(schema.templateLocations.templateId, [...templateIds]));
  const byTemplate = new Map<string, { id: string; name: string }[]>();
  for (const row of rows) byTemplate.set(row.templateId, [...(byTemplate.get(row.templateId) ?? []), { id: row.id, name: row.name }]);
  return byTemplate;
}

/** "Available using logo V4" while an older version is still allowed; "Blocked" once it's retired (B2B-FR-024). */
function assetLabel(status: TemplateStatus, assets: Template["assets"]) {
  if (status === "NEEDS_REVIEW") return "Blocked — asset review required";
  const older = assets.find((asset) => asset.status === "SUPERSEDED");
  return status === "APPROVED" && older ? `Available using ${older.assetName.toLowerCase()} V${older.number}` : null;
}

interface Spec {
  productName: string;
  productSlug: string;
  sourceLabel: string;
}

async function views(db: Db, rows: TemplateRow[]) {
  const ids = rows.map((row) => row.id);
  const [assets, locations, fields] = await Promise.all([
    linkedAssets(db, ids),
    templateLocationsOf(db, ids),
    ids.length ? db.select().from(schema.templateFields).where(inArray(schema.templateFields.templateId, ids)).orderBy(schema.templateFields.position) : Promise.resolve([]),
  ]);
  return rows.map((row) => {
    const spec = row.specification as Spec;
    const linked = assets.get(row.id) ?? [];
    return {
      row,
      summary: {
        id: row.id,
        name: row.name,
        status: row.status,
        productName: spec.productName,
        productSlug: spec.productSlug,
        assetLabel: assetLabel(row.status, linked),
        allLocations: row.allLocations,
        locations: (locations.get(row.id) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
        updatedAt: row.updatedAt.toISOString(),
      },
      fields: fields.filter((field) => field.templateId === row.id).map(({ key, label, value, control, reason }): TemplateField => ({ key, label, value, control, reason })),
      assets: linked,
      sourceLabel: spec.sourceLabel,
    };
  });
}

/** Templates a member can see: theirs by location; drafts only for people who manage templates. */
function visible(member: Member, view: Awaited<ReturnType<typeof views>>[number]) {
  if (view.row.status === "DRAFT" && !member.permissions.has("MANAGE_BRAND")) return false;
  if (member.allLocations || view.row.allLocations) return true;
  return view.summary.locations.some((location) => member.locationIds.has(location.id));
}

export async function listTemplates(db: Database, actor: ActorContext, organizationId: string, options: { archived?: boolean } = {}): Promise<TemplateList> {
  const member = await requireMember(db, actor, organizationId);
  const rows = await db.select().from(schema.templates).where(eq(schema.templates.organizationId, organizationId)).orderBy(schema.templates.name);
  const all = await views(db, rows.filter((row) => options.archived || row.status !== "ARCHIVED"));
  return { templates: all.filter((view) => visible(member, view)).map((view) => view.summary), canManage: member.permissions.has("MANAGE_BRAND") };
}

async function loadTemplate(db: Db, organizationId: string, templateId: string, options: { lock?: boolean } = {}) {
  const query = db.select().from(schema.templates).where(and(eq(schema.templates.id, templateId), eq(schema.templates.organizationId, organizationId)));
  const [row] = options.lock ? await query.for("update") : await query;
  if (!row) throw new AppError("NOT_FOUND");
  return row;
}

async function templateView(db: Db, row: TemplateRow, member: Member): Promise<Template> {
  const [view] = await views(db, [row]);
  if (!visible(member, view!)) throw new AppError("NOT_FOUND");
  return { ...view!.summary, fields: view!.fields, assets: view!.assets, reviewNote: row.reviewNote, sourceLabel: view!.sourceLabel, canManage: member.permissions.has("MANAGE_BRAND"), version: row.version };
}

export async function getTemplate(db: Database, actor: ActorContext, organizationId: string, templateId: string): Promise<Template> {
  const member = await requireMember(db, actor, organizationId);
  return templateView(db, await loadTemplate(db, organizationId, templateId), member);
}

/** Where a template can start: the organization's ordered items in the person's scope, and their own saved designs. */
export async function templateSources(db: Database, actor: ActorContext, organizationId: string): Promise<TemplateSourceList> {
  const member = await requireMember(db, actor, organizationId);
  enforce(needsPermission(member, "MANAGE_BRAND"));
  const [items, drafts] = await Promise.all([organizationOrderItemSources(db, scopeFor(member)), draftSources(db, member.userId)]);
  const seen = new Set<string>();
  return { sources: [...items, ...drafts].filter((source) => (seen.has(source.configurationId) ? false : (seen.add(source.configurationId), true))) };
}

/** Asset versions must be this organization's and ready for production (B2B-FR-030). */
async function checkAssetVersions(db: Db, organizationId: string, versionIds: readonly string[]) {
  if (!versionIds.length) return;
  const rows = await db
    .select({ id: schema.brandAssetVersions.id, status: schema.brandAssetVersions.status })
    .from(schema.brandAssetVersions)
    .innerJoin(schema.brandAssets, eq(schema.brandAssets.id, schema.brandAssetVersions.assetId))
    .where(and(inArray(schema.brandAssetVersions.id, [...versionIds]), eq(schema.brandAssets.organizationId, organizationId)));
  if (rows.length !== new Set(versionIds).size) throw new AppError("VALIDATION_FAILED", { fieldErrors: { assetVersionIds: "Choose this organization's brand assets" } });
  if (rows.some((row) => !READY_FOR_PRODUCTION.has(row.status))) throw new AppError("VALIDATION_FAILED", { fieldErrors: { assetVersionIds: "Use a production-ready version of each asset" } });
}

/** A template's locations sit inside the creator's (no escalation, TECH-03 §7). */
function checkLocations(member: Member, input: { allLocations: boolean; locationIds: readonly string[] }) {
  if (input.allLocations && !member.allLocations) throw new AppError("FORBIDDEN", { context: { reason: "CANNOT_GRANT_ALL_LOCATIONS" } });
  for (const id of input.locationIds) enforce(canSeeLocation(member, id));
}

async function writeLocations(tx: Transaction, templateId: string, organizationId: string, input: { allLocations: boolean; locationIds: readonly string[] }) {
  await tx.delete(schema.templateLocations).where(eq(schema.templateLocations.templateId, templateId));
  if (!input.allLocations && input.locationIds.length) {
    await tx.insert(schema.templateLocations).values([...new Set(input.locationIds)].map((locationId) => ({ templateId, organizationId, locationId })));
  }
}

async function writeAssets(tx: Transaction, templateId: string, versionIds: readonly string[]) {
  await tx.delete(schema.templateAssetLinks).where(eq(schema.templateAssetLinks.templateId, templateId));
  if (versionIds.length) await tx.insert(schema.templateAssetLinks).values([...new Set(versionIds)].map((assetVersionId) => ({ templateId, assetVersionId })));
}

/** Create a DRAFT template from an ordered item or a saved design; fields start with suggested controls and reasons. */
export async function createTemplate(db: Database, actor: ActorContext, organizationId: string, input: CreateTemplate): Promise<Template> {
  const member = await requireMember(db, actor, organizationId);
  enforce(needsPermission(member, "MANAGE_BRAND"));
  const allowed = (await isOrganizationOrderItem(db, scopeFor(member), input.configurationId)) || (await ownsConfiguration(db, input.configurationId, member.userId));
  if (!allowed) throw new AppError("NOT_FOUND");
  checkLocations(member, input);
  await checkAssetVersions(db, organizationId, input.assetVersionIds);
  const spec = await configurationSpecification(db, input.configurationId);
  if (!spec) throw new AppError("NOT_FOUND");
  const sources = await templateSources(db, actor, organizationId);
  const sourceLabel = sources.sources.find((source) => source.configurationId === input.configurationId)?.label ?? spec.productName;
  const row = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(schema.templates)
      .values({
        organizationId,
        name: input.name,
        productId: spec.productId,
        sourceConfigurationId: input.configurationId,
        specification: { schema: "template-spec/v1", productName: spec.productName, productSlug: spec.productSlug, family: spec.family, sourceLabel, fields: spec.fields, takenAt: actor.now.toISOString() },
        allLocations: input.allLocations,
        createdByUserId: member.userId,
      })
      .returning();
    const fields = [
      ...spec.fields.map((field) => ({ key: field.key, label: field.label, value: field.value, control: field.suggested, reason: field.suggested === "LOCKED" ? `Set by ${member.organizationName}'s brand template` : "Chosen per order" })),
      ...(input.assetVersionIds.length ? [{ key: "logo", label: "Logo", value: "As linked below", control: "LOCKED" as const, reason: "Approved brand artwork" }] : []),
    ];
    await tx.insert(schema.templateFields).values(fields.map((field, position) => ({ ...field, templateId: created!.id, position })));
    await writeLocations(tx, created!.id, organizationId, input);
    await writeAssets(tx, created!.id, input.assetVersionIds);
    await recordAudit(tx, actor, {
      action: "template.created",
      summary: `Template drafted: ${input.name}`,
      recordType: "TEMPLATE",
      recordId: created!.id,
      recordLabel: member.organizationName,
      after: { name: input.name, productName: spec.productName, assetVersionIds: input.assetVersionIds, allLocations: input.allLocations },
      permission: "MANAGE_BRAND",
    });
    return created!;
  });
  return templateView(db, row, member);
}

/** Any change sends the template back to DRAFT, to be submitted for HolyPearls' check again (frame 29). */
export async function updateTemplate(db: Database, actor: ActorContext, organizationId: string, templateId: string, input: UpdateTemplate): Promise<Template> {
  const member = await requireMember(db, actor, organizationId);
  enforce(needsPermission(member, "MANAGE_BRAND"));
  checkLocations(member, input);
  await checkAssetVersions(db, organizationId, input.assetVersionIds);
  const row = await db.transaction(async (tx) => {
    const locked = await loadTemplate(tx, organizationId, templateId, { lock: true });
    if (locked.status === "ARCHIVED") throw new AppError("RULE_FAILED", { message: "Archived templates can't change.", context: { reason: "ARCHIVED" } });
    if (locked.version !== input.version) throw new AppError("VERSION_CONFLICT", { context: { currentVersion: locked.version } });
    const existing = await tx.select().from(schema.templateFields).where(eq(schema.templateFields.templateId, templateId));
    const byKey = new Map(input.fields.map((field) => [field.key, field]));
    for (const field of existing) {
      const change = byKey.get(field.key);
      if (change) await tx.update(schema.templateFields).set({ control: change.control, reason: change.reason }).where(and(eq(schema.templateFields.templateId, templateId), eq(schema.templateFields.key, field.key)));
    }
    if (!existing.some((field) => field.key === "logo") && input.assetVersionIds.length) {
      await tx.insert(schema.templateFields).values({ templateId, key: "logo", label: "Logo", value: "As linked below", control: "LOCKED", reason: "Approved brand artwork", position: existing.length });
    }
    await writeLocations(tx, templateId, organizationId, input);
    await writeAssets(tx, templateId, input.assetVersionIds);
    const [updated] = await tx
      .update(schema.templates)
      .set({ name: input.name, allLocations: input.allLocations, status: "DRAFT", version: locked.version + 1 })
      .where(eq(schema.templates.id, templateId))
      .returning();
    await recordAudit(tx, actor, {
      action: "template.updated",
      summary: `Template changed: ${input.name}`,
      recordType: "TEMPLATE",
      recordId: templateId,
      recordLabel: member.organizationName,
      before: { status: locked.status },
      after: { status: "DRAFT", fields: input.fields, assetVersionIds: input.assetVersionIds },
      permission: "MANAGE_BRAND",
    });
    return updated!;
  });
  return templateView(db, row, member);
}

async function linkedVersionsReady(db: Db, templateId: string) {
  const rows = await db
    .select({ status: schema.brandAssetVersions.status })
    .from(schema.templateAssetLinks)
    .innerJoin(schema.brandAssetVersions, eq(schema.brandAssetVersions.id, schema.templateAssetLinks.assetVersionId))
    .where(eq(schema.templateAssetLinks.templateId, templateId));
  return rows.every((row) => READY_FOR_PRODUCTION.has(row.status));
}

/** Submit for HolyPearls' production check (DRAFT or NEEDS_REVIEW → AWAITING_APPROVAL). */
export async function submitTemplate(db: Database, actor: ActorContext, organizationId: string, templateId: string, version: number): Promise<Template> {
  const member = await requireMember(db, actor, organizationId);
  enforce(needsPermission(member, "MANAGE_BRAND"));
  const row = await db.transaction(async (tx) => {
    const locked = await loadTemplate(tx, organizationId, templateId, { lock: true });
    if (locked.version !== version) throw new AppError("VERSION_CONFLICT", { context: { currentVersion: locked.version } });
    if (locked.status !== "DRAFT" && locked.status !== "NEEDS_REVIEW") throw new AppError("RULE_FAILED", { message: "Only a draft or a template that needs review can be submitted.", context: { reason: "NOT_SUBMITTABLE", status: locked.status } });
    if (!(await linkedVersionsReady(tx, templateId))) throw new AppError("RULE_FAILED", { message: "A linked asset version isn't production ready. Choose the current version first.", context: { reason: "ASSET_NOT_READY" } });
    const [updated] = await tx.update(schema.templates).set({ status: "AWAITING_APPROVAL", reviewNote: null, version: locked.version + 1 }).where(eq(schema.templates.id, templateId)).returning();
    await recordAudit(tx, actor, { action: "template.submitted", summary: `Template sent for HolyPearls' check: ${locked.name}`, recordType: "TEMPLATE", recordId: templateId, recordLabel: member.organizationName, before: { status: locked.status }, after: { status: "AWAITING_APPROVAL" }, permission: "MANAGE_BRAND" });
    return updated!;
  });
  return templateView(db, row, member);
}

export async function archiveTemplate(db: Database, actor: ActorContext, organizationId: string, templateId: string, version: number): Promise<Template> {
  const member = await requireMember(db, actor, organizationId);
  enforce(needsPermission(member, "MANAGE_BRAND"));
  const row = await db.transaction(async (tx) => {
    const locked = await loadTemplate(tx, organizationId, templateId, { lock: true });
    if (locked.version !== version) throw new AppError("VERSION_CONFLICT", { context: { currentVersion: locked.version } });
    if (locked.status === "ARCHIVED") throw new AppError("RULE_FAILED", { message: "This template is already archived.", context: { reason: "ALREADY_ARCHIVED" } });
    const [updated] = await tx.update(schema.templates).set({ status: "ARCHIVED", version: locked.version + 1 }).where(eq(schema.templates.id, templateId)).returning();
    await recordAudit(tx, actor, { action: "template.archived", summary: `Template archived: ${locked.name}`, recordType: "TEMPLATE", recordId: templateId, recordLabel: member.organizationName, before: { status: locked.status }, after: { status: "ARCHIVED" }, permission: "MANAGE_BRAND" });
    return updated!;
  });
  return templateView(db, row, member);
}

/**
 * A linked asset version was retired (B2B-FR-024): templates using it that
 * were approved or waiting move to NEEDS_REVIEW ("Blocked — asset review
 * required"), in the same transaction as the retirement.
 */
export async function templatesNeedReviewFor(tx: Transaction, actor: ActorContext, versionId: string) {
  const links = await tx.select({ templateId: schema.templateAssetLinks.templateId }).from(schema.templateAssetLinks).where(eq(schema.templateAssetLinks.assetVersionId, versionId));
  if (!links.length) return 0;
  const moved = await tx
    .update(schema.templates)
    .set({ status: "NEEDS_REVIEW" })
    .where(and(inArray(schema.templates.id, links.map((link) => link.templateId)), inArray(schema.templates.status, ["APPROVED", "AWAITING_APPROVAL"])))
    .returning({ id: schema.templates.id, name: schema.templates.name, organizationId: schema.templates.organizationId });
  for (const template of moved) {
    await recordAudit(tx, actor, { action: "template.needs_review", summary: `Template blocked: its asset version was retired (${template.name})`, recordType: "TEMPLATE", recordId: template.id, before: { status: "APPROVED" }, after: { status: "NEEDS_REVIEW", retiredVersionId: versionId } });
  }
  return moved.length;
}

/** Templates that use an asset (frame 66 "Used in N templates"). */
export async function templatesUsingAsset(db: Database, assetId: string) {
  const rows = await db
    .select({ id: schema.templates.id, name: schema.templates.name, status: schema.templates.status, number: schema.brandAssetVersions.number })
    .from(schema.templateAssetLinks)
    .innerJoin(schema.templates, eq(schema.templates.id, schema.templateAssetLinks.templateId))
    .innerJoin(schema.brandAssetVersions, eq(schema.brandAssetVersions.id, schema.templateAssetLinks.assetVersionId))
    .where(and(eq(schema.brandAssetVersions.assetId, assetId)));
  return rows.filter((row) => row.status !== "ARCHIVED");
}

/* Staff approval (frame 117; OPS-FR-082). STAFF_ADMIN until the owner chooses a permission. */

async function checksFor(db: Db, row: TemplateRow) {
  const [live, ready, fields] = await Promise.all([
    productIsLive(db, row.productId),
    linkedVersionsReady(db, row.id),
    db.select({ reason: schema.templateFields.reason }).from(schema.templateFields).where(eq(schema.templateFields.templateId, row.id)),
  ]);
  return [
    { label: "Configuration is producible (product on sale)", pass: live, detail: live ? null : "The product isn't published." },
    { label: "Linked asset versions are production ready", pass: ready, detail: ready ? null : "A linked version isn't ready or was retired." },
    { label: "Every field has a reason buyers see", pass: fields.length > 0 && fields.every((field) => field.reason.trim().length > 0), detail: null },
  ];
}

export async function adminTemplateQueue(db: Database, status?: string): Promise<AdminTemplateList> {
  const wanted: TemplateStatus = status === "NEEDS_REVIEW" || status === "APPROVED" ? status : "AWAITING_APPROVAL";
  const rows = await db
    .select({ template: schema.templates, organizationName: schema.organizations.name })
    .from(schema.templates)
    .innerJoin(schema.organizations, eq(schema.organizations.id, schema.templates.organizationId))
    .where(eq(schema.templates.status, wanted))
    .orderBy(desc(schema.templates.updatedAt))
    .limit(200);
  return {
    templates: rows.map(({ template, organizationName }) => ({ id: template.id, name: template.name, organizationName, productName: (template.specification as Spec).productName, status: template.status, updatedAt: template.updatedAt.toISOString() })),
  };
}

export async function adminTemplate(db: Database, templateId: string): Promise<AdminTemplate> {
  const [found] = await db
    .select({ template: schema.templates, organizationName: schema.organizations.name, createdBy: schema.users.name })
    .from(schema.templates)
    .innerJoin(schema.organizations, eq(schema.organizations.id, schema.templates.organizationId))
    .leftJoin(schema.users, eq(schema.users.id, schema.templates.createdByUserId))
    .where(eq(schema.templates.id, templateId));
  if (!found) throw new AppError("NOT_FOUND");
  const [view] = await views(db, [found.template]);
  return {
    ...view!.summary,
    fields: view!.fields,
    assets: view!.assets,
    reviewNote: found.template.reviewNote,
    sourceLabel: view!.sourceLabel,
    version: found.template.version,
    organizationId: found.template.organizationId,
    organizationName: found.organizationName,
    createdBy: found.createdBy,
    checks: await checksFor(db, found.template),
  };
}

/** Approve (every check must pass) or return to DRAFT with a note the organization sees. */
export async function decideTemplate(db: Database, actor: ActorContext, templateId: string, input: { decision: "APPROVE" | "RETURN_TO_DRAFT"; note: string | null; version: number }): Promise<AdminTemplate> {
  const staff = assertStaff(actor, APPROVAL_PERMISSION);
  if (input.decision === "RETURN_TO_DRAFT" && !input.note) throw new AppError("VALIDATION_FAILED", { fieldErrors: { note: "Tell the organization what to change" } });
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(schema.templates).where(eq(schema.templates.id, templateId)).for("update");
    if (!row) throw new AppError("NOT_FOUND");
    if (row.version !== input.version) throw new AppError("VERSION_CONFLICT", { context: { currentVersion: row.version } });
    if (row.status !== "AWAITING_APPROVAL") throw new AppError("RULE_FAILED", { message: "This template isn't waiting for approval.", context: { reason: "NOT_AWAITING", status: row.status } });
    if (input.decision === "APPROVE") {
      const failing = (await checksFor(tx, row)).filter((check) => !check.pass);
      if (failing.length) throw new AppError("RULE_FAILED", { message: failing[0]!.detail ?? failing[0]!.label, context: { reason: "CHECKS_FAILED", checks: failing.map((check) => check.label) } });
    }
    await tx
      .update(schema.templates)
      .set(input.decision === "APPROVE" ? { status: "APPROVED", approvedAt: actor.now, approvedByStaffId: staff.staff.staffProfileId, reviewNote: input.note, version: row.version + 1 } : { status: "DRAFT", reviewNote: input.note, version: row.version + 1 })
      .where(eq(schema.templates.id, templateId));
    await recordAudit(tx, actor, {
      action: input.decision === "APPROVE" ? "template.approved" : "template.returned_to_draft",
      summary: `${input.decision === "APPROVE" ? "Template approved" : "Template returned to draft"}: ${row.name}`,
      recordType: "TEMPLATE",
      recordId: templateId,
      before: { status: "AWAITING_APPROVAL" },
      after: { status: input.decision === "APPROVE" ? "APPROVED" : "DRAFT", note: input.note },
      permission: APPROVAL_PERMISSION,
    });
  });
  return adminTemplate(db, templateId);
}
