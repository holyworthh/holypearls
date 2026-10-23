/*
 * Product-family answers, timing and destinations (T03-08). Pure functions,
 * tested on their own.
 *
 * - Large format (COM-FR-045): standard or custom size, and print only,
 *   delivered or installed. Custom sizes need a quote; installation follows
 *   the installation areas and rules (installation.ts, T13-01c).
 * - Packaging (COM-FR-046): standard or custom. Custom needs a quote.
 * - Promotional (COM-FR-047): catalogue item or "source something similar".
 *   Sourcing needs a quote.
 * - Embroidery: on our garments or the customer's (final after inspection).
 * - Timing (COM-FR-060, 070–072): production time and transit time are shown
 *   separately; a deadline is checked against both; international delivery
 *   is priced by quote (freight) and never stops the configuration.
 */

import { businessDate } from "@holypearls/contracts";
import type { CalculationInput } from "./calculate.js";

type Adjustment = NonNullable<CalculationInput["adjustments"]>[number];

export interface FamilyDetails {
  sizeMode?: "STANDARD" | "CUSTOM";
  widthCm?: number;
  heightCm?: number;
  service?: "PRINT_ONLY" | "DELIVERED" | "INSTALLATION";
  installState?: string;
  installSite?: string;
  installSurface?: string;
  installHeightM?: number;
  installAccess?: string;
  installDate?: string;
  packagingType?: "STANDARD" | "CUSTOM";
  packagingSpec?: string;
  promoSource?: "CATALOGUE" | "SOURCE_SIMILAR";
  similarItem?: string;
  garmentOwner?: "OURS" | "CUSTOMER";
  destination?: "LAGOS" | "NIGERIA" | "INTERNATIONAL";
  city?: string;
  country?: string;
  deadline?: string;
}

/** Custom area in square metres, rounded to two places (shown beside the size). */
export function areaSqM(widthCm: number | undefined, heightCm: number | undefined): number | null {
  if (!widthCm || !heightCm) return null;
  return Math.round(((widthCm * heightCm) / 10_000) * 100) / 100;
}

/** Price-state changes from family answers and the destination. */
export function familyAdjustments(family: string, details: FamilyDetails): Adjustment[] {
  const list: Adjustment[] = [];
  if (family === "LARGE_FORMAT" || family === "WALL_ART") {
    if (details.sizeMode === "CUSTOM") {
      const area = areaSqM(details.widthCm, details.heightCm);
      list.push({ state: "QUOTE_REQUIRED", code: "CUSTOM_SIZE", message: `Custom size${area ? ` (${area} m²)` : ""}: we confirm material and finishing in a quote.` });
    }
  }
  if (family === "PACKAGING" && details.packagingType === "CUSTOM") {
    list.push({ state: "QUOTE_REQUIRED", code: "CUSTOM_PACKAGING", message: "Custom packaging: we confirm the structure and a sample, then send a quote." });
  }
  if (family === "PROMOTIONAL_ITEM" && details.promoSource === "SOURCE_SIMILAR") {
    list.push({ state: "QUOTE_REQUIRED", code: "SOURCING", message: "We'll find a similar item and send a quote with options." });
  }
  if ((family === "EMBROIDERY" || family === "APPAREL_PRINT") && details.garmentOwner === "CUSTOMER") {
    list.push({ state: "ESTIMATE_READY", code: "FINAL_AFTER_INSPECTION", message: "Your garments: the price is final after we inspect them." });
  }
  if (details.destination === "INTERNATIONAL") {
    list.push({ state: "QUOTE_REQUIRED", code: "INTERNATIONAL_FREIGHT", message: "International delivery: freight is confirmed in your quote." });
  }
  return list;
}

/**
 * Transit working days by destination. Working values until the delivery
 * zones and rates arrive (T04-01); international freight is quoted.
 */
export const TRANSIT_DAYS: Record<NonNullable<FamilyDetails["destination"]>, { min: number; max: number } | null> = {
  LAGOS: { min: 1, max: 2 },
  NIGERIA: { min: 2, max: 5 },
  INTERNATIONAL: null,
};

/**
 * Adds working days (Monday to Friday) to today's business date (Lagos, not
 * the server's or UTC's). The result is that calendar date at 00:00 UTC.
 */
export function addWorkingDays(from: Date, days: number): Date {
  const date = new Date(`${businessDate(from)}T00:00:00Z`);
  let left = days;
  while (left > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) left -= 1;
  }
  return date;
}

export interface LeadRules {
  leadMinDays: number;
  leadMaxDays: number;
  rush: "NONE" | "AVAILABLE" | "MANUAL_REVIEW";
  priorityRush: "NONE" | "AVAILABLE" | "MANUAL_REVIEW";
}

type Rush = "STANDARD" | "RUSH" | "PRIORITY";

/** Production days for each timing, matching the calculator (Stage 1.4). */
export function productionDays(rules: LeadRules, rush: Rush): { min: number; max: number } | null {
  if (rush === "RUSH") {
    if (rules.rush === "NONE") return null;
    const min = Math.max(1, Math.ceil(rules.leadMinDays / 2));
    return { min, max: Math.max(min, Math.ceil((rules.leadMaxDays * 3) / 4)) };
  }
  if (rush === "PRIORITY") {
    if (rules.priorityRush === "NONE") return null;
    const min = Math.max(1, Math.floor(rules.leadMinDays / 2));
    return { min, max: Math.max(min, Math.ceil(rules.leadMaxDays / 2)) };
  }
  return { min: rules.leadMinDays, max: rules.leadMaxDays };
}

export type TimingVerdict = "NO_DEADLINE" | "ON_TIME" | "RUSH_NEEDED" | "REVIEW";

export interface Timing {
  production: { min: number; max: number } | null;
  /** Null when not chosen yet or quoted (international). */
  transit: { min: number; max: number } | null;
  transitQuoted: boolean;
  /** Latest expected arrival (or ready date when no destination), ISO date. */
  expectedBy: string | null;
  verdict: TimingVerdict;
  /** The faster timing that meets the deadline, when the chosen one doesn't. */
  suggestedRush: Rush | null;
  message: string | null;
}

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Production and transit separately, and whether a deadline is met
 * (COM-FR-060, 070–072). The dates start after approval (proof and payment),
 * so they are estimates the customer can plan with, not promises.
 */
export function timingFor(rules: LeadRules | null, rush: Rush, details: FamilyDetails, today: Date): Timing {
  const production = rules ? productionDays(rules, rush) : null;
  const transit = details.destination ? TRANSIT_DAYS[details.destination] : null;
  const transitQuoted = details.destination === "INTERNATIONAL";
  const finish = (days: { min: number; max: number } | null) => (days ? addWorkingDays(today, days.max + (transit?.max ?? 0)) : null);
  const expected = finish(production);
  const base = { production, transit, transitQuoted, expectedBy: expected ? isoDate(expected) : null, suggestedRush: null };
  if (!details.deadline || !rules) return { ...base, verdict: "NO_DEADLINE", message: null };
  const deadline = new Date(`${details.deadline}T23:59:59Z`);
  if (Number.isNaN(deadline.getTime())) return { ...base, verdict: "NO_DEADLINE", message: null };
  if (transitQuoted) {
    return { ...base, verdict: "REVIEW", message: "International delivery times depend on freight; we'll confirm your date in the quote." };
  }
  if (expected && expected <= deadline) return { ...base, verdict: "ON_TIME", message: `Expected by ${isoDate(expected)}, before your date.` };
  for (const faster of ["RUSH", "PRIORITY"] as const) {
    if (faster === rush || (rush === "PRIORITY" && faster === "RUSH")) continue;
    const days = productionDays(rules, faster);
    const when = finish(days);
    if (days && when && when <= deadline) {
      const label = faster === "RUSH" ? "Rush" : "Priority rush";
      return { ...base, verdict: "RUSH_NEEDED", suggestedRush: faster, message: `Standard timing arrives after your date. ${label} should arrive by ${isoDate(when)}.` };
    }
  }
  return { ...base, verdict: "REVIEW", message: "Your date is tighter than our usual timing. We'll review it with you and confirm what's possible." };
}

/** A tight deadline keeps the price an estimate until we confirm the date. */
export function timingAdjustments(timing: Timing): Adjustment[] {
  if (timing.verdict === "REVIEW" && !timing.transitQuoted) return [{ state: "ESTIMATE_READY", code: "DEADLINE_REVIEW", message: timing.message! }];
  return [];
}
