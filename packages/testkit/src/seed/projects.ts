import { eq, inArray, schema, type Transaction } from "@holypearls/db";
import type { ProjectType, RecommendationGroup, RuleCondition, RuleQuantity } from "@holypearls/contracts";

/*
 * Starting recommendation rules for the two stress-test project types
 * (Stage 3.1D §18–19, Pen 110). They are starting values for staff to edit
 * in admin, not business promises (PRD-00 §17). Other project types start
 * with no rules: customers add items themselves until staff add some.
 */

interface SeedRule {
  group: RecommendationGroup;
  product: string | null;
  itemName: string;
  condition: RuleCondition;
  quantity: RuleQuantity;
  reason: string;
}

const always: RuleCondition = { kind: "ALWAYS" };
const afterReview: RuleQuantity = { kind: "AFTER_REVIEW" };

export const SEED_RULES: Partial<Record<ProjectType, SeedRule[]>> = {
  EVENT: [
    { group: "RECOMMENDED", product: "polo-shirt", itemName: "Crew polo shirts", condition: { kind: "NUMBER", field: "crew", op: ">", value: 0 }, quantity: { kind: "PER", field: "crew", factor: 1 }, reason: "Your crew need to be found fast." },
    { group: "RECOMMENDED", product: "event-badges", itemName: "Name badges and lanyards", condition: always, quantity: { kind: "PER", field: "attendees", factor: 1 }, reason: "Every guest needs a name badge." },
    { group: "RECOMMENDED", product: "roll-up-banner", itemName: "Roll-up banners", condition: { kind: "NUMBER", field: "attendees", op: ">", value: 100 }, quantity: { kind: "FIXED", value: 4 }, reason: "For the entrance, stage and registration." },
    { group: "USEFUL", product: null, itemName: "Main backdrop", condition: { kind: "ANSWER", field: "hasStage", equals: "YES" }, quantity: { kind: "FIXED", value: 1 }, reason: "The photo moment at registration and on stage." },
    { group: "USEFUL", product: null, itemName: "Tote bags", condition: { kind: "ANSWER", field: "giftPack", equals: "YES" }, quantity: { kind: "PER", field: "attendees", factor: 1 }, reason: "Holds the programme and gifts." },
    { group: "USEFUL", product: null, itemName: "Notebooks", condition: { kind: "NUMBER", field: "attendees", op: ">", value: 100 }, quantity: { kind: "PER", field: "attendees", factor: 1 }, reason: "Often ordered for events this size." },
    { group: "OPTIONAL", product: null, itemName: "Directional signs", condition: always, quantity: afterReview, reason: "Helps guests find their way. Quantity after a site check." },
    { group: "OPTIONAL", product: null, itemName: "Table displays", condition: always, quantity: afterReview, reason: "Nice to have at registration and sponsor tables." },
  ],
  STAFF_UNIFORMS: [
    { group: "RECOMMENDED", product: "polo-shirt", itemName: "Front-of-house polos", condition: always, quantity: { kind: "PER", field: "people", factor: 1 }, reason: "Everyone customer-facing in the same branded polo." },
    { group: "RECOMMENDED", product: "apron", itemName: "Aprons", condition: { kind: "ANSWER", field: "garments", equals: "APRONS" }, quantity: { kind: "PER", field: "people", factor: 1 }, reason: "You told us people need aprons." },
    { group: "RECOMMENDED", product: null, itemName: "Chef and kitchen wear", condition: { kind: "ANSWER", field: "garments", equals: "CHEF_WEAR" }, quantity: afterReview, reason: "For your kitchen team. We confirm quantities by role." },
    { group: "USEFUL", product: "baseball-cap", itemName: "Branded caps", condition: { kind: "ANSWER", field: "garments", equals: "CAPS" }, quantity: { kind: "PER", field: "people", factor: 1 }, reason: "Caps finish the uniform." },
    { group: "USEFUL", product: null, itemName: "Work trousers", condition: { kind: "ANSWER", field: "garments", equals: "WORKWEAR" }, quantity: afterReview, reason: "Matching trousers for a complete uniform." },
    { group: "OPTIONAL", product: null, itemName: "Name embroidery", condition: always, quantity: afterReview, reason: "Names on each garment help customers address your team." },
  ],
};

/** Adds the starting rules for a type that has none yet; staff edits are never overwritten. */
export async function seedRecommendationRules(tx: Transaction) {
  const slugs = Object.values(SEED_RULES).flatMap((rules) => rules!.map((rule) => rule.product).filter((slug): slug is string => Boolean(slug)));
  const products = new Map(
    (await tx.select({ id: schema.products.id, slug: schema.products.slug }).from(schema.products).where(inArray(schema.products.slug, [...new Set(slugs)]))).map((row) => [row.slug, row.id]),
  );
  for (const [type, rules] of Object.entries(SEED_RULES) as [ProjectType, SeedRule[]][]) {
    const existing = await tx.select({ id: schema.recommendationRules.id }).from(schema.recommendationRules).where(eq(schema.recommendationRules.projectType, type)).limit(1);
    if (existing.length) continue;
    await tx.insert(schema.recommendationRules).values(
      rules.map((rule, position) => ({
        projectType: type,
        group: rule.group,
        productId: rule.product ? (products.get(rule.product) ?? null) : null,
        itemName: rule.itemName,
        condition: rule.condition,
        quantity: rule.quantity,
        reason: rule.reason,
        position,
      })),
    );
    await tx.insert(schema.recommendationRuleSets).values({ projectType: type, version: 1 }).onConflictDoNothing();
  }
}
