import { type Collection, type CollectionInvite, type CollectionList, type CollectionStatus, type CreateCollection, PARTICIPANT_FIELDS, type ParticipantField, type UpdateCollection } from "@holypearls/contracts";
import { and, type Database, desc, eq, inArray, schema, sql, type Transaction } from "@holypearls/db";
import { seal, unseal } from "@holypearls/email";
import { randomBytes } from "node:crypto";
import { configurationSpecification, ownsConfiguration } from "../configuration/specification.js";
import { AppError } from "../errors.js";
import type { ActorContext } from "../identity/actor.js";
import { sha256 } from "../identity/customers.js";
import { type Member, requireMember } from "../organizations/members.js";
import { canSeeLocation, needsPermission } from "../organizations/policies.js";
import type { OrganizationDeps } from "../organizations/team.js";
import { getTemplate, templateSourceConfiguration } from "../organizations/templates.js";
import { recordAudit } from "../platform/audit.js";
import { enforce } from "../platform/policy.js";

/*
 * Group collection setup (T12-01; PRD-05 B2B-FR-050–052, 060; TECH-01 §4;
 * Pen frame 132). People with "Manage group collections" for a location set
 * one up from an approved template or their own saved design, choose the
 * participant fields the source allows, the deadline and where it goes (the
 * organization always pays; owner decision 2026-10-10), then open it to get
 * the share link. Participants' submissions arrive
 * in T12-01b.
 */

type Db = Database | Transaction;
type Row = typeof schema.groupCollections.$inferSelect;
type Field = { key: string; label: string; control: "LOCKED" | "EDITABLE" };

const NOT_IN_PRODUCT: Record<ParticipantField, string> = {
  SIZE: "This product has no sizes",
  PERSONALIZATION: "This product has no personalisation",
  QUANTITY: "",
  COLOUR: "This product has no colour choice",
};
const isColour = (key: string) => /^option:colou?r$/.test(key);

/** Which participant fields the source allows: a template's editable fields, or everything a saved design's product offers (B2B-FR-052). */
export function availability(fields: readonly Field[]) {
  const find = (field: ParticipantField) =>
    field === "SIZE" ? fields.find((item) => item.key === "sizes") : field === "PERSONALIZATION" ? fields.find((item) => item.key === "personalization") : field === "QUANTITY" ? fields.find((item) => item.key === "quantity") : fields.find((item) => isColour(item.key));
  return PARTICIPANT_FIELDS.map((field) => {
    const found = find(field);
    if (!found && field !== "QUANTITY") return { field, available: false, reason: NOT_IN_PRODUCT[field] };
    if (found?.control === "LOCKED") return { field, available: false, reason: `${found.label} is locked by the template` };
    return { field, available: true, reason: null };
  });
}

interface Snapshot {
  sourceLabel: string;
  productName: string;
  fields: Field[];
}

const sourceFields = (row: Row) => (row.snapshot as Snapshot).fields;

async function locationNames(db: Db, organizationId: string) {
  const rows = await db.select({ id: schema.locations.id, name: schema.locations.name }).from(schema.locations).where(eq(schema.locations.organizationId, organizationId)).orderBy(schema.locations.name);
  return rows;
}

export function canManage(member: Member, row: Pick<Row, "locationId">) {
  return member.permissions.has("MANAGE_COLLECTIONS") && (member.allLocations || member.locationIds.has(row.locationId));
}

/** Who sees a collection: its creator, and members with "Manage group collections" or "View records" for its location. */
export function canSee(member: Member, row: Row) {
  if (row.createdByUserId === member.userId) return true;
  if (!(member.allLocations || member.locationIds.has(row.locationId))) return false;
  return member.permissions.has("MANAGE_COLLECTIONS") || member.permissions.has("VIEW_RECORDS");
}

function view(deps: Pick<OrganizationDeps, "sealKey" | "webOrigin">, member: Member, row: Row, locations: readonly { id: string; name: string }[], submitted = 0): Collection {
  const snapshot = row.snapshot as Snapshot;
  const manages = canManage(member, row);
  const shared = manages && (row.status === "OPEN" || row.status === "PAUSED") && row.shareSecretSealed;
  return {
    id: row.id,
    title: row.title,
    templateId: row.templateId,
    status: row.status,
    productName: snapshot.productName,
    locationId: row.locationId,
    locationName: locations.find((location) => location.id === row.locationId)?.name ?? "",
    deadline: row.deadline?.toISOString() ?? null,
    submittedCount: submitted,
    updatedAt: row.updatedAt.toISOString(),
    source: { kind: row.templateId ? "TEMPLATE" : "CONFIGURATION", label: snapshot.sourceLabel, templateId: row.templateId },
    fields: row.fields as ParticipantField[],
    availableFields: availability(snapshot.fields),
    deliveryMode: row.deliveryMode,
    centralLocationId: row.centralLocationId,
    branchLocations: locations.filter((location) => row.branchLocationIds.includes(location.id)),
    unsureSizeRule: row.unsureSizeRule,
    shareUrl: shared ? `${deps.webOrigin}/g#${unseal(row.shareSecretSealed!, deps.sealKey) as string}` : null,
    canManage: manages,
    version: row.version,
  };
}

export async function listCollections(db: Database, actor: ActorContext, organizationId: string): Promise<CollectionList> {
  const member = await requireMember(db, actor, organizationId);
  const rows = await db.select().from(schema.groupCollections).where(eq(schema.groupCollections.organizationId, organizationId)).orderBy(desc(schema.groupCollections.updatedAt)).limit(200);
  const locations = await locationNames(db, organizationId);
  const counts = await submittedCounts(db, rows.map((row) => row.id));
  return {
    collections: rows
      .filter((row) => canSee(member, row))
      .map((row) => ({
        id: row.id,
        title: row.title,
        templateId: row.templateId,
        status: row.status,
        productName: (row.snapshot as Snapshot).productName,
        locationName: locations.find((location) => location.id === row.locationId)?.name ?? "",
        deadline: row.deadline?.toISOString() ?? null,
        submittedCount: counts.get(row.id) ?? 0,
        updatedAt: row.updatedAt.toISOString(),
      })),
    canManage: member.permissions.has("MANAGE_COLLECTIONS"),
  };
}

export async function loadCollection(db: Db, organizationId: string, id: string, options: { lock?: boolean } = {}) {
  const query = db.select().from(schema.groupCollections).where(and(eq(schema.groupCollections.id, id), eq(schema.groupCollections.organizationId, organizationId)));
  const [row] = options.lock ? await query.for("update") : await query;
  if (!row) throw new AppError("NOT_FOUND");
  return row;
}

export async function getCollection(deps: OrganizationDeps, actor: ActorContext, organizationId: string, id: string): Promise<Collection> {
  const member = await requireMember(deps.db, actor, organizationId);
  const row = await loadCollection(deps.db, organizationId, id);
  if (!canSee(member, row)) throw new AppError("NOT_FOUND");
  return view(deps, member, row, await locationNames(deps.db, organizationId), (await submittedCounts(deps.db, [row.id])).get(row.id) ?? 0);
}

/** Start a collection (B2B-FR-051) from an approved template the member can see, or their own saved design. */
export async function createCollection(deps: OrganizationDeps, actor: ActorContext, organizationId: string, input: CreateCollection): Promise<Collection> {
  const db = deps.db;
  const member = await requireMember(db, actor, organizationId);
  enforce(needsPermission(member, "MANAGE_COLLECTIONS"));
  enforce(canSeeLocation(member, input.locationId));
  const [location] = await db.select({ id: schema.locations.id }).from(schema.locations).where(and(eq(schema.locations.id, input.locationId), eq(schema.locations.organizationId, organizationId)));
  if (!location) throw new AppError("NOT_FOUND");

  let snapshot: Snapshot & Record<string, unknown>;
  let sourceConfigurationId: string;
  if (input.templateId) {
    const template = await getTemplate(db, actor, organizationId, input.templateId);
    if (template.status !== "APPROVED") throw new AppError("RULE_FAILED", { message: "Start from an approved template.", context: { reason: "TEMPLATE_NOT_APPROVED" } });
    if (!template.allLocations && !template.locations.some((item) => item.id === input.locationId)) throw new AppError("FORBIDDEN", { context: { reason: "TEMPLATE_NOT_FOR_LOCATION" } });
    sourceConfigurationId = (await templateSourceConfiguration(db, template.id))!;
    snapshot = { schema: "collection-source/v1", sourceLabel: `${template.name} (approved template)`, productName: template.productName, templateVersion: template.version, fields: template.fields.map(({ key, label, control }) => ({ key, label, control })) };
  } else {
    if (!(await ownsConfiguration(db, input.configurationId!, member.userId))) throw new AppError("NOT_FOUND");
    const spec = await configurationSpecification(db, input.configurationId!);
    if (!spec) throw new AppError("NOT_FOUND");
    sourceConfigurationId = input.configurationId!;
    snapshot = { schema: "collection-source/v1", sourceLabel: `${spec.productName} · your saved design`, productName: spec.productName, fields: spec.fields.map(({ key, label }) => ({ key, label, control: "EDITABLE" as const })) };
  }
  const fields = availability(snapshot.fields).filter((item) => item.available && item.field === "SIZE").map((item) => item.field);
  const [row] = await db.transaction(async (tx) => {
    const created = await tx
      .insert(schema.groupCollections)
      .values({ organizationId, locationId: input.locationId, title: input.title, templateId: input.templateId, sourceConfigurationId, fields, centralLocationId: input.locationId, snapshot, createdByUserId: member.userId })
      .returning();
    await recordAudit(tx, actor, { action: "collection.created", summary: `Group collection started: ${input.title}`, recordType: "GROUP_COLLECTION", recordId: created[0]!.id, after: { status: "DRAFT", templateId: input.templateId, configurationId: input.configurationId } });
    return created;
  });
  return view(deps, member, row!, await locationNames(db, organizationId));
}

export async function changeable(db: Db, actor: ActorContext, organizationId: string, id: string) {
  const member = await requireMember(db as Database, actor, organizationId);
  const row = await loadCollection(db, organizationId, id);
  if (!canSee(member, row)) throw new AppError("NOT_FOUND");
  if (!canManage(member, row)) throw new AppError("FORBIDDEN", { context: { reason: "PERMISSION_REQUIRED", permission: "MANAGE_COLLECTIONS" } });
  return { member, row };
}

/**
 * The organizer's choices (frame 132). Only fields the source allows can be
 * offered ("Participants only get allowed fields"). Changes happen while the
 * collection is a draft or paused, never while participants are filling in.
 */
export async function updateCollection(deps: OrganizationDeps, actor: ActorContext, organizationId: string, id: string, input: UpdateCollection): Promise<Collection> {
  const db = deps.db;
  const { member, row } = await changeable(db, actor, organizationId, id);
  const available = availability(sourceFields(row));
  const offered = [...new Set(input.fields)];
  const refused = offered.map((field) => available.find((item) => item.field === field)!).find((item) => !item.available);
  if (refused) throw new AppError("VALIDATION_FAILED", { fieldErrors: { fields: refused.reason ?? "This field can't be offered" } });
  const locations = await locationNames(db, organizationId);
  const known = new Set(locations.map((location) => location.id));
  if (input.centralLocationId && !known.has(input.centralLocationId)) throw new AppError("VALIDATION_FAILED", { fieldErrors: { centralLocationId: "Choose one of this workspace's locations" } });
  if (input.branchLocationIds.some((locationId) => !known.has(locationId))) throw new AppError("VALIDATION_FAILED", { fieldErrors: { branchLocationIds: "Choose this workspace's locations" } });
  if (input.deliveryMode === "CENTRAL" && !input.centralLocationId) throw new AppError("VALIDATION_FAILED", { fieldErrors: { centralLocationId: "Choose where everything is delivered" } });
  if (input.deliveryMode === "BRANCHES" && !input.branchLocationIds.length) throw new AppError("VALIDATION_FAILED", { fieldErrors: { branchLocationIds: "Choose the branches participants can pick from" } });

  await db.transaction(async (tx) => {
    const locked = await loadCollection(tx, organizationId, id, { lock: true });
    if (locked.version !== input.version) throw new AppError("VERSION_CONFLICT", { context: { currentVersion: locked.version } });
    if (locked.status !== "DRAFT" && locked.status !== "PAUSED") throw new AppError("RULE_FAILED", { message: "Pause the collection before changing it.", context: { reason: "NOT_EDITABLE", status: locked.status } });
    await tx
      .update(schema.groupCollections)
      .set({
        title: input.title,
        fields: PARTICIPANT_FIELDS.filter((field) => offered.includes(field)),
        deadline: input.deadline ? new Date(input.deadline) : null,
        deliveryMode: input.deliveryMode,
        centralLocationId: input.deliveryMode === "CENTRAL" ? input.centralLocationId : null,
        branchLocationIds: input.deliveryMode === "BRANCHES" ? [...new Set(input.branchLocationIds)] : [],
        unsureSizeRule: input.unsureSizeRule,
        version: locked.version + 1,
        updatedAt: actor.now,
      })
      .where(eq(schema.groupCollections.id, id));
    await recordAudit(tx, actor, {
      action: "collection.updated",
      summary: `Group collection set up: ${input.title}`,
      recordType: "GROUP_COLLECTION",
      recordId: id,
      after: { fields: offered, deadline: input.deadline, deliveryMode: input.deliveryMode },
    });
  });
  return view(deps, member, await loadCollection(db, organizationId, id), locations);
}

const NEXT: Record<"open" | "pause" | "cancel", { from: readonly CollectionStatus[]; to: CollectionStatus }> = {
  open: { from: ["DRAFT", "PAUSED"], to: "OPEN" },
  pause: { from: ["OPEN"], to: "PAUSED" },
  cancel: { from: ["DRAFT", "OPEN", "PAUSED", "CLOSED", "NEEDS_REVIEW", "READY_TO_ORDER"], to: "CANCELLED" },
};

/**
 * Open (share the link), pause (participants see "This collection is paused"
 * and can't submit) or cancel. Opening needs a deadline in the future and,
 * for a template, a template that is still approved.
 */
export async function changeCollection(deps: OrganizationDeps, actor: ActorContext, organizationId: string, id: string, action: "open" | "pause" | "cancel", version: number): Promise<Collection> {
  const db = deps.db;
  const { member, row } = await changeable(db, actor, organizationId, id);
  const step = NEXT[action];
  if (action === "open") {
    if (!row.deadline || row.deadline <= actor.now) throw new AppError("VALIDATION_FAILED", { fieldErrors: { deadline: "Choose a deadline in the future." } });
    if (row.deliveryMode === "CENTRAL" && !row.centralLocationId) throw new AppError("VALIDATION_FAILED", { fieldErrors: { centralLocationId: "Choose where everything is delivered" } });
    if (row.deliveryMode === "BRANCHES" && !row.branchLocationIds.length) throw new AppError("VALIDATION_FAILED", { fieldErrors: { branchLocationIds: "Choose the branches participants can pick from" } });
    if (row.templateId) {
      const template = await getTemplate(db, actor, organizationId, row.templateId).catch(() => null);
      if (template?.status !== "APPROVED") throw new AppError("RULE_FAILED", { message: "The template isn't approved any more. Update it first.", context: { reason: "TEMPLATE_NOT_APPROVED" } });
    }
  }
  await db.transaction(async (tx) => {
    const locked = await loadCollection(tx, organizationId, id, { lock: true });
    if (locked.version !== version) throw new AppError("VERSION_CONFLICT", { context: { currentVersion: locked.version } });
    if (!step.from.includes(locked.status)) throw new AppError("RULE_FAILED", { message: `This collection can't be ${action === "open" ? "opened" : action === "pause" ? "paused" : "cancelled"} now.`, context: { reason: "WRONG_STATUS", status: locked.status } });
    // One share link per collection, made when it first opens; kept sealed so the organizer can copy it again.
    const secret = action === "open" && !locked.shareSecretHash ? randomBytes(24).toString("base64url") : null;
    await tx
      .update(schema.groupCollections)
      .set({
        status: step.to,
        ...(secret && { shareSecretHash: sha256(secret), shareSecretSealed: seal(secret, deps.sealKey) }),
        ...(action === "open" && !locked.openedAt && { openedAt: actor.now }),
        version: locked.version + 1,
        updatedAt: actor.now,
      })
      .where(eq(schema.groupCollections.id, id));
    await recordAudit(tx, actor, { action: `collection.${action === "open" ? "opened" : action === "pause" ? "paused" : "cancelled"}`, summary: `Group collection ${step.to.toLowerCase()}: ${locked.title}`, recordType: "GROUP_COLLECTION", recordId: id, before: { status: locked.status }, after: { status: step.to } });
  });
  return view(deps, member, await loadCollection(db, organizationId, id), await locationNames(db, organizationId));
}

/**
 * What a participant sees on opening the share link (B2B-FR-060–061): the
 * collection's title, the organization, the allowed fields and modes. No
 * account, and nothing about anyone else. Drafts and cancelled collections
 * don't exist to the link.
 */
export async function collectionInvite(db: Database, secret: string, now: Date): Promise<CollectionInvite> {
  const [row] = await db.select().from(schema.groupCollections).where(eq(schema.groupCollections.shareSecretHash, sha256(secret)));
  if (!row || row.status === "DRAFT" || row.status === "CANCELLED") throw new AppError("NOT_FOUND");
  return inviteView(db, row, now);
}

/** The collection as a participant may see it: no counts, no other people, nothing about the organization's records. */
export async function inviteView(db: Db, row: Row, now: Date): Promise<CollectionInvite> {
  const [organization] = await db.select({ name: schema.organizations.name }).from(schema.organizations).where(eq(schema.organizations.id, row.organizationId));
  const branches = row.branchLocationIds.length ? await db.select({ id: schema.locations.id, name: schema.locations.name }).from(schema.locations).where(inArray(schema.locations.id, row.branchLocationIds)) : [];
  const closed = row.status !== "OPEN" && row.status !== "PAUSED";
  const pastDeadline = row.deadline !== null && row.deadline <= now;
  return {
    title: row.title,
    organizationName: organization?.name ?? "",
    productName: (row.snapshot as Snapshot).productName,
    status: closed || pastDeadline ? "CLOSED" : row.status === "PAUSED" ? "PAUSED" : "OPEN",
    deadline: row.deadline?.toISOString() ?? null,
    fields: row.fields as ParticipantField[],
    deliveryMode: row.deliveryMode,
    branches: branches.sort((a, b) => a.name.localeCompare(b.name)),
    unsureSizeRule: row.unsureSizeRule,
  };
}

/** How many have sent their answers, for the organizer (T12-03 adds the full dashboard). */
async function submittedCounts(db: Db, collectionIds: readonly string[]) {
  if (!collectionIds.length) return new Map<string, number>();
  const rows = await db
    .select({ collectionId: schema.participants.collectionId, count: sql<number>`count(*)::int` })
    .from(schema.participants)
    .where(and(inArray(schema.participants.collectionId, [...collectionIds]), eq(schema.participants.status, "SUBMITTED")))
    .groupBy(schema.participants.collectionId);
  return new Map(rows.map((row) => [row.collectionId, row.count]));
}

/**
 * Retention (TECH-06 §12): participants' names and emails go 12 months after
 * the collection's order was delivered, and their imported rows are emptied.
 * Their size answers stay. Returns how many participants were cleared.
 * ponytail: one SQL across orders and shipments; move behind an orders export if the delivered rule grows.
 */
export async function purgeParticipantContacts(db: Database, now: Date) {
  const cutoff = new Date(now.getTime() - 365 * 86_400_000).toISOString();
  const result = await db.execute<{ id: string }>(sql`
    with done as (
      select d.collection_id from order_drafts d
      left join order_requests r on r.id = d.order_request_id
      join quote_versions qv on qv.quote_id = coalesce(d.quote_id, r.quote_id)
      join orders o on o.quote_version_id = qv.id
      where d.status = 'SUBMITTED'
        and not exists (select 1 from order_items i where i.order_id = o.id and i.status not in ('DELIVERED', 'CANCELLED'))
        and (select max(s.delivered_at) from shipments s where s.order_id = o.id) < ${cutoff}::timestamptz)
    update participants set name = 'Removed participant', email = '', updated_at = ${now.toISOString()}::timestamptz
    where email <> '' and collection_id in (select collection_id from done)
    returning id`);
  const ids = result.rows.map((row) => row.id);
  if (ids.length) await db.update(schema.importRows).set({ raw: [], values: {} }).where(inArray(schema.importRows.participantId, ids));
  return ids.length;
}
