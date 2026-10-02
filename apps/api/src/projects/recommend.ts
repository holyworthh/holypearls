import { NOT_SURE, type ProjectAnswers, type RecommendationGroup, type RecommendationState, type RuleCondition, type RuleQuantity } from "@holypearls/contracts";

/*
 * Recommendations from the brief (PROJ-FR-003–004, Stage 3.1D §10–12). Pure
 * functions, so the rules about the customer's edits are tested as a table.
 */

export interface RuleInput {
  id: string;
  group: RecommendationGroup;
  itemName: string;
  productId: string | null;
  condition: RuleCondition;
  quantity: RuleQuantity;
  reason: string;
  position: number;
  active: boolean;
}

/** One suggestion as stored for a project, keyed by the rule that made it. */
export interface SuggestionRow {
  ruleKey: string;
  group: RecommendationGroup;
  name: string;
  reason: string;
  productId: string | null;
  suggestedQuantity: number | null;
  customerQuantity: number | null;
  state: RecommendationState;
  /** The customer added, removed or changed it. From then on the brief never changes it back. */
  customerOverridden: boolean;
  stillSuggested: boolean;
  position: number;
}

const numberAnswer = (answers: ProjectAnswers, field: string): number | null => {
  const value = answers[field];
  return typeof value === "number" ? value : null;
};

export function applies(condition: RuleCondition, answers: ProjectAnswers): boolean {
  switch (condition.kind) {
    case "ALWAYS":
      return true;
    case "NUMBER": {
      const value = numberAnswer(answers, condition.field);
      if (value === null) return false;
      return { ">": value > condition.value, ">=": value >= condition.value, "<": value < condition.value, "<=": value <= condition.value }[condition.op];
    }
    case "ANSWER": {
      const value = answers[condition.field];
      return Array.isArray(value) ? value.includes(condition.equals) : value === condition.equals;
    }
  }
}

/** Null means "quantity after review": the answer it depends on isn't known. */
export function quantityFor(quantity: RuleQuantity, answers: ProjectAnswers): number | null {
  if (quantity.kind === "FIXED") return quantity.value;
  if (quantity.kind === "AFTER_REVIEW") return null;
  const value = numberAnswer(answers, quantity.field);
  if (value === null || value === 0) return null;
  return Math.max(1, Math.ceil(Number((value * quantity.factor).toFixed(6))));
}

/** Recommended items start in the project; useful additions and optional extras are offered. */
export const defaultState = (group: RecommendationGroup): RecommendationState => (group === "RECOMMENDED" ? "INCLUDED" : "SUGGESTED");

/**
 * Works out the suggestions again after the brief or the rules change.
 * - A rule that applies refreshes its row (group, reason, suggested quantity)
 *   but never the customer's choice or quantity once they've touched it.
 * - A row whose rule no longer applies is dropped only if the customer never
 *   touched it; otherwise it stays, marked as no longer suggested, so a
 *   removed item stays removed and a chosen one stays chosen.
 */
export function reconcile(rules: RuleInput[], answers: ProjectAnswers, existing: SuggestionRow[]): { keep: SuggestionRow[]; drop: string[] } {
  const current = new Map(existing.map((row) => [row.ruleKey, row]));
  const keep: SuggestionRow[] = [];
  const matched = new Set<string>();
  for (const rule of [...rules].sort((a, b) => a.position - b.position)) {
    if (!rule.active || !applies(rule.condition, answers)) continue;
    matched.add(rule.id);
    const before = current.get(rule.id);
    const touched = before?.customerOverridden ?? false;
    keep.push({
      ruleKey: rule.id,
      group: rule.group,
      name: rule.itemName,
      reason: rule.reason,
      productId: rule.productId,
      suggestedQuantity: quantityFor(rule.quantity, answers),
      customerQuantity: touched ? (before?.customerQuantity ?? null) : null,
      state: touched ? before!.state : defaultState(rule.group),
      customerOverridden: touched,
      stillSuggested: true,
      position: rule.position,
    });
  }
  const drop: string[] = [];
  for (const row of existing) {
    if (matched.has(row.ruleKey)) continue;
    if (row.customerOverridden) keep.push({ ...row, stillSuggested: false });
    else drop.push(row.ruleKey);
  }
  return { keep, drop };
}

const DAY = 86_400_000;
/**
 * Timing guidance from the needed-by date (Stage 3.1D §8). Starting values;
 * real lead times are per product and checked by staff, so this never
 * promises a date can be met.
 */
export const DEADLINE_WEEKS = { comfortable: 6, tight: 3 } as const;

export function deadlineState(answers: ProjectAnswers, now: Date): "COMFORTABLE" | "TIGHT" | "PRODUCTION_REVIEW" | null {
  const value = answers.neededBy;
  if (typeof value !== "string" || value === NOT_SURE) return null;
  const days = (Date.parse(`${value}T00:00:00Z`) - now.getTime()) / DAY;
  if (days >= DEADLINE_WEEKS.comfortable * 7) return "COMFORTABLE";
  if (days >= DEADLINE_WEEKS.tight * 7) return "TIGHT";
  return "PRODUCTION_REVIEW";
}

type OpenItem = "SIZES_LATER" | "ARTWORK_LATER" | "DESIGN_HELP" | "INSTALLATION_REVIEW" | "QUANTITY_AFTER_REVIEW" | "DATE_UNKNOWN";

/** What the summary marks as still to come (Stage 3.1D §14), in a fixed order. */
export function openItems(answers: ProjectAnswers, lines: { included: boolean; quantity: number | null }[]): OpenItem[] {
  const brand = Array.isArray(answers.brand) ? answers.brand : [];
  const out: OpenItem[] = [];
  if (answers.sizesKnown === "NO" || answers.sizesKnown === NOT_SURE) out.push("SIZES_LATER");
  if (brand.includes("SEND_LATER")) out.push("ARTWORK_LATER");
  if (brand.includes("DESIGN_HELP")) out.push("DESIGN_HELP");
  if (answers.installation === "YES") out.push("INSTALLATION_REVIEW");
  if (lines.some((line) => line.included && line.quantity === null)) out.push("QUANTITY_AFTER_REVIEW");
  if (typeof answers.neededBy !== "string" || answers.neededBy === NOT_SURE) out.push("DATE_UNKNOWN");
  return out;
}
