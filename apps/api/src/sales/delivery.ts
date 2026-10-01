import { type deliveryZoneInputSchema, type DeliveryZone, type fixedZoneInputSchema } from "@holypearls/contracts";
import { and, asc, type Database, eq, schema, sql } from "@holypearls/db";
import type { z } from "zod";
import { AppError } from "../errors.js";
import type { ActorContext } from "../identity/actor.js";
import { recordAudit } from "../platform/audit.js";

/*
 * Delivery zones and rates (T04-01, OPS-FR-100–101, Pen 108) and the checkout
 * total. Every Nigerian address resolves to exactly one zone: an LGA match,
 * else a whole-state match, else the rest-of-Nigeria zone. Addresses abroad go
 * to International (freight by quote).
 */

export interface Cover {
  state: string;
  lga: string | null;
}

export interface ZoneRule {
  id: string;
  name: string;
  kind: "AREA" | "REST_OF_NIGERIA" | "INTERNATIONAL";
  covers: Cover[];
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function zoneFor<Z extends ZoneRule>(zones: Z[], address: { country: string; state: string; area: string }): Z | null {
  if (address.country !== "NG") return zones.find((zone) => zone.kind === "INTERNATIONAL") ?? null;
  const areas = zones.filter((zone) => zone.kind === "AREA");
  const byLga = areas.find((zone) => zone.covers.some((cover) => cover.lga !== null && same(cover.state, address.state) && same(cover.lga, address.area)));
  if (byLga) return byLga;
  const byState = areas.find((zone) => zone.covers.some((cover) => cover.lga === null && same(cover.state, address.state)));
  return byState ?? zones.find((zone) => zone.kind === "REST_OF_NIGERIA") ?? null;
}

/**
 * Covers in `candidate` that another zone already has. A whole state clashes
 * with any part of it elsewhere, and an LGA with its whole state elsewhere.
 */
export function zoneOverlaps(zones: ZoneRule[], candidate: { id: string | null; covers: Cover[] }): { cover: string; zone: string }[] {
  const found: { cover: string; zone: string }[] = [];
  const clash = (a: Cover, b: Cover) => same(a.state, b.state) && (a.lga === null || b.lga === null || same(a.lga, b.lga));
  candidate.covers.forEach((cover, index) => {
    const label = cover.lga ?? cover.state;
    if (candidate.covers.slice(0, index).some((earlier) => clash(earlier, cover))) {
      found.push({ cover: label, zone: "this zone" });
      return;
    }
    for (const zone of zones) {
      if (zone.id === candidate.id || zone.kind !== "AREA") continue;
      if (zone.covers.some((other) => clash(other, cover))) found.push({ cover: label, zone: zone.name });
    }
  });
  return found;
}

/**
 * Totals for the ready items plus delivery. Each item's VAT is what the price
 * calculator worked out for it (so VAT-inclusive prices stay as shown);
 * delivery rates are before VAT, and get VAT when the setting says so.
 */
export function checkoutTotals(
  items: { vatMinor: bigint; totalMinor: bigint }[],
  delivery: { amountMinor: bigint } | null,
  tax: { vatRateBps: number; vatOnDelivery: boolean },
) {
  const itemsTotal = items.reduce((sum, item) => sum + item.totalMinor, 0n);
  const itemsVat = items.reduce((sum, item) => sum + item.vatMinor, 0n);
  const deliveryMinor = delivery?.amountMinor ?? null;
  const deliveryVat = deliveryMinor !== null && tax.vatOnDelivery ? (deliveryMinor * BigInt(tax.vatRateBps) + 5_000n) / 10_000n : 0n;
  const vatMinor = itemsVat + deliveryVat;
  const totalMinor = itemsTotal + (deliveryMinor ?? 0n) + deliveryVat;
  return { goodsMinor: totalMinor - vatMinor - (deliveryMinor ?? 0n), deliveryMinor, vatMinor, totalMinor };
}

// ——— Stored zones ———

type ZoneRow = typeof schema.deliveryZones.$inferSelect;

export const toZone = (row: ZoneRow): DeliveryZone => ({
  id: row.id,
  name: row.name,
  kind: row.kind,
  covers: row.covers as DeliveryZone["covers"],
  pricing: row.pricing,
  rateMinor: row.rateMinor === null ? null : row.rateMinor.toString(),
  transitMinDays: row.transitMinDays,
  transitMaxDays: row.transitMaxDays,
  version: row.version,
});

export async function loadZones(db: Database): Promise<ZoneRow[]> {
  return db.select().from(schema.deliveryZones).orderBy(asc(schema.deliveryZones.position), asc(schema.deliveryZones.createdAt));
}

export async function listZones(db: Database) {
  return { zones: (await loadZones(db)).map(toZone) };
}

const summary = (input: { pricing: "FIXED" | "QUOTE"; rateMinor: string | null }) =>
  input.pricing === "QUOTE" ? "quote required" : `₦${(Number(input.rateMinor) / 100).toLocaleString("en-NG")}`;

function overlapError(overlaps: { cover: string; zone: string }[]) {
  const first = overlaps[0]!;
  const message =
    first.zone === "this zone" ? `${first.cover} is listed twice. Remove one.` : `${first.cover} is already in ${first.zone}. Remove it from one zone.`;
  return new AppError("VALIDATION_FAILED", { fieldErrors: { covers: message } });
}

export async function createZone(db: Database, actor: ActorContext, input: z.infer<typeof deliveryZoneInputSchema>) {
  return db.transaction(async (tx) => {
    // One writer at a time, so two staff can't add overlapping zones at once.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('delivery_zones'))`);
    const zones = await loadZones(tx as unknown as Database);
    const overlaps = zoneOverlaps(zones.map((zone) => ({ ...zone, covers: zone.covers as Cover[] })), { id: null, covers: input.covers });
    if (overlaps.length) throw overlapError(overlaps);
    if (zones.some((zone) => same(zone.name, input.name))) throw new AppError("VALIDATION_FAILED", { fieldErrors: { name: "Another zone already has this name" } });
    const [row] = await tx
      .insert(schema.deliveryZones)
      .values({
        name: input.name,
        kind: "AREA",
        covers: input.covers,
        pricing: input.pricing,
        rateMinor: input.pricing === "FIXED" ? BigInt(input.rateMinor!) : null,
        transitMinDays: input.transitMinDays,
        transitMaxDays: input.transitMaxDays,
        position: zones.filter((zone) => zone.kind === "AREA").length,
      })
      .returning();
    await recordAudit(tx, actor, {
      action: "delivery.zone_created",
      summary: `Delivery zone ${input.name}: ${summary(input)}`,
      recordType: "DELIVERY_ZONE",
      recordId: row!.id,
      recordLabel: input.name,
      after: input,
      permission: "PRICING_MANAGE",
    });
    return toZone(row!);
  });
}

export async function updateZone(db: Database, actor: ActorContext, id: string, input: z.infer<typeof deliveryZoneInputSchema> | z.infer<typeof fixedZoneInputSchema>) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('delivery_zones'))`);
    const zones = await loadZones(tx as unknown as Database);
    const before = zones.find((zone) => zone.id === id);
    if (!before) throw new AppError("NOT_FOUND");
    const area = before.kind === "AREA" && "covers" in input;
    if (before.kind === "AREA" && !("covers" in input)) throw new AppError("VALIDATION_FAILED", { fieldErrors: { covers: "Choose at least one state or LGA" } });
    if (area) {
      const overlaps = zoneOverlaps(zones.map((zone) => ({ ...zone, covers: zone.covers as Cover[] })), { id, covers: input.covers });
      if (overlaps.length) throw overlapError(overlaps);
      if (zones.some((zone) => zone.id !== id && same(zone.name, input.name))) throw new AppError("VALIDATION_FAILED", { fieldErrors: { name: "Another zone already has this name" } });
    }
    if (input.pricing === "FIXED" && input.rateMinor === null) throw new AppError("VALIDATION_FAILED", { fieldErrors: { rateMinor: "Enter the rate, or choose Quote required" } });
    const [row] = await tx
      .update(schema.deliveryZones)
      .set({
        ...(area ? { name: input.name, covers: input.covers } : {}),
        pricing: input.pricing,
        rateMinor: input.pricing === "FIXED" ? BigInt(input.rateMinor!) : null,
        transitMinDays: input.transitMinDays,
        transitMaxDays: input.transitMaxDays,
        version: sql`${schema.deliveryZones.version} + 1`,
      })
      .where(and(eq(schema.deliveryZones.id, id), ...(input.version === undefined ? [] : [eq(schema.deliveryZones.version, input.version)])))
      .returning();
    if (!row) throw new AppError("CONFLICT", { message: "Someone else changed this zone. Reload to see their change.", context: { reason: "STALE_VERSION" } });
    await recordAudit(tx, actor, {
      action: "delivery.zone_changed",
      summary: `Delivery zone ${row.name}: ${summary({ pricing: row.pricing, rateMinor: row.rateMinor?.toString() ?? null })}`,
      recordType: "DELIVERY_ZONE",
      recordId: id,
      recordLabel: row.name,
      before: toZone(before),
      after: toZone(row),
      permission: "PRICING_MANAGE",
    });
    return toZone(row);
  });
}

export async function deleteZone(db: Database, actor: ActorContext, id: string) {
  await db.transaction(async (tx) => {
    const [row] = await tx.delete(schema.deliveryZones).where(and(eq(schema.deliveryZones.id, id), eq(schema.deliveryZones.kind, "AREA"))).returning();
    if (!row) throw new AppError("NOT_FOUND");
    await recordAudit(tx, actor, {
      action: "delivery.zone_removed",
      summary: `Delivery zone ${row.name} removed`,
      recordType: "DELIVERY_ZONE",
      recordId: id,
      recordLabel: row.name,
      before: toZone(row),
      permission: "PRICING_MANAGE",
    });
  });
}
