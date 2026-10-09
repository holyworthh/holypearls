import { and, type Database, desc, eq, schema, type Transaction } from "@holypearls/db";
import { draftView } from "./drafts.js";
import { productOptions } from "./pricing.js";

/*
 * A configuration as a list of named fields, for Workspace Product Templates
 * (T11-01b; PRD-05 B2B-FR-030–031). The configuration module describes its
 * own records; the organizations module decides which fields are locked
 * (TECH-00 §5).
 */

export interface SpecificationField {
  key: string;
  label: string;
  value: string;
  /** Brand decisions start locked; per-order answers start editable (Stage 3.1F Part I). */
  suggested: "LOCKED" | "EDITABLE";
}

export interface Specification {
  productId: string;
  productName: string;
  productSlug: string;
  family: string;
  fields: SpecificationField[];
}

const words = (value: string) => value.toLowerCase().replace(/_/g, " ");

/** The configuration's choices and garment answers as template fields, plus the fields every order sets. */
export async function configurationSpecification(db: Database | Transaction, configurationId: string): Promise<Specification | null> {
  const [row] = await db.select().from(schema.configurations).where(eq(schema.configurations.id, configurationId));
  if (!row) return null;
  const view = await draftView(db as Database, row, new Date());
  const options = await productOptions(db as Database, row.productId);
  const fields: SpecificationField[] = options.flatMap((option) => {
    const value = option.values.find((item) => item.key === view.choices[option.key]);
    return value ? [{ key: `option:${option.key}`, label: option.label, value: value.label, suggested: "LOCKED" as const }] : [];
  });
  if (view.garment) {
    if (view.garment.sourcing) fields.push({ key: "garment:sourcing", label: "Garment", value: words(view.garment.sourcing), suggested: "LOCKED" });
    if (view.garment.decoration) fields.push({ key: "garment:decoration", label: "Decoration", value: words(view.garment.decoration), suggested: "LOCKED" });
    if (view.garment.placements.length) {
      fields.push({ key: "garment:placements", label: "Placement", value: view.garment.placements.map((placement) => words(placement.position)).join(", "), suggested: "LOCKED" });
    }
    fields.push({ key: "sizes", label: "Size mix", value: "Chosen per order", suggested: "EDITABLE" });
    fields.push({ key: "personalization", label: "Personalisation", value: "Names per person, if allowed", suggested: "EDITABLE" });
  }
  fields.push({ key: "quantity", label: "Quantity", value: view.quantity ? `${view.quantity.toLocaleString("en-NG")} last time` : "Chosen per order", suggested: "EDITABLE" });
  fields.push({ key: "delivery", label: "Deliver to", value: "One of the template's locations", suggested: "EDITABLE" });
  return { productId: row.productId, productName: view.productName, productSlug: view.productSlug, family: view.family, fields };
}

/** The person's saved designs, newest first, as places a template can start from. */
export async function draftSources(db: Database, userId: string, limit = 20) {
  const rows = await db
    .select({ id: schema.configurations.id, productName: schema.products.name, updatedAt: schema.configurations.updatedAt })
    .from(schema.configurations)
    .innerJoin(schema.products, eq(schema.products.id, schema.configurations.productId))
    .where(and(eq(schema.configurations.ownerUserId, userId), eq(schema.configurations.status, "DRAFT")))
    .orderBy(desc(schema.configurations.updatedAt))
    .limit(limit);
  return rows.map((row) => ({ configurationId: row.id, productName: row.productName, label: `${row.productName} · saved design`, kind: "DRAFT" as const }));
}

/** Is this configuration one the person may start a template from: their own design? */
export async function ownsConfiguration(db: Database | Transaction, configurationId: string, userId: string) {
  const [row] = await db.select({ owner: schema.configurations.ownerUserId }).from(schema.configurations).where(eq(schema.configurations.id, configurationId));
  return row?.owner === userId;
}

/** Is the product still on sale with its options (a template's production check, frame 117)? */
export async function productIsLive(db: Database | Transaction, productId: string) {
  const [row] = await db.select({ status: schema.products.status }).from(schema.products).where(eq(schema.products.id, productId));
  return row?.status === "PUBLISHED";
}

/** A configuration's chosen option values by option key. */
export async function configurationChoices(db: Database | Transaction, configurationId: string): Promise<Record<string, string>> {
  const rows = await db.select({ option: schema.configurationSelections.optionKey, value: schema.configurationSelections.valueKey }).from(schema.configurationSelections).where(eq(schema.configurationSelections.configurationId, configurationId));
  return Object.fromEntries(rows.map((row) => [row.option, row.value]));
}
