import type { InstallationArea, InstallationRules, InstallationSetup } from "@holypearls/contracts";
import type { installationAreaInputSchema } from "@holypearls/contracts";
import { asc, type Database, eq, inArray, schema, sql, type Transaction } from "@holypearls/db";
import type { z } from "zod";
import { AppError } from "../errors.js";
import type { ActorContext } from "../identity/actor.js";
import { recordAudit } from "../platform/audit.js";

/*
 * Installation areas, capabilities and rules (T13-01c; OPS-FR-102; Pen 119).
 * PRICING_MANAGE; every change audited. The configuration module prices an
 * installation from these (configuration/installation.ts).
 */

type Db = Database | Transaction;
type AreaRow = typeof schema.installationAreas.$inferSelect;
const INSTALLABLE_FAMILIES = ["LARGE_FORMAT", "WALL_ART"];

/** The areas and rules, as the price calculation needs them. */
export async function installationSetup(db: Db) {
  const [areas, [rules]] = await Promise.all([
    db.select().from(schema.installationAreas).orderBy(asc(schema.installationAreas.position), asc(schema.installationAreas.createdAt)),
    db.select().from(schema.installationRules).where(eq(schema.installationRules.id, 1)),
  ]);
  return { areas, rules: { surveyAboveSqM: rules?.surveyAboveSqM ?? null, noticeWorkingDays: rules?.noticeWorkingDays ?? null, version: rules?.version ?? 0 } };
}

async function view(db: Db): Promise<InstallationSetup> {
  const { areas, rules } = await installationSetup(db);
  const installable = await db
    .select({ id: schema.products.id, name: schema.products.name })
    .from(schema.products)
    .where(inArray(schema.products.family, INSTALLABLE_FAMILIES as never[]))
    .orderBy(asc(schema.products.name));
  const names = new Map(installable.map((product) => [product.id, product.name]));
  const toArea = (row: AreaRow): InstallationArea => ({
    id: row.id,
    name: row.name,
    states: row.states,
    products: row.productIds.map((id) => ({ id, name: names.get(id) ?? "Removed product" })),
    pricing: row.pricing as InstallationArea["pricing"],
    rateMinor: row.rateMinor?.toString() ?? null,
    travelMinor: row.travelMinor?.toString() ?? null,
    version: row.version,
  });
  return { areas: areas.map(toArea), rules, installable };
}

export const getInstallationSetup = (db: Database) => view(db);

/** Adds (no id, version 0) or changes an area. A state is in one area at most, so a price never depends on order. */
export async function saveInstallationArea(db: Database, actor: ActorContext, id: string | null, input: z.infer<typeof installationAreaInputSchema>): Promise<InstallationSetup> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('installation_areas'))`);
    const areas = await tx.select().from(schema.installationAreas);
    const others = areas.filter((area) => area.id !== id);
    const taken = input.states.find((state) => others.some((area) => area.states.includes(state)));
    if (taken) throw new AppError("VALIDATION_FAILED", { fieldErrors: { states: `${taken} is already in ${others.find((area) => area.states.includes(taken))!.name}. Remove it from one area.` } });
    if (others.some((area) => area.name.trim().toLowerCase() === input.name.trim().toLowerCase())) throw new AppError("VALIDATION_FAILED", { fieldErrors: { name: "Another area already has this name" } });
    const values = {
      name: input.name,
      states: [...new Set(input.states)],
      productIds: [...new Set(input.productIds)],
      pricing: input.pricing,
      rateMinor: input.pricing === "QUOTE" ? null : BigInt(input.rateMinor!),
      travelMinor: input.pricing === "FIXED_PLUS_TRAVEL" ? BigInt(input.travelMinor!) : null,
    };
    let row: AreaRow | undefined;
    if (id === null) {
      [row] = await tx.insert(schema.installationAreas).values({ ...values, position: areas.length }).returning();
    } else {
      const current = areas.find((area) => area.id === id);
      if (!current) throw new AppError("NOT_FOUND");
      if (current.version !== input.version) throw new AppError("VERSION_CONFLICT", { context: { currentVersion: current.version } });
      [row] = await tx
        .update(schema.installationAreas)
        .set({ ...values, version: current.version + 1, updatedAt: actor.now })
        .where(eq(schema.installationAreas.id, id))
        .returning();
    }
    await recordAudit(tx, actor, {
      action: id === null ? "installation.area_created" : "installation.area_changed",
      summary: `Installation area ${input.name}: ${input.pricing === "QUOTE" ? "quote required" : input.pricing === "FIXED" ? "fixed per piece" : "fixed plus travel"}`,
      recordType: "INSTALLATION_AREA",
      recordId: row!.id,
      recordLabel: input.name,
      after: { states: values.states, products: values.productIds.length, pricing: values.pricing, rateMinor: values.rateMinor?.toString() ?? null, travelMinor: values.travelMinor?.toString() ?? null },
      permission: "PRICING_MANAGE",
    });
  });
  return view(db);
}

export async function removeInstallationArea(db: Database, actor: ActorContext, id: string): Promise<InstallationSetup> {
  await db.transaction(async (tx) => {
    const [row] = await tx.delete(schema.installationAreas).where(eq(schema.installationAreas.id, id)).returning();
    if (!row) throw new AppError("NOT_FOUND");
    await recordAudit(tx, actor, { action: "installation.area_removed", summary: `Installation area ${row.name} removed`, recordType: "INSTALLATION_AREA", recordId: id, recordLabel: row.name, permission: "PRICING_MANAGE" });
  });
  return view(db);
}

/** The two rules (Pen 119): a site survey above a size, and the notice needed. Null turns one off. */
export async function saveInstallationRules(db: Database, actor: ActorContext, input: InstallationRules): Promise<InstallationSetup> {
  await db.transaction(async (tx) => {
    const [current] = await tx.select().from(schema.installationRules).where(eq(schema.installationRules.id, 1)).for("update");
    if ((current?.version ?? 0) !== input.version) throw new AppError("VERSION_CONFLICT", { context: { currentVersion: current?.version ?? 0 } });
    const values = { surveyAboveSqM: input.surveyAboveSqM, noticeWorkingDays: input.noticeWorkingDays, updatedAt: actor.now };
    if (current) await tx.update(schema.installationRules).set({ ...values, version: current.version + 1 }).where(eq(schema.installationRules.id, 1));
    else await tx.insert(schema.installationRules).values({ id: 1, ...values });
    await recordAudit(tx, actor, {
      action: "installation.rules_changed",
      summary: `Installation rules: survey ${input.surveyAboveSqM ? `over ${input.surveyAboveSqM} m²` : "off"}, notice ${input.noticeWorkingDays ? `${input.noticeWorkingDays} working days` : "off"}`,
      recordType: "INSTALLATION_RULES",
      recordId: "1",
      before: current ? { surveyAboveSqM: current.surveyAboveSqM, noticeWorkingDays: current.noticeWorkingDays } : null,
      after: { surveyAboveSqM: input.surveyAboveSqM, noticeWorkingDays: input.noticeWorkingDays },
      permission: "PRICING_MANAGE",
    });
  });
  return view(db);
}
