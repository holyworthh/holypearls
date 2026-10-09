import { type Database, eq, schema } from "@holypearls/db";

/*
 * Copying a configuration (reorder, T08-01; template orders, T11-01c). The
 * original is never changed: the copy gets the same answers, sizes,
 * placements, personalisation rows and file links, pointed at a new row.
 */

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Row = typeof schema.configurations.$inferSelect;
type Insert = typeof schema.configurations.$inferInsert;

/** Inserts the copy with `values` over the original's answers and returns its id. */
export async function insertConfigurationCopy(tx: Tx, original: Row, values: Pick<Insert, "ownerUserId" | "ownerDeviceHash" | "customerId"> & Partial<Insert>): Promise<string> {
  const [row] = await tx
    .insert(schema.configurations)
    .values({
      productId: original.productId,
      quantity: original.quantity,
      rush: "STANDARD",
      artwork: original.artwork,
      artworkFileId: original.artworkFileId,
      step: "review",
      sourcing: original.sourcing,
      decoration: original.decoration,
      details: original.details,
      sizesUnknown: original.sizesUnknown,
      ...values,
    })
    .returning({ id: schema.configurations.id });
  const copy = row!.id;
  // Same rows, new owner: drop each row's own id and point it at the copy.
  const strip = <T extends Record<string, unknown>>(rows: T[]) =>
    rows.map((item) => {
      const rest: Record<string, unknown> = { ...item };
      delete rest.id;
      return { ...rest, configurationId: copy };
    });
  const [selections, sizes, placements, people, files] = await Promise.all([
    tx.select().from(schema.configurationSelections).where(eq(schema.configurationSelections.configurationId, original.id)),
    tx.select().from(schema.configurationSizes).where(eq(schema.configurationSizes.configurationId, original.id)),
    tx.select().from(schema.configurationPlacements).where(eq(schema.configurationPlacements.configurationId, original.id)),
    tx.select().from(schema.configurationPersonalizationRows).where(eq(schema.configurationPersonalizationRows.configurationId, original.id)),
    tx.select().from(schema.configurationFiles).where(eq(schema.configurationFiles.configurationId, original.id)),
  ]);
  if (selections.length) await tx.insert(schema.configurationSelections).values(strip(selections) as (typeof schema.configurationSelections.$inferInsert)[]);
  if (sizes.length) await tx.insert(schema.configurationSizes).values(strip(sizes) as (typeof schema.configurationSizes.$inferInsert)[]);
  if (placements.length) await tx.insert(schema.configurationPlacements).values(strip(placements) as (typeof schema.configurationPlacements.$inferInsert)[]);
  if (people.length) await tx.insert(schema.configurationPersonalizationRows).values(strip(people) as (typeof schema.configurationPersonalizationRows.$inferInsert)[]);
  if (files.length) await tx.insert(schema.configurationFiles).values(strip(files) as (typeof schema.configurationFiles.$inferInsert)[]);
  return copy;
}
