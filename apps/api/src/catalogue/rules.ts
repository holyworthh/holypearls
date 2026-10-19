import type { ProductRules } from "@holypearls/contracts";
import { and, asc, type Database, desc, eq, gt, lte, schema, sql } from "@holypearls/db";
import type { z } from "zod";
import type { compatibilityRuleSchema, priceRuleInputSchema, taxSettingInputSchema } from "@holypearls/contracts";
import { AppError } from "../errors.js";
import type { ActorContext } from "../identity/actor.js";
import { recordAudit } from "../platform/audit.js";

/*
 * Product rules, compatibility, price rules and VAT (T03-01, OPS-FR-010–019).
 * Staff with PRICING_MANAGE edit them; every change is audited. Price rules
 * and VAT are insert-only with an effective date: a change is scheduled as a
 * new row, and history is never edited (enforced by a database trigger).
 */

type Row = typeof schema.productRules.$inferSelect;

const toRules = (row: Row): ProductRules => ({
  moq: row.moq,
  belowMoq: row.belowMoq,
  belowMoqSurchargeBps: row.belowMoqSurchargeBps,
  maxAutoQuantity: row.maxAutoQuantity,
  leadMinDays: row.leadMinDays,
  leadMaxDays: row.leadMaxDays,
  rush: row.rush,
  rushSurchargeBps: row.rushSurchargeBps,
  priorityRush: row.priorityRush,
  priorityRushSurchargeBps: row.priorityRushSurchargeBps,
  artworkLater: row.artworkLater,
  sample: row.sample,
  sampleMultiplierBps: row.sampleMultiplierBps,
  sampleMinimumMinor: row.sampleMinimumMinor.toString(),
  proof: row.proof,
  proofSkippableOnReorder: row.proofSkippableOnReorder,
});

async function productName(db: Database, productId: string): Promise<string> {
  const [product] = await db.select({ name: schema.products.name }).from(schema.products).where(eq(schema.products.id, productId));
  if (!product) throw new AppError("NOT_FOUND");
  return product.name;
}

/** Every product with whether it has rules and its price now (T13-01). */
export async function pricingProducts(db: Database, now: Date) {
  const products = await db
    .select({ id: schema.products.id, name: schema.products.name, slug: schema.products.slug, buyingMode: schema.products.buyingMode, status: schema.products.status })
    .from(schema.products)
    .orderBy(asc(schema.products.name));
  const withRules = new Set((await db.select({ productId: schema.productRules.productId }).from(schema.productRules)).map((row) => row.productId));
  const prices = await db.select().from(schema.priceRules).orderBy(desc(schema.priceRules.effectiveFrom));
  return {
    products: products.map((product) => {
      const own = prices.filter((price) => price.productId === product.id);
      const current = own.find((price) => price.effectiveFrom <= now) ?? null;
      return {
        ...product,
        hasRules: withRules.has(product.id),
        price: current ? { baseMinor: current.baseMinor.toString(), currency: current.currency, state: current.state } : null,
        scheduled: own.some((price) => price.effectiveFrom > now),
      };
    }),
  };
}

export async function getProductRules(db: Database, productId: string) {
  const [product] = await db.select({ name: schema.products.name, slug: schema.products.slug, buyingMode: schema.products.buyingMode, status: schema.products.status }).from(schema.products).where(eq(schema.products.id, productId));
  if (!product) throw new AppError("NOT_FOUND");
  const optionRows = await db
    .select({ key: schema.productOptions.key, label: schema.productOptions.label, valueKey: schema.productOptionValues.key, valueLabel: schema.productOptionValues.label })
    .from(schema.productOptions)
    .innerJoin(schema.productOptionValues, eq(schema.productOptionValues.optionId, schema.productOptions.id))
    .where(eq(schema.productOptions.productId, productId))
    .orderBy(asc(schema.productOptions.position), asc(schema.productOptionValues.position));
  const options: { key: string; label: string; values: { key: string; label: string }[] }[] = [];
  for (const row of optionRows) {
    const option = options.find((entry) => entry.key === row.key) ?? options[options.push({ key: row.key, label: row.label, values: [] }) - 1]!;
    option.values.push({ key: row.valueKey, label: row.valueLabel });
  }
  const [row] = await db.select().from(schema.productRules).where(eq(schema.productRules.productId, productId));
  const compatibility = await db
    .select()
    .from(schema.compatibilityRules)
    .where(eq(schema.compatibilityRules.productId, productId))
    .orderBy(asc(schema.compatibilityRules.createdAt));
  return {
    productId,
    product,
    options,
    rules: row ? toRules(row) : null,
    version: row?.version ?? 0,
    compatibility: compatibility.map(({ ifOption, ifValue, thenOption, thenValues, effect, message }) => ({ ifOption, ifValue, thenOption, thenValues, effect, message })),
  };
}

/** Creates (version 0) or updates the product's rules with optimistic locking. */
export async function saveProductRules(db: Database, actor: ActorContext, productId: string, rules: ProductRules, version: number) {
  const name = await productName(db, productId);
  const before = await getProductRules(db, productId);
  const values = { ...rules, sampleMinimumMinor: BigInt(rules.sampleMinimumMinor) };
  const saved = await db.transaction(async (tx) => {
    const rows =
      version === 0
        ? await tx.insert(schema.productRules).values({ productId, ...values }).onConflictDoNothing().returning()
        : await tx
            .update(schema.productRules)
            .set({ ...values, version: sql`${schema.productRules.version} + 1` })
            .where(and(eq(schema.productRules.productId, productId), eq(schema.productRules.version, version)))
            .returning();
    if (!rows.length) return false;
    await recordAudit(tx, actor, {
      action: "pricing.product_rules_changed",
      summary: `Product rules changed: ${name}`,
      recordType: "PRODUCT",
      recordId: productId,
      recordLabel: name,
      before: before.rules,
      after: rules,
      permission: "PRICING_MANAGE",
    });
    return true;
  });
  if (!saved) throw new AppError("VERSION_CONFLICT", { context: { latest: await getProductRules(db, productId) } });
  return getProductRules(db, productId);
}

/** Replaces the compatibility rules and bumps the rules' version, so calculations record which set they used. */
export async function saveCompatibility(db: Database, actor: ActorContext, productId: string, rules: z.infer<typeof compatibilityRuleSchema>[], version: number) {
  const name = await productName(db, productId);
  const options = await db
    .select({ key: schema.productOptions.key, value: schema.productOptionValues.key })
    .from(schema.productOptions)
    .innerJoin(schema.productOptionValues, eq(schema.productOptionValues.optionId, schema.productOptions.id))
    .where(eq(schema.productOptions.productId, productId));
  const known = (option: string, value: string) => options.some((row) => row.key === option && row.value === value);
  const fieldErrors: Record<string, string> = {};
  rules.forEach((rule, index) => {
    if (!known(rule.ifOption, rule.ifValue)) fieldErrors[`rules.${index}.ifValue`] = `${rule.ifOption} has no value ${rule.ifValue}`;
    for (const value of rule.thenValues) if (!known(rule.thenOption, value)) fieldErrors[`rules.${index}.thenValues`] = `${rule.thenOption} has no value ${value}`;
    if (rule.ifOption === rule.thenOption) fieldErrors[`rules.${index}.thenOption`] = "A rule compares two different options";
  });
  if (Object.keys(fieldErrors).length) throw new AppError("VALIDATION_FAILED", { fieldErrors });

  const before = await getProductRules(db, productId);
  if (!before.rules) throw new AppError("RULE_FAILED", { message: "Set the product rules first.", context: { reason: "NO_RULES" } });
  const saved = await db.transaction(async (tx) => {
    const bumped = await tx
      .update(schema.productRules)
      .set({ version: sql`${schema.productRules.version} + 1` })
      .where(and(eq(schema.productRules.productId, productId), eq(schema.productRules.version, version)))
      .returning();
    if (!bumped.length) return false;
    await tx.delete(schema.compatibilityRules).where(eq(schema.compatibilityRules.productId, productId));
    if (rules.length) await tx.insert(schema.compatibilityRules).values(rules.map((rule) => ({ productId, ...rule })));
    await recordAudit(tx, actor, {
      action: "pricing.compatibility_changed",
      summary: `Compatibility rules changed: ${name}`,
      recordType: "PRODUCT",
      recordId: productId,
      recordLabel: name,
      before: { rules: before.compatibility },
      after: { rules },
      permission: "PRICING_MANAGE",
    });
    return true;
  });
  if (!saved) throw new AppError("VERSION_CONFLICT", { context: { latest: before } });
  return getProductRules(db, productId);
}

const toPriceRule = (row: typeof schema.priceRules.$inferSelect, currentId: string | null) => ({
  id: row.id,
  productId: row.productId,
  effectiveFrom: row.effectiveFrom.toISOString(),
  currency: row.currency as "NGN" | "USD",
  basis: row.basis,
  packSize: row.packSize,
  baseMinor: row.baseMinor.toString(),
  tiers: row.tiers as { minQuantity: number; amountMinor: string }[],
  addOns: row.addOns as { option: string; value: string; per: "UNIT" | "ORDER"; amountMinor: string }[],
  state: row.state,
  includesVat: row.includesVat,
  note: row.note,
  current: row.id === currentId,
  createdAt: row.createdAt.toISOString(),
});

/** The rule in force at a moment: the latest one that has started. */
export async function currentPriceRule(db: Database, productId: string, at: Date) {
  const [row] = await db
    .select()
    .from(schema.priceRules)
    .where(and(eq(schema.priceRules.productId, productId), lte(schema.priceRules.effectiveFrom, at)))
    .orderBy(desc(schema.priceRules.effectiveFrom))
    .limit(1);
  return row ?? null;
}

export async function listPriceRules(db: Database, productId: string, now: Date) {
  await productName(db, productId);
  const current = await currentPriceRule(db, productId, now);
  const rows = await db.select().from(schema.priceRules).where(eq(schema.priceRules.productId, productId)).orderBy(desc(schema.priceRules.effectiveFrom));
  return { entries: rows.map((row) => toPriceRule(row, current?.id ?? null)) };
}

/**
 * Adds a price from a date. The date can't be in the past (history is never
 * rewritten); "now" starts it immediately. Add-ons must name real option values.
 */
export async function addPriceRule(db: Database, actor: ActorContext, productId: string, input: z.infer<typeof priceRuleInputSchema>, now: Date) {
  const name = await productName(db, productId);
  const effectiveFrom = new Date(input.effectiveFrom);
  // A minute of grace for clocks and form filling.
  if (effectiveFrom.getTime() < now.getTime() - 60_000) {
    throw new AppError("VALIDATION_FAILED", { fieldErrors: { effectiveFrom: "Choose now or a later date; past prices can't be changed" } });
  }
  const options = await db
    .select({ key: schema.productOptions.key, value: schema.productOptionValues.key })
    .from(schema.productOptions)
    .innerJoin(schema.productOptionValues, eq(schema.productOptionValues.optionId, schema.productOptions.id))
    .where(eq(schema.productOptions.productId, productId));
  const fieldErrors: Record<string, string> = {};
  input.addOns.forEach((addOn, index) => {
    if (!options.some((row) => row.key === addOn.option && row.value === addOn.value)) fieldErrors[`addOns.${index}`] = `${addOn.option} has no value ${addOn.value}`;
  });
  if (input.basis === "PER_PACK" && input.packSize < 2) fieldErrors.packSize = "A pack price needs a pack size of at least 2";
  if (Object.keys(fieldErrors).length) throw new AppError("VALIDATION_FAILED", { fieldErrors });

  try {
    const id = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(schema.priceRules)
        .values({
          productId,
          effectiveFrom: effectiveFrom < now ? now : effectiveFrom,
          currency: input.currency,
          basis: input.basis,
          packSize: input.packSize,
          baseMinor: BigInt(input.baseMinor),
          tiers: [...input.tiers].sort((a, b) => a.minQuantity - b.minQuantity),
          addOns: input.addOns,
          state: input.state,
          includesVat: input.includesVat,
          note: input.note,
          createdByStaffId: actor.type === "user" ? (actor.staff?.staffProfileId ?? null) : null,
        })
        .returning({ id: schema.priceRules.id });
      await recordAudit(tx, actor, {
        action: "pricing.price_rule_added",
        summary: `Price ${effectiveFrom > now ? "scheduled" : "changed"}: ${name}`,
        recordType: "PRODUCT",
        recordId: productId,
        recordLabel: name,
        after: { ...input, priceRuleId: row!.id },
        permission: "PRICING_MANAGE",
      });
      return row!.id;
    });
    return (await listPriceRules(db, productId, now)).entries.find((entry) => entry.id === id)!;
  } catch (error) {
    if ((error as { cause?: { code?: string } }).cause?.code === "23505") {
      throw new AppError("VALIDATION_FAILED", { fieldErrors: { effectiveFrom: "Another price already starts at this moment" } });
    }
    throw error;
  }
}

export async function currentTaxSetting(db: Database, at: Date) {
  const [row] = await db
    .select()
    .from(schema.taxSettings)
    .where(lte(schema.taxSettings.effectiveFrom, at))
    .orderBy(desc(schema.taxSettings.effectiveFrom))
    .limit(1);
  return row ?? null;
}

export async function listTaxSettings(db: Database, now: Date) {
  const current = await currentTaxSetting(db, now);
  const rows = await db.select().from(schema.taxSettings).orderBy(desc(schema.taxSettings.effectiveFrom));
  return {
    entries: rows.map((row) => ({
      id: row.id,
      effectiveFrom: row.effectiveFrom.toISOString(),
      vatRateBps: row.vatRateBps,
      vatOnDelivery: row.vatOnDelivery,
      note: row.note,
      current: row.id === current?.id,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

export async function addTaxSetting(db: Database, actor: ActorContext, input: z.infer<typeof taxSettingInputSchema>, now: Date) {
  const effectiveFrom = new Date(input.effectiveFrom);
  if (effectiveFrom.getTime() < now.getTime() - 60_000) {
    throw new AppError("VALIDATION_FAILED", { fieldErrors: { effectiveFrom: "Choose now or a later date; past VAT settings can't be changed" } });
  }
  try {
    await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(schema.taxSettings)
        .values({
          effectiveFrom: effectiveFrom < now ? now : effectiveFrom,
          vatRateBps: input.vatRateBps,
          vatOnDelivery: input.vatOnDelivery,
          note: input.note,
          createdByStaffId: actor.type === "user" ? (actor.staff?.staffProfileId ?? null) : null,
        })
        .returning({ id: schema.taxSettings.id });
      await recordAudit(tx, actor, {
        action: "pricing.vat_changed",
        summary: `VAT ${input.vatRateBps / 100}% from ${effectiveFrom.toISOString().slice(0, 10)}`,
        recordType: "TAX_SETTING",
        recordId: row!.id,
        recordLabel: "VAT",
        after: input,
        permission: "PRICING_MANAGE",
      });
    });
  } catch (error) {
    if ((error as { cause?: { code?: string } }).cause?.code === "23505") {
      throw new AppError("VALIDATION_FAILED", { fieldErrors: { effectiveFrom: "Another VAT setting already starts at this moment" } });
    }
    throw error;
  }
  return listTaxSettings(db, now);
}

/** Price versions that haven't started yet, soonest first (Pen 118 "Change scheduled"). */
export async function scheduledPriceRules(db: Database, now: Date) {
  return db
    .select({ productId: schema.priceRules.productId, productName: schema.products.name, effectiveFrom: schema.priceRules.effectiveFrom })
    .from(schema.priceRules)
    .innerJoin(schema.products, eq(schema.products.id, schema.priceRules.productId))
    .where(gt(schema.priceRules.effectiveFrom, now))
    .orderBy(asc(schema.priceRules.effectiveFrom));
}
