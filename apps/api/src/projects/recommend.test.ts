import { describe, expect, it } from "vitest";
import { deadlineState, openItems, reconcile, type RuleInput, type SuggestionRow } from "./recommend.js";

/*
 * PROJ-FR-003–004 as a table: what the builder suggests from the brief, and
 * that the customer's own choices survive later changes to it (T05-01 done
 * when: "Removed suggestion stays removed after scale changes").
 */

const rule = (id: string, over: Partial<RuleInput>): RuleInput => ({
  id,
  group: "RECOMMENDED",
  itemName: id,
  productId: null,
  condition: { kind: "ALWAYS" },
  quantity: { kind: "FIXED", value: 1 },
  reason: `Because ${id}`,
  position: 0,
  active: true,
  ...over,
});

const EVENT_RULES: RuleInput[] = [
  rule("polos", { quantity: { kind: "PER", field: "crew", factor: 2 }, position: 1 }),
  rule("badges", { quantity: { kind: "PER", field: "attendees", factor: 1 }, position: 2 }),
  rule("rollups", { condition: { kind: "NUMBER", field: "attendees", op: ">", value: 100 }, quantity: { kind: "FIXED", value: 4 }, position: 3 }),
  rule("backdrop", { group: "USEFUL", condition: { kind: "ANSWER", field: "hasStage", equals: "YES" }, position: 4 }),
  rule("totes", { group: "OPTIONAL", condition: { kind: "ANSWER", field: "goals", equals: "MERCHANDISE" }, quantity: { kind: "PER", field: "attendees", factor: 1 }, position: 5 }),
];

const BRIEF = { attendees: 250, crew: 30, hasStage: "YES", goals: ["MERCHANDISE", "SIGNAGE"] };

const byKey = (rows: SuggestionRow[]) => Object.fromEntries(rows.map((row) => [row.ruleKey, row]));
const first = () => reconcile(EVENT_RULES, BRIEF, []).keep;

describe("recommendations from the brief", () => {
  it("suggests by group, with quantities from the answers", () => {
    const rows = byKey(first());
    expect(rows.polos).toMatchObject({ suggestedQuantity: 60, state: "INCLUDED", customerOverridden: false, stillSuggested: true });
    expect(rows.badges).toMatchObject({ suggestedQuantity: 250, state: "INCLUDED" });
    expect(rows.rollups).toMatchObject({ suggestedQuantity: 4, state: "INCLUDED" });
    // Useful additions and optional extras are offered, not added for the customer.
    expect(rows.backdrop).toMatchObject({ group: "USEFUL", state: "SUGGESTED" });
    expect(rows.totes).toMatchObject({ group: "OPTIONAL", state: "SUGGESTED", suggestedQuantity: 250 });
  });

  it.each([
    { name: "a number condition below the line", answers: { ...BRIEF, attendees: 80 }, missing: "rollups" },
    { name: "a yes/no condition answered no", answers: { ...BRIEF, hasStage: "NO" }, missing: "backdrop" },
    { name: "a multi-choice condition not chosen", answers: { ...BRIEF, goals: ["SIGNAGE"] }, missing: "totes" },
    { name: "\"I'm not sure\" never meets a number condition", answers: { ...BRIEF, attendees: "NOT_SURE" }, missing: "rollups" },
  ])("leaves out a rule when $name", ({ answers, missing }) => {
    expect(byKey(reconcile(EVENT_RULES, answers, []).keep)[missing]).toBeUndefined();
  });

  it("asks staff for the quantity when the answer it depends on is unknown", () => {
    const rows = byKey(reconcile(EVENT_RULES, { ...BRIEF, crew: "NOT_SURE" }, []).keep);
    expect(rows.polos).toMatchObject({ suggestedQuantity: null, state: "INCLUDED" });
  });

  it("rounds a multiple up to whole pieces", () => {
    const rules = [rule("lanyards", { quantity: { kind: "PER", field: "attendees", factor: 1.1 } })];
    expect(reconcile(rules, { attendees: 101 }, []).keep[0]!.suggestedQuantity).toBe(112);
  });

  it("ignores rules staff switched off", () => {
    const rules = EVENT_RULES.map((item) => (item.id === "polos" ? { ...item, active: false } : item));
    expect(byKey(reconcile(rules, BRIEF, []).keep).polos).toBeUndefined();
  });
});

describe("the customer's edits win (PROJ-FR-004)", () => {
  const edit = (rows: SuggestionRow[], key: string, change: Partial<SuggestionRow>) =>
    rows.map((row) => (row.ruleKey === key ? { ...row, ...change, customerOverridden: true } : row));

  it("keeps a removed suggestion removed after the scale changes", () => {
    const removed = edit(first(), "badges", { state: "REMOVED" });
    const after = byKey(reconcile(EVENT_RULES, { ...BRIEF, attendees: 400 }, removed).keep);
    expect(after.badges).toMatchObject({ state: "REMOVED", suggestedQuantity: 400 });
  });

  it("keeps the customer's quantity while the suggestion moves", () => {
    const changed = edit(first(), "rollups", { customerQuantity: 2 });
    const after = byKey(reconcile(EVENT_RULES, { ...BRIEF, attendees: 300 }, changed).keep);
    expect(after.rollups).toMatchObject({ customerQuantity: 2, suggestedQuantity: 4, state: "INCLUDED" });
  });

  it("drops a suggestion the customer never touched when it no longer applies", () => {
    const result = reconcile(EVENT_RULES, { ...BRIEF, attendees: 80 }, first());
    expect(byKey(result.keep).rollups).toBeUndefined();
    expect(result.drop).toEqual(["rollups"]);
  });

  it("keeps an item the customer chose even when it no longer applies, and says so", () => {
    const added = edit(first(), "backdrop", { state: "INCLUDED" });
    const after = byKey(reconcile(EVENT_RULES, { ...BRIEF, hasStage: "NO" }, added).keep);
    expect(after.backdrop).toMatchObject({ state: "INCLUDED", stillSuggested: false });
  });

  it("keeps a removal when the rule stops and starts applying again", () => {
    const removed = edit(first(), "rollups", { state: "REMOVED" });
    const smaller = reconcile(EVENT_RULES, { ...BRIEF, attendees: 80 }, removed).keep;
    expect(byKey(smaller).rollups).toMatchObject({ state: "REMOVED", stillSuggested: false });
    const bigger = reconcile(EVENT_RULES, { ...BRIEF, attendees: 500 }, smaller).keep;
    expect(byKey(bigger).rollups).toMatchObject({ state: "REMOVED", stillSuggested: true });
  });

  it("keeps the customer's choice when staff delete the rule", () => {
    const removed = edit(first(), "totes", { state: "INCLUDED" });
    const rules = EVENT_RULES.filter((item) => item.id !== "totes");
    expect(byKey(reconcile(rules, BRIEF, removed).keep).totes).toMatchObject({ state: "INCLUDED", stillSuggested: false });
  });

  it("moves an untouched suggestion to its rule's new group and default state", () => {
    const rules = EVENT_RULES.map((item) => (item.id === "backdrop" ? { ...item, group: "RECOMMENDED" as const } : item));
    expect(byKey(reconcile(rules, BRIEF, first()).keep).backdrop).toMatchObject({ group: "RECOMMENDED", state: "INCLUDED" });
  });
});

describe("timing and open items (Stage 3.1D §8, §14)", () => {
  const now = new Date("2026-10-02T09:00:00Z");

  it.each([
    { neededBy: "2026-12-01", expected: "COMFORTABLE" },
    { neededBy: "2026-10-30", expected: "TIGHT" },
    { neededBy: "2026-10-12", expected: "PRODUCTION_REVIEW" },
    { neededBy: "NOT_SURE", expected: null },
    { neededBy: null, expected: null },
  ])("reads $neededBy as $expected", ({ neededBy, expected }) => {
    expect(deadlineState({ neededBy }, now)).toBe(expected);
  });

  it("lists what is still to come", () => {
    expect(
      openItems({ sizesKnown: "NO", brand: ["SEND_LATER", "DESIGN_HELP"], installation: "YES", neededBy: "NOT_SURE" }, [{ included: true, quantity: null }]),
    ).toEqual(["SIZES_LATER", "ARTWORK_LATER", "DESIGN_HELP", "INSTALLATION_REVIEW", "QUANTITY_AFTER_REVIEW", "DATE_UNKNOWN"]);
    expect(openItems({ sizesKnown: "YES", brand: ["ARTWORK_READY"], neededBy: "2026-12-01" }, [{ included: true, quantity: 30 }])).toEqual([]);
  });
});
