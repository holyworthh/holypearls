import {
  checkRule,
  type ProjectAnswers,
  type ProjectRecommendation,
  type ProjectType,
  type RecommendationRuleSet,
  type RuleCondition,
  type RuleQuantity,
  type SaveRecommendationRules,
} from "@holypearls/contracts";
import { and, asc, type Database, eq, inArray, notInArray, schema, sql } from "@holypearls/db";
import { AppError } from "../errors.js";
import type { ActorContext } from "../identity/actor.js";
import { recordAudit } from "../platform/audit.js";
import { cardsById, rulesFor } from "./projects.js";
import { reconcile } from "./recommend.js";

/*
 * Recommendation rules admin (T05-01; PROJ-FR-003, Pen 110 · khFI5). The
 * owner chose QUOTE_MANAGE for it (2 October 2026). Saving checks the set's
 * version and keeps each rule's id, so customers' choices about a suggestion
 * survive the edit.
 */

export async function getRuleSet(db: Database, type: ProjectType): Promise<RecommendationRuleSet> {
  const [set] = await db
    .select({ version: schema.recommendationRuleSets.version, updatedAt: schema.recommendationRuleSets.updatedAt, by: schema.staffProfiles.displayName })
    .from(schema.recommendationRuleSets)
    .leftJoin(schema.staffProfiles, eq(schema.staffProfiles.id, schema.recommendationRuleSets.updatedByStaffId))
    .where(eq(schema.recommendationRuleSets.projectType, type));
  const rows = await db
    .select({ rule: schema.recommendationRules, slug: schema.products.slug, productName: schema.products.name })
    .from(schema.recommendationRules)
    .leftJoin(schema.products, eq(schema.products.id, schema.recommendationRules.productId))
    .where(eq(schema.recommendationRules.projectType, type))
    .orderBy(asc(schema.recommendationRules.position));
  return {
    projectType: type,
    version: set?.version ?? 0,
    updatedAt: set?.updatedAt.toISOString() ?? null,
    updatedBy: set?.by ?? null,
    rules: rows.map(({ rule, slug, productName }) => ({
      id: rule.id,
      group: rule.group,
      productSlug: slug,
      productName,
      itemName: rule.itemName,
      condition: rule.condition as RuleCondition,
      quantity: rule.quantity as RuleQuantity,
      reason: rule.reason,
      position: rule.position,
      active: rule.active,
    })),
  };
}

export async function saveRuleSet(db: Database, actor: ActorContext, type: ProjectType, input: SaveRecommendationRules): Promise<RecommendationRuleSet> {
  const fieldErrors: Record<string, string> = {};
  input.rules.forEach((rule, index) => {
    for (const [field, message] of Object.entries(checkRule(type, rule))) fieldErrors[`rules.${index}.${field}`] = message;
  });
  const slugs = [...new Set(input.rules.map((rule) => rule.productSlug).filter((slug): slug is string => Boolean(slug)))];
  const products = slugs.length
    ? await db.select({ id: schema.products.id, slug: schema.products.slug }).from(schema.products).where(inArray(schema.products.slug, slugs))
    : [];
  const productId = new Map(products.map((row) => [row.slug, row.id]));
  input.rules.forEach((rule, index) => {
    if (rule.productSlug && !productId.has(rule.productSlug)) fieldErrors[`rules.${index}.productSlug`] = "Choose a product from the catalogue.";
  });
  if (Object.keys(fieldErrors).length) throw new AppError("VALIDATION_FAILED", { fieldErrors });
  const staffId = actor.type === "user" ? (actor.staff?.staffProfileId ?? null) : null;

  const before = await getRuleSet(db, type);
  await db.transaction(async (tx) => {
    await tx.insert(schema.recommendationRuleSets).values({ projectType: type, version: 0 }).onConflictDoNothing();
    const [set] = await tx
      .update(schema.recommendationRuleSets)
      .set({ version: sql`${schema.recommendationRuleSets.version} + 1`, updatedByStaffId: staffId, updatedAt: new Date() })
      .where(and(eq(schema.recommendationRuleSets.projectType, type), eq(schema.recommendationRuleSets.version, input.version)))
      .returning();
    if (!set) throw new AppError("VERSION_CONFLICT", { context: { latest: before } });
    const keptIds = input.rules.map((rule) => rule.id).filter((id): id is string => Boolean(id));
    if (keptIds.length) {
      const own = await tx
        .select({ id: schema.recommendationRules.id })
        .from(schema.recommendationRules)
        .where(and(eq(schema.recommendationRules.projectType, type), inArray(schema.recommendationRules.id, keptIds)));
      if (own.length !== keptIds.length) throw new AppError("VALIDATION_FAILED", { fieldErrors: { rules: "A rule changed elsewhere. Reload and try again." } });
    }
    await tx
      .delete(schema.recommendationRules)
      .where(and(eq(schema.recommendationRules.projectType, type), keptIds.length ? notInArray(schema.recommendationRules.id, keptIds) : sql`true`));
    for (const [position, rule] of input.rules.entries()) {
      const values = {
        projectType: type,
        group: rule.group,
        productId: rule.productSlug ? productId.get(rule.productSlug)! : null,
        itemName: rule.itemName,
        condition: rule.condition,
        quantity: rule.quantity,
        reason: rule.reason,
        position,
        active: rule.active,
        updatedAt: new Date(),
      };
      if (rule.id) await tx.update(schema.recommendationRules).set(values).where(eq(schema.recommendationRules.id, rule.id));
      else await tx.insert(schema.recommendationRules).values(values);
    }
    await recordAudit(tx, actor, {
      action: "recommendation_rules.saved",
      summary: `Saved ${input.rules.length} recommendation rules for ${type}`,
      recordType: "RECOMMENDATION_RULES",
      recordLabel: type,
      before: { rules: before.rules.length },
      after: { rules: input.rules.length, active: input.rules.filter((rule) => rule.active).length },
      permission: "QUOTE_MANAGE",
    });
  });
  return getRuleSet(db, type);
}

/** "Preview with 250 attendees": what a new project with these answers would be offered. */
export async function previewRules(db: Database, type: ProjectType, answers: ProjectAnswers): Promise<ProjectRecommendation[]> {
  const { keep } = reconcile(await rulesFor(db, type), answers, []);
  const cards = await cardsById(db, keep.map((row) => row.productId).filter((id): id is string => Boolean(id)));
  return keep.map((row) => {
    const card = row.productId ? cards.get(row.productId) : undefined;
    return {
      key: row.ruleKey,
      group: row.group,
      name: row.name,
      reason: row.reason,
      product: card ? { slug: card.slug, name: card.name, price: card.price, priceState: card.priceState, image: card.image } : null,
      suggestedQuantity: row.suggestedQuantity,
      customerQuantity: null,
      state: row.state,
      stillSuggested: true,
    };
  });
}
