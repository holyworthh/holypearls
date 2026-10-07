import type { CourierSettings, courierSettingsInputSchema } from "@holypearls/contracts";
import { and, type Database, eq, inArray, schema, sql } from "@holypearls/db";
import type { z } from "zod";
import { AppError } from "../errors.js";
import type { ActorContext } from "../identity/actor.js";
import { recordAudit } from "../platform/audit.js";
import { chooseRate, type Courier, CourierError, parcelFor, type ShippingLine } from "./courier.js";

/*
 * Courier prices at checkout (T08-05). Called when a checkout address falls
 * outside the fixed zones. Returns a price, or the reason staff must price it.
 */

type SettingsRow = typeof schema.courierSettings.$inferSelect;
type Pickup = { name: string; email: string; phone: string; address: string; addressCode: number };

async function settingsRow(db: Database): Promise<SettingsRow | null> {
  const [row] = await db.select().from(schema.courierSettings).limit(1);
  return row ?? null;
}

export function settingsView(row: SettingsRow | null, courier: Courier | null): CourierSettings {
  return {
    enabled: row?.enabled ?? false,
    rule: (row?.rule ?? "CHEAPEST") as CourierSettings["rule"],
    categoryId: row?.categoryId ?? null,
    pickup: (row?.pickup as Pickup | null) ?? null,
    available: courier !== null,
    version: row?.version ?? 0,
  };
}

export async function getCourierSettings(db: Database, courier: Courier | null) {
  return settingsView(await settingsRow(db), courier);
}

/** Saves the settings (PRICING_MANAGE). The pickup address is checked with the courier first. Audited. */
export async function saveCourierSettings(db: Database, courier: Courier | null, actor: ActorContext, input: z.infer<typeof courierSettingsInputSchema>) {
  const before = await settingsRow(db);
  if ((before?.version ?? 0) !== input.version) throw new AppError("VERSION_CONFLICT", { context: { latest: settingsView(before, courier) } });
  if (input.enabled && !courier) throw new AppError("RULE_FAILED", { message: "Add the Shipbubble key to the API's settings before switching courier prices on.", context: { reason: "NO_COURIER_KEY" } });
  const old = before?.pickup as Pickup | null;
  const same = old && old.name === input.pickup.name && old.email === input.pickup.email && old.phone === input.pickup.phone && old.address === input.pickup.address;
  let addressCode = same ? old.addressCode : null;
  if (addressCode === null && courier) {
    try {
      addressCode = await courier.validateAddress(input.pickup);
    } catch (error) {
      if (error instanceof CourierError) throw new AppError("VALIDATION_FAILED", { fieldErrors: { "pickup.address": `The courier couldn't find this address. ${error.message}` } });
      throw error;
    }
  }
  const values = { enabled: input.enabled, rule: input.rule, categoryId: input.categoryId, pickup: addressCode === null ? null : { ...input.pickup, addressCode }, updatedAt: new Date() };
  const saved = await db.transaction(async (tx) => {
    const [row] = before
      ? await tx
          .update(schema.courierSettings)
          .set({ ...values, version: sql`${schema.courierSettings.version} + 1` })
          .where(and(eq(schema.courierSettings.id, before.id), eq(schema.courierSettings.version, before.version)))
          .returning()
      : await tx.insert(schema.courierSettings).values(values).returning();
    if (!row) throw new AppError("VERSION_CONFLICT");
    await recordAudit(tx, actor, {
      action: "delivery.courier_settings_changed",
      summary: `Courier prices ${input.enabled ? "on" : "off"} (${input.rule.toLowerCase()})`,
      recordType: "COURIER_SETTINGS",
      recordId: row.id,
      before: before ? { enabled: before.enabled, rule: before.rule, categoryId: before.categoryId } : null,
      after: { enabled: input.enabled, rule: input.rule, categoryId: input.categoryId },
      permission: "PRICING_MANAGE",
    });
    return row;
  });
  return settingsView(saved, courier);
}

/** The next working day in Lagos, as Shipbubble's pickup date (it books at most 7 days ahead). */
export function pickupDate(now: Date) {
  const lagos = new Date(now.getTime() + 60 * 60 * 1000);
  do lagos.setUTCDate(lagos.getUTCDate() + 1);
  while (lagos.getUTCDay() === 0 || lagos.getUTCDay() === 6);
  return lagos.toISOString().slice(0, 10);
}

export interface CourierItem {
  productId: string;
  productName: string;
  quantity: number;
  /** Before VAT, for the whole line, in kobo. */
  goodsMinor: bigint;
  /** option key → value key */
  choices: Record<string, string>;
}

/** Each line's shipping data, from the product or its chosen size; null when any line has none. */
async function shippingLines(db: Database, items: CourierItem[]): Promise<ShippingLine[] | null> {
  const productIds = [...new Set(items.map((item) => item.productId))];
  const products = await db
    .select({ id: schema.products.id, weight: schema.products.shippingWeightGrams, box: schema.products.packageCm, perBox: schema.products.unitsPerPackage })
    .from(schema.products)
    .where(inArray(schema.products.id, productIds));
  const overrides = await db
    .select({ productId: schema.productOptions.productId, option: schema.productOptions.key, value: schema.productOptionValues.key, weight: schema.productOptionValues.shippingWeightGrams, box: schema.productOptionValues.packageCm })
    .from(schema.productOptionValues)
    .innerJoin(schema.productOptions, eq(schema.productOptions.id, schema.productOptionValues.optionId))
    .where(inArray(schema.productOptions.productId, productIds));
  const lines: ShippingLine[] = [];
  for (const item of items) {
    const product = products.find((row) => row.id === item.productId);
    const chosen = overrides.filter((row) => row.productId === item.productId && item.choices[row.option] === row.value && (row.weight !== null || row.box !== null));
    const weight = chosen.find((row) => row.weight !== null)?.weight ?? product?.weight ?? null;
    const box = chosen.find((row) => row.box !== null)?.box ?? product?.box ?? null;
    if (!weight || !box || item.quantity < 1) return null;
    lines.push({ name: item.productName, quantity: item.quantity, unitMinor: item.goodsMinor / BigInt(item.quantity), weightGrams: weight, packageCm: box, unitsPerPackage: product?.perBox ?? 1 });
  }
  return lines;
}

export type CourierResult =
  | { ok: true; rateMinor: string; courierName: string; serviceCode: string; eta: string | null; requestToken: string }
  | { ok: false; problem: string | null };

/**
 * A live courier price for a Nigerian address outside the zones, before VAT
 * (VAT on delivery follows the tax setting, as for zone rates). `problem` is
 * for staff; null means courier prices simply aren't set up.
 */
export async function courierPrice(
  db: Database,
  courier: Courier | null,
  input: { items: CourierItem[]; contact: { name: string; email: string; phone: string }; address: { street: string; area: string; state: string; country: string; landmark?: string | null }; now: Date },
): Promise<CourierResult> {
  if (!courier || input.address.country !== "NG") return { ok: false, problem: null };
  const settings = await settingsRow(db);
  const pickup = settings?.pickup as Pickup | null;
  if (!settings?.enabled || !pickup || !settings.categoryId) return { ok: false, problem: null };
  const lines = await shippingLines(db, input.items);
  if (!lines) return { ok: false, problem: "A product in this order has no shipping weight or box size yet." };
  try {
    const receiverCode = await courier.validateAddress({
      name: input.contact.name,
      email: input.contact.email,
      phone: input.contact.phone,
      address: [input.address.street, input.address.area, input.address.state, "Nigeria"].filter(Boolean).join(", "),
    });
    const quote = await courier.rates({ senderCode: pickup.addressCode, receiverCode, pickupDate: pickupDate(input.now), categoryId: settings.categoryId, parcel: parcelFor(lines) });
    const rate = chooseRate(quote.rates, settings.rule === "FASTEST" ? "FASTEST" : "CHEAPEST");
    if (!rate) return { ok: false, problem: "No courier collects from the workshop for this address." };
    return { ok: true, rateMinor: (rate.totalMinor - rate.vatMinor).toString(), courierName: rate.courierName, serviceCode: rate.serviceCode, eta: rate.deliveryEta, requestToken: quote.requestToken };
  } catch (error) {
    if (error instanceof CourierError) return { ok: false, problem: error.message };
    throw error;
  }
}
