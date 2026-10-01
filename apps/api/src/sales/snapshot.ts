import type { Configuration, PriceResult } from "@holypearls/contracts";
import { asc, type Database, eq, schema } from "@holypearls/db";
import { productOptions } from "../configuration/pricing.js";

/**
 * Everything production and accounts need about one item, frozen when the
 * checkout starts (review P1-06). T04-05 makes the order from this alone,
 * never from the catalogue or the design as they are later: renaming the
 * product, relabelling an option, changing a price rule or VAT, or editing the
 * design afterwards leaves it as it was. Versioned so a later shape can sit
 * beside it.
 */
export interface OrderableConfigurationSnapshotV1 {
  schema: "orderable-configuration/v1";
  takenAt: string;
  configuration: { id: string; version: number };
  product: { id: string; slug: string; name: string; family: string };
  /** Each answer with the labels the customer saw. */
  choices: { option: string; optionLabel: string; value: string; valueLabel: string }[];
  quantity: number;
  rush: Configuration["rush"];
  artwork: Configuration["artwork"];
  garment: {
    sourcing: string | null;
    decoration: string | null;
    details: Record<string, unknown>;
    sizesUnknown: boolean;
    sizes: { size: string; quantity: number }[];
    placements: { position: string; size: string; method: string | null; note: string | null }[];
  } | null;
  /** Every personalised row, not just the preview. */
  personalization: { row: number; name: string | null; number: string | null; department: string | null; size: string | null }[];
  /** The files as stored; T04-05 keeps them for the order. */
  files: { linkId: string; fileId: string; role: string; name: string; storageKey: string; type: string; sizeBytes: number | null; status: string; lowResolutionAction: string | null }[];
  /** The whole price result, lines and rule versions included (price_results rows are cleaned up after 30 days). */
  price: PriceResult;
  tax: { settingId: string | null; vatRateBps: number; vatOnDelivery: boolean };
}

export async function orderableSnapshot(
  db: Database,
  row: typeof schema.configurations.$inferSelect,
  draft: Configuration,
  tax: OrderableConfigurationSnapshotV1["tax"],
  now: Date,
): Promise<OrderableConfigurationSnapshotV1> {
  const options = await productOptions(db, row.productId);
  const choices = Object.entries(draft.choices).flatMap(([optionKey, valueKey]) => {
    const option = options.find((item) => item.key === optionKey);
    const value = option?.values.find((item) => item.key === valueKey);
    return option && value ? [{ option: optionKey, optionLabel: option.label, value: valueKey, valueLabel: value.label }] : [];
  });
  const personalization = await db
    .select({
      row: schema.configurationPersonalizationRows.row,
      name: schema.configurationPersonalizationRows.name,
      number: schema.configurationPersonalizationRows.number,
      department: schema.configurationPersonalizationRows.department,
      size: schema.configurationPersonalizationRows.size,
    })
    .from(schema.configurationPersonalizationRows)
    .where(eq(schema.configurationPersonalizationRows.configurationId, row.id))
    .orderBy(asc(schema.configurationPersonalizationRows.row));
  const files = await db
    .select({ link: schema.configurationFiles, file: schema.files })
    .from(schema.configurationFiles)
    .innerJoin(schema.files, eq(schema.files.id, schema.configurationFiles.fileId))
    .where(eq(schema.configurationFiles.configurationId, row.id))
    .orderBy(asc(schema.configurationFiles.createdAt));
  const garment = draft.garment;
  return {
    schema: "orderable-configuration/v1",
    takenAt: now.toISOString(),
    configuration: { id: row.id, version: row.version },
    product: { id: row.productId, slug: draft.productSlug, name: draft.productName, family: draft.family },
    choices,
    quantity: draft.price!.quantity,
    rush: draft.rush,
    artwork: draft.artwork,
    garment: garment
      ? {
          sourcing: garment.sourcing,
          decoration: garment.decoration,
          details: garment.details as Record<string, unknown>,
          sizesUnknown: garment.sizesUnknown,
          sizes: garment.sizes,
          placements: garment.placements.map((placement) => ({ position: placement.position, size: placement.size, method: placement.method ?? null, note: placement.note ?? null })),
        }
      : null,
    personalization,
    files: files.map(({ link, file }) => ({
      linkId: link.id,
      fileId: file.id,
      role: link.role,
      name: file.safeName,
      storageKey: file.storageKey,
      type: file.detectedType ?? file.declaredType,
      sizeBytes: file.sizeBytes,
      status: file.status,
      lowResolutionAction: link.lowResolutionAction,
    })),
    price: draft.price!,
    tax,
  };
}
