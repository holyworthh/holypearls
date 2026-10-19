import type { CalculationInput } from "./calculate.js";
import { addWorkingDays } from "./families.js";

/*
 * Installation (T13-01c; OPS-FR-102; Pen 119). Pure: given the areas, the
 * rules and the customer's answers, either a priced installation (a charge on
 * the order) or a reason it needs a quote, or a date that's too soon.
 */

type Adjustment = NonNullable<CalculationInput["adjustments"]>[number];

export interface InstallationAreaRule {
  name: string;
  states: string[];
  productIds: string[];
  pricing: "FIXED" | "FIXED_PLUS_TRAVEL" | "QUOTE";
  rateMinor: bigint | null;
  travelMinor: bigint | null;
}

export interface InstallationRuleSet {
  surveyAboveSqM: number | null;
  noticeWorkingDays: number | null;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const naira = (minor: bigint) => `₦${(minor / 100n).toLocaleString("en-NG")}`;

export function installationAdjustments(
  areas: readonly InstallationAreaRule[],
  rules: InstallationRuleSet,
  request: { productId: string; productName: string; quantity: number; state?: string; areaSqM: number | null; date?: string; now: Date },
): Adjustment[] {
  const quote = (message: string): Adjustment[] => [{ state: "QUOTE_REQUIRED", code: "INSTALLATION", message }];
  const list: Adjustment[] = [];
  // The notice rule stands on its own: a date too soon can't be booked by any route.
  if (rules.noticeWorkingDays && request.date) {
    const earliest = addWorkingDays(request.now, rules.noticeWorkingDays).toISOString().slice(0, 10);
    if (request.date < earliest) {
      list.push({ state: "QUOTE_REQUIRED", code: "INSTALLATION", message: `We need ${rules.noticeWorkingDays} working days' notice to install. Choose ${earliest} or later.`, blocking: true });
    }
  }
  if (!request.state) return [...list, ...quote("Tell us the state where we install, or we'll quote it after checking the site details.")];
  const area = areas.find((entry) => entry.states.some((state) => same(state, request.state!)) && entry.productIds.includes(request.productId));
  if (!area) return [...list, ...quote(`We don't install ${request.productName.toLowerCase()} in ${request.state} at a set price yet. We'll quote it after checking the site.`)];
  if (area.pricing === "QUOTE" || area.rateMinor === null) return [...list, ...quote(`Installation in ${area.name} is quoted after we check the site details.`)];
  if (rules.surveyAboveSqM && request.areaSqM !== null && request.areaSqM > rules.surveyAboveSqM) {
    return [...list, ...quote(`Over ${rules.surveyAboveSqM} m², we survey the site first and then send a quote.`)];
  }
  const pieces = area.rateMinor * BigInt(Math.max(1, request.quantity));
  const travel = area.pricing === "FIXED_PLUS_TRAVEL" ? (area.travelMinor ?? 0n) : 0n;
  list.push({
    state: "PRICE_READY",
    code: "INSTALLATION",
    message: `Installation in ${area.name}: ${naira(area.rateMinor)} a piece${travel ? ` plus ${naira(travel)} travel` : ""}.`,
    charge: { label: `Installation (${area.name})`, amountMinor: pieces + travel },
  });
  return list;
}
