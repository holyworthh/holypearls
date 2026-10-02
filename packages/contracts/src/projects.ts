import { z } from "zod";
import { publicProductCardSchema } from "./storefront.js";

/*
 * Start a Project (T05-01; PROJ-FR-001–007, Stage 3.1D). A project starts
 * from a goal, not a product. The six steps never change; the questions
 * inside Project and Scale depend on the project type. "I'm not sure" is a
 * valid answer wherever staff can still work with it (PROJ-FR-002).
 */

const isoDate = z.iso.datetime();

/** Stage 3.1D §3, the owner's choice of the full list (2 October 2026). */
export const PROJECT_TYPES = [
  "EVENT",
  "STAFF_UNIFORMS",
  "BUSINESS_LAUNCH",
  "CORPORATE_GIFTS",
  "RETAIL_SPACE",
  "MERCHANDISE",
  "PACKAGING",
  "FASHION_PRODUCTION",
  "SCHOOL_UNIFORMS",
  "HOSPITALITY",
  "WEDDING",
  "CAMPAIGN",
  "SOMETHING_ELSE",
] as const;
export const projectTypeSchema = z.enum(PROJECT_TYPES);
export type ProjectType = z.infer<typeof projectTypeSchema>;

/** The six Pen 23 cards first, then the rest under "More kinds of project". */
export const FEATURED_PROJECT_TYPES: ProjectType[] = ["EVENT", "STAFF_UNIFORMS", "BUSINESS_LAUNCH", "CORPORATE_GIFTS", "RETAIL_SPACE", "MERCHANDISE"];

export const PROJECT_TYPE_INFO: Record<ProjectType, { label: string; eyebrow: string; line: string }> = {
  EVENT: { label: "Event branding", eyebrow: "CONFERENCES · LAUNCHES · ACTIVATIONS", line: "Backdrops · badges · crew wear · roll-ups · signage" },
  STAFF_UNIFORMS: { label: "Staff uniforms", eyebrow: "ONE LOCATION OR MANY", line: "Polos · aprons · workwear · staff size collection" },
  BUSINESS_LAUNCH: { label: "Brand launch", eyebrow: "OPENING SOMETHING NEW", line: "Packaging, print, merch" },
  CORPORATE_GIFTS: { label: "Corporate gifts", eyebrow: "CLIENTS · STAFF · PARTNERS", line: "Welcome kits, thank-yous" },
  RETAIL_SPACE: { label: "Office & retail signage", eyebrow: "SHOPS · OFFICES · BRANCHES", line: "Walls, windows, wayfinding" },
  MERCHANDISE: { label: "Merch drop", eyebrow: "TO SELL OR GIVE AWAY", line: "Tees, totes, caps to sell" },
  PACKAGING: { label: "Packaging & product branding", eyebrow: "FOR A PRODUCT YOU SELL", line: "Boxes, bags, labels and inserts" },
  FASHION_PRODUCTION: { label: "Fashion & clothing production", eyebrow: "YOUR OWN DESIGNS", line: "Samples, tech packs and production runs" },
  SCHOOL_UNIFORMS: { label: "School uniform programme", eyebrow: "PUPILS AND STAFF", line: "Shirts, skirts and trousers, sportswear, bags" },
  HOSPITALITY: { label: "Hospitality programme", eyebrow: "HOTELS · RESTAURANTS · BARS", line: "Uniforms, menus, signage, amenities" },
  WEDDING: { label: "Wedding or celebration", eyebrow: "GUESTS AND FAMILY", line: "Aso ebi, favours, signage, stationery" },
  CAMPAIGN: { label: "Campaign or promotion", eyebrow: "OUTDOOR · IN STORE · GIVEAWAYS", line: "Banners, flyers, giveaways and displays" },
  SOMETHING_ELSE: { label: "Something else", eyebrow: "NOT ON THE LIST", line: "Describe it and we'll work it out with you." },
};

/* ------------------------------------------------------------------ */
/* Questions                                                           */
/* ------------------------------------------------------------------ */

export const NOT_SURE = "NOT_SURE" as const;

type Option = { value: string; label: string };
const opts = (...pairs: [string, string][]): Option[] => pairs.map(([value, label]) => ({ value, label }));
const notSure: Option = { value: NOT_SURE, label: "I'm not sure yet" };

export type ProjectQuestion =
  | { key: string; kind: "CHOICE"; label: string; hint?: string; options: Option[] }
  | { key: string; kind: "MULTI"; label: string; hint?: string; options: Option[] }
  | { key: string; kind: "NUMBER"; label: string; hint?: string; max: number; unit: string }
  | { key: string; kind: "YES_NO"; label: string; hint?: string }
  | { key: string; kind: "TEXT"; label: string; hint?: string; max: number; long?: boolean }
  | { key: string; kind: "DATE"; label: string; hint?: string };

export type ProjectStep = "PROJECT" | "SCALE" | "DATE_LOCATION" | "BRAND" | "RECOMMENDATIONS" | "REVIEW";
export const PROJECT_STEPS: { key: ProjectStep; slug: string; label: string }[] = [
  { key: "PROJECT", slug: "project", label: "Project" },
  { key: "SCALE", slug: "scale", label: "Scale" },
  { key: "DATE_LOCATION", slug: "date-location", label: "Date & location" },
  { key: "BRAND", slug: "brand", label: "Brand" },
  { key: "RECOMMENDATIONS", slug: "recommendations", label: "Recommendations" },
  { key: "REVIEW", slug: "review", label: "Review" },
];
export const projectStepSchema = z.enum(["PROJECT", "SCALE", "DATE_LOCATION", "BRAND", "RECOMMENDATIONS", "REVIEW"]);

const peopleUniformScale = (who: string): ProjectQuestion[] => [
  { key: "people", kind: "NUMBER", label: `How many ${who}?`, max: 100_000, unit: who },
  { key: "roles", kind: "NUMBER", label: "How many roles or departments?", hint: "Different roles often wear different garments.", max: 200, unit: "roles" },
  { key: "locations", kind: "NUMBER", label: "How many locations or branches?", max: 500, unit: "locations" },
  { key: "sizesKnown", kind: "YES_NO", label: "Do you know everyone's sizes yet?", hint: "Not yet is fine. We can collect sizes later." },
];

const quantityScale = (label: string, unit: string): ProjectQuestion[] => [
  { key: "quantity", kind: "NUMBER", label, hint: "A rough number is fine.", max: 1_000_000, unit },
  { key: "locations", kind: "NUMBER", label: "How many places does it go to?", max: 500, unit: "locations" },
];

/** Stage 3.1D §6–7. Keys are stable: recommendation rules refer to them. */
export const PROJECT_QUESTIONS: Record<ProjectType, { project: ProjectQuestion[]; scale: ProjectQuestion[] }> = {
  EVENT: {
    project: [
      { key: "eventType", kind: "CHOICE", label: "What kind of event?", options: [...opts(["CONFERENCE", "Conference"], ["EXHIBITION", "Exhibition"], ["LAUNCH", "Launch"], ["FESTIVAL", "Festival"], ["PRIVATE_EVENT", "Private event"], ["OTHER", "Something else"]), notSure] },
      { key: "goals", kind: "MULTI", label: "What matters most?", hint: "Choose any that apply.", options: [...opts(["STAFF_BRANDING", "Staff and crew branding"], ["GUEST_EXPERIENCE", "Guest experience"], ["SIGNAGE", "Signage"], ["MERCHANDISE", "Merchandise"], ["COMPLETE", "Complete event branding"]), notSure] },
      { key: "hasStage", kind: "YES_NO", label: "Is there a stage or photo area?" },
      { key: "giftPack", kind: "YES_NO", label: "Will guests take home a gift pack?" },
    ],
    scale: [
      { key: "attendees", kind: "NUMBER", label: "How many guests?", max: 100_000, unit: "guests" },
      { key: "crew", kind: "NUMBER", label: "How many staff or crew?", max: 10_000, unit: "crew" },
      { key: "venues", kind: "NUMBER", label: "How many venues?", max: 100, unit: "venues" },
    ],
  },
  STAFF_UNIFORMS: {
    project: [
      { key: "industry", kind: "TEXT", label: "What kind of business is it?", hint: "For example a restaurant group, clinic or bank.", max: 120 },
      { key: "garments", kind: "MULTI", label: "What do people need to wear?", options: [...opts(["POLOS", "Polo shirts"], ["SHIRTS", "Shirts"], ["APRONS", "Aprons"], ["CHEF_WEAR", "Chef and kitchen wear"], ["WORKWEAR", "Workwear"], ["CAPS", "Caps"]), notSure] },
      { key: "programme", kind: "CHOICE", label: "Is this new or a reorder?", options: [...opts(["NEW", "A new uniform"], ["REORDER", "A reorder or refresh"]), notSure] },
    ],
    scale: peopleUniformScale("employees"),
  },
  BUSINESS_LAUNCH: {
    project: [
      { key: "needs", kind: "MULTI", label: "What are you launching with?", options: [...opts(["STATIONERY", "Stationery"], ["SIGNAGE", "Signage"], ["UNIFORMS", "Staff uniforms"], ["PACKAGING", "Packaging"], ["MERCH", "Merchandise"]), notSure] },
      { key: "physicalSpace", kind: "YES_NO", label: "Is there a space customers visit?" },
    ],
    scale: [
      { key: "locations", kind: "NUMBER", label: "How many locations?", max: 500, unit: "locations" },
      { key: "staff", kind: "NUMBER", label: "About how many staff?", max: 100_000, unit: "staff" },
    ],
  },
  CORPORATE_GIFTS: {
    project: [
      { key: "occasion", kind: "CHOICE", label: "What's the occasion?", options: [...opts(["WELCOME", "Welcome kits"], ["THANK_YOU", "Thank-yous"], ["FESTIVE", "Festive season"], ["EVENT", "An event"], ["OTHER", "Something else"]), notSure] },
      { key: "items", kind: "MULTI", label: "What might go in it?", options: [...opts(["MUGS", "Mugs"], ["NOTEBOOKS", "Notebooks"], ["BOTTLES", "Bottles"], ["TOTES", "Tote bags"], ["APPAREL", "Apparel"], ["KITS", "Boxed kits"]), notSure] },
      { key: "individualDelivery", kind: "YES_NO", label: "Do gifts go to people one by one?" },
    ],
    scale: [
      { key: "recipients", kind: "NUMBER", label: "How many people get one?", max: 100_000, unit: "recipients" },
      { key: "locations", kind: "NUMBER", label: "How many places does it go to?", max: 500, unit: "locations" },
    ],
  },
  RETAIL_SPACE: {
    project: [
      { key: "spaceType", kind: "CHOICE", label: "What kind of space?", options: [...opts(["SHOP", "Shop"], ["OFFICE", "Office"], ["RESTAURANT", "Restaurant"], ["CLINIC", "Clinic"], ["OTHER", "Something else"]), notSure] },
      { key: "needs", kind: "MULTI", label: "What does it need?", options: [...opts(["WINDOW", "Window graphics"], ["WALL", "Wall graphics"], ["WAYFINDING", "Wayfinding"], ["SHOPFRONT", "Shopfront sign"], ["DISPLAYS", "Displays"]), notSure] },
      { key: "installation", kind: "YES_NO", label: "Should HolyPearls install it?" },
    ],
    scale: [
      { key: "locations", kind: "NUMBER", label: "How many sites?", max: 500, unit: "sites" },
      { key: "rooms", kind: "NUMBER", label: "About how many rooms or areas per site?", max: 500, unit: "areas" },
    ],
  },
  MERCHANDISE: {
    project: [
      { key: "purpose", kind: "CHOICE", label: "What's it for?", options: [...opts(["SELL", "To sell"], ["GIVE_AWAY", "To give away"], ["TEAM", "For our team"]), notSure] },
      { key: "items", kind: "MULTI", label: "What are you thinking of?", options: [...opts(["TEES", "T-shirts"], ["HOODIES", "Hoodies"], ["CAPS", "Caps"], ["TOTES", "Tote bags"], ["MUGS", "Mugs"], ["STICKERS", "Stickers"]), notSure] },
    ],
    scale: quantityScale("About how many pieces in total?", "pieces"),
  },
  PACKAGING: {
    project: [
      { key: "product", kind: "TEXT", label: "What's the product?", hint: "For example skincare, cakes or clothing.", max: 120 },
      { key: "needs", kind: "MULTI", label: "What packaging do you need?", options: [...opts(["BOXES", "Boxes"], ["BAGS", "Bags"], ["LABELS", "Labels"], ["STICKERS", "Stickers"], ["INSERTS", "Tissue and inserts"]), notSure] },
    ],
    scale: quantityScale("About how many units of the product?", "units"),
  },
  FASHION_PRODUCTION: {
    project: [
      { key: "garmentType", kind: "TEXT", label: "What are you making?", hint: "For example dresses, kaftans or a capsule collection.", max: 120 },
      { key: "stage", kind: "CHOICE", label: "How far along is it?", options: [...opts(["IDEA", "An idea"], ["DESIGNS", "Designs ready"], ["TECH_PACK", "Tech pack ready"], ["SAMPLE", "A sample exists"]), notSure] },
      { key: "sampleFirst", kind: "YES_NO", label: "Do you want a sample first?" },
    ],
    scale: [
      { key: "styles", kind: "NUMBER", label: "How many styles?", max: 500, unit: "styles" },
      { key: "quantity", kind: "NUMBER", label: "About how many pieces in total?", max: 1_000_000, unit: "pieces" },
    ],
  },
  SCHOOL_UNIFORMS: {
    project: [
      { key: "garments", kind: "MULTI", label: "What's in the uniform?", options: [...opts(["SHIRTS", "Shirts and blouses"], ["BOTTOMS", "Skirts and trousers"], ["SPORTSWEAR", "Sportswear"], ["KNITWEAR", "Cardigans and sweaters"], ["BAGS", "Bags"]), notSure] },
      { key: "programme", kind: "CHOICE", label: "Is this new or a reorder?", options: [...opts(["NEW", "A new uniform"], ["REORDER", "A reorder or refresh"]), notSure] },
    ],
    scale: peopleUniformScale("pupils"),
  },
  HOSPITALITY: {
    project: [
      { key: "venueType", kind: "CHOICE", label: "What kind of venue?", options: [...opts(["HOTEL", "Hotel"], ["RESTAURANT", "Restaurant"], ["BAR", "Bar or lounge"], ["CAFE", "Café"], ["OTHER", "Something else"]), notSure] },
      { key: "needs", kind: "MULTI", label: "What do you need?", options: [...opts(["UNIFORMS", "Staff uniforms"], ["MENUS", "Menus"], ["SIGNAGE", "Signage"], ["PACKAGING", "Takeaway packaging"], ["AMENITIES", "Guest amenities"]), notSure] },
    ],
    scale: peopleUniformScale("staff"),
  },
  WEDDING: {
    project: [
      { key: "needs", kind: "MULTI", label: "What are you planning?", options: [...opts(["ASO_EBI", "Aso ebi"], ["FAVOURS", "Favours"], ["SIGNAGE", "Signage"], ["STATIONERY", "Invitations and stationery"], ["BACKDROP", "Backdrop"]), notSure] },
      { key: "hasStage", kind: "YES_NO", label: "Is there a stage or photo area?" },
    ],
    scale: [{ key: "attendees", kind: "NUMBER", label: "How many guests?", max: 100_000, unit: "guests" }],
  },
  CAMPAIGN: {
    project: [
      { key: "channels", kind: "MULTI", label: "Where will people see it?", options: [...opts(["OUTDOOR", "Outdoor"], ["IN_STORE", "In store"], ["EVENTS", "At events"], ["GIVEAWAYS", "Giveaways"]), notSure] },
      { key: "brief", kind: "TEXT", label: "What's the campaign about?", max: 600, long: true },
    ],
    scale: quantityScale("About how many people should it reach?", "people"),
  },
  SOMETHING_ELSE: {
    project: [{ key: "description", kind: "TEXT", label: "What are you trying to make or achieve?", hint: "A sentence or two is enough.", max: 2000, long: true }],
    scale: quantityScale("About how many?", "items"),
  },
};

/** Stage 3.1D §8 and §25: the same for every type. */
export const BRAND_READINESS = [
  { value: "ARTWORK_READY", label: "Ready artwork" },
  { value: "LOGO", label: "A logo" },
  { value: "GUIDELINES", label: "Brand guidelines" },
  { value: "REFERENCES", label: "Reference images" },
  { value: "SAMPLE", label: "An existing product or sample" },
  { value: "TECH_PACK", label: "A tech pack" },
  { value: "DESIGN_HELP", label: "Nothing yet, I need design help" },
  { value: "SEND_LATER", label: "I'll send files later" },
] as const;
export const brandReadinessSchema = z.enum(BRAND_READINESS.map((item) => item.value) as [string, ...string[]]);

/** One answer: text, a choice, several choices, a number, a date, or "I'm not sure". */
export const answerValueSchema = z.union([z.string().max(2000), z.array(z.string().max(60)).max(20), z.number().int("Enter a whole number").min(0, "Enter 0 or more").max(1_000_000, "Enter a smaller number"), z.null()]);
export type AnswerValue = z.infer<typeof answerValueSchema>;
export const projectAnswersSchema = z.record(z.string().max(40), answerValueSchema);
export type ProjectAnswers = z.infer<typeof projectAnswersSchema>;

/** The Date & location and Brand questions, kept with the type's own answers. */
export const COMMON_QUESTIONS: ProjectQuestion[] = [
  { key: "neededBy", kind: "DATE", label: "When is it needed?", hint: "The date it must arrive, or the event date." },
  { key: "setupDate", kind: "DATE", label: "Setup or installation date, if different" },
  { key: "country", kind: "TEXT", label: "Country", max: 60 },
  { key: "city", kind: "TEXT", label: "City", max: 80 },
  { key: "locationNote", kind: "TEXT", label: "Anything else about where it goes?", hint: "No street address needed yet.", max: 300 },
  { key: "brand", kind: "MULTI", label: "What do you have already?", options: BRAND_READINESS.map((item) => ({ value: item.value, label: item.label })) },
  { key: "brandNote", kind: "TEXT", label: "Anything we should know about your brand?", max: 600, long: true },
];

export function questionsFor(type: ProjectType): ProjectQuestion[] {
  const own = PROJECT_QUESTIONS[type];
  return [...own.project, ...own.scale, ...COMMON_QUESTIONS];
}

/**
 * Checks answers against the type's questions. Unknown keys and wrong shapes
 * are refused; "I'm not sure" (NOT_SURE) is allowed for choices and yes/no,
 * and null clears an answer. Returns field errors keyed by question.
 */
export function checkAnswers(type: ProjectType, answers: ProjectAnswers): Record<string, string> {
  const errors: Record<string, string> = {};
  const byKey = new Map(questionsFor(type).map((question) => [question.key, question]));
  for (const [key, value] of Object.entries(answers)) {
    const question = byKey.get(key);
    if (!question) {
      errors[key] = "This question isn't part of this kind of project.";
      continue;
    }
    if (value === null) continue;
    switch (question.kind) {
      case "CHOICE":
        if (typeof value !== "string" || !question.options.some((option) => option.value === value)) errors[key] = "Choose one of the options.";
        break;
      case "MULTI":
        if (!Array.isArray(value) || value.some((item) => !question.options.some((option) => option.value === item)) || new Set(value).size !== value.length) errors[key] = "Choose from the options.";
        break;
      case "NUMBER":
        if (!(value === NOT_SURE || (typeof value === "number" && value >= 0 && value <= question.max))) errors[key] = `Enter a number up to ${question.max.toLocaleString("en-NG")}, or choose "I'm not sure".`;
        break;
      case "YES_NO":
        if (value !== "YES" && value !== "NO" && value !== NOT_SURE) errors[key] = "Choose yes, no or not sure.";
        break;
      case "TEXT":
        if (typeof value !== "string" || value.length > question.max) errors[key] = `Use ${question.max.toLocaleString("en-NG")} characters or fewer.`;
        break;
      case "DATE":
        if (!(value === NOT_SURE || (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))))) errors[key] = "Enter a date, or choose \"I'm not sure\".";
        break;
    }
  }
  return errors;
}

/* ------------------------------------------------------------------ */
/* Recommendation rules (PROJ-FR-003, Pen 110)                         */
/* ------------------------------------------------------------------ */

export const recommendationGroupSchema = z.enum(["RECOMMENDED", "USEFUL", "OPTIONAL"]);
export type RecommendationGroup = z.infer<typeof recommendationGroupSchema>;
export const RECOMMENDATION_GROUP_LABEL: Record<RecommendationGroup, string> = { RECOMMENDED: "Recommended", USEFUL: "Useful additions", OPTIONAL: "Optional" };

/** When a rule applies: always, a number answer compared with a value, or a choice/yes-no answer. */
export const ruleConditionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ALWAYS") }).strict(),
  z.object({ kind: z.literal("NUMBER"), field: z.string().max(40), op: z.enum([">", ">=", "<", "<="]), value: z.number().int().min(0).max(1_000_000) }).strict(),
  z.object({ kind: z.literal("ANSWER"), field: z.string().max(40), equals: z.string().max(60) }).strict(),
]);
export type RuleCondition = z.infer<typeof ruleConditionSchema>;

/** How many: a fixed number, or one per (or a multiple of) a number answer. */
export const ruleQuantitySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("FIXED"), value: z.number().int().min(1).max(1_000_000) }).strict(),
  z.object({ kind: z.literal("PER"), field: z.string().max(40), factor: z.number().positive().max(100) }).strict(),
  z.object({ kind: z.literal("AFTER_REVIEW") }).strict(),
]);
export type RuleQuantity = z.infer<typeof ruleQuantitySchema>;

const ruleBase = z.object({
  group: recommendationGroupSchema,
  /** A catalogue product, or null for a described item ("Main backdrop") staff will quote. */
  productSlug: z.string().max(120).nullable(),
  itemName: z.string().trim().min(1, "Name the item").max(120),
  condition: ruleConditionSchema,
  quantity: ruleQuantitySchema,
  reason: z.string().trim().min(1, "Give the reason customers see").max(200, "Keep the reason under 200 characters"),
  active: z.boolean(),
});

export const recommendationRuleSchema = ruleBase.extend({ id: z.string(), position: z.number().int(), productName: z.string().nullable() });
export type RecommendationRule = z.infer<typeof recommendationRuleSchema>;

export const recommendationRuleSetSchema = z.object({
  projectType: projectTypeSchema,
  version: z.number().int(),
  rules: z.array(recommendationRuleSchema),
  updatedAt: isoDate.nullable(),
  updatedBy: z.string().nullable(),
});
export type RecommendationRuleSet = z.infer<typeof recommendationRuleSetSchema>;

/** Saving keeps each rule's id, so customers' choices about a suggestion survive edits. New rules have no id. */
export const saveRecommendationRulesSchema = z.object({
  version: z.number().int(),
  rules: z.array(ruleBase.extend({ id: z.string().uuid().optional() })).max(60, "Keep it to 60 rules or fewer"),
});
export type SaveRecommendationRules = z.infer<typeof saveRecommendationRulesSchema>;

export const previewRecommendationsSchema = z.object({ answers: projectAnswersSchema });

/** Checks a rule refers to questions this type has, with the right kind of answer. */
export function checkRule(type: ProjectType, rule: { condition: RuleCondition; quantity: RuleQuantity }): Record<string, string> {
  const errors: Record<string, string> = {};
  const byKey = new Map(questionsFor(type).map((question) => [question.key, question]));
  if (rule.condition.kind === "NUMBER" && byKey.get(rule.condition.field)?.kind !== "NUMBER") errors.condition = "Choose a number question.";
  if (rule.condition.kind === "ANSWER") {
    const question = byKey.get(rule.condition.field);
    const allowed = question?.kind === "YES_NO" ? ["YES", "NO", NOT_SURE] : question && (question.kind === "CHOICE" || question.kind === "MULTI") ? question.options.map((option) => option.value) : null;
    if (!allowed) errors.condition = "Choose a question with set answers.";
    else if (!allowed.includes(rule.condition.equals)) errors.condition = "Choose one of that question's answers.";
  }
  if (rule.quantity.kind === "PER" && byKey.get(rule.quantity.field)?.kind !== "NUMBER") errors.quantity = "Choose a number question.";
  return errors;
}

/* ------------------------------------------------------------------ */
/* The project                                                         */
/* ------------------------------------------------------------------ */

export const projectStatusSchema = z.enum(["DRAFT", "SUBMITTED", "UNDER_REVIEW", "QUOTED", "ORDERED", "COMPLETED", "CANCELLED", "EXPIRED"]);
export type ProjectStatus = z.infer<typeof projectStatusSchema>;

export const recommendationStateSchema = z.enum(["SUGGESTED", "INCLUDED", "REMOVED"]);
export type RecommendationState = z.infer<typeof recommendationStateSchema>;

const productBrief = publicProductCardSchema.pick({ slug: true, name: true, price: true, priceState: true, image: true });

export const projectRecommendationSchema = z.object({
  key: z.string(),
  group: recommendationGroupSchema,
  name: z.string(),
  reason: z.string(),
  product: productBrief.nullable(),
  suggestedQuantity: z.number().int().nullable(),
  /** The quantity the customer set, or null to follow the suggestion. */
  customerQuantity: z.number().int().nullable(),
  state: recommendationStateSchema,
  /** False when the brief changed and the rule no longer applies, but the customer had already chosen it. */
  stillSuggested: z.boolean(),
});
export type ProjectRecommendation = z.infer<typeof projectRecommendationSchema>;

export const projectItemSchema = z.object({
  id: z.string(),
  kind: z.enum(["CATALOGUE", "CUSTOM"]),
  name: z.string(),
  description: z.string().nullable(),
  product: productBrief.nullable(),
  quantity: z.number().int().nullable(),
  /** "About 30, sizes later". */
  quantityNote: z.string().nullable(),
  files: z.array(z.object({ id: z.string(), name: z.string(), status: z.string() })),
});
export type ProjectItem = z.infer<typeof projectItemSchema>;

export const projectFileSchema = z.object({ id: z.string(), fileId: z.string(), name: z.string(), status: z.string(), itemId: z.string().nullable() });

/** What the review and the summary flag as still to come (Stage 3.1D §14). */
export const openItemSchema = z.enum(["SIZES_LATER", "ARTWORK_LATER", "DESIGN_HELP", "INSTALLATION_REVIEW", "QUANTITY_AFTER_REVIEW", "DATE_UNKNOWN"]);
export const OPEN_ITEM_LABEL: Record<z.infer<typeof openItemSchema>, string> = {
  SIZES_LATER: "Size breakdown needed later",
  ARTWORK_LATER: "Artwork can be sent later",
  DESIGN_HELP: "Design help requested",
  INSTALLATION_REVIEW: "Installation site details needed",
  QUANTITY_AFTER_REVIEW: "Some quantities confirmed after review",
  DATE_UNKNOWN: "Date to be confirmed",
};

/** Stage 3.1D §8: timing guidance only. It never promises feasibility. */
export const deadlineStateSchema = z.enum(["COMFORTABLE", "TIGHT", "PRODUCTION_REVIEW"]);
export const DEADLINE_LABEL: Record<z.infer<typeof deadlineStateSchema>, string> = {
  COMFORTABLE: "Comfortable",
  TIGHT: "Tight. Rush may be possible.",
  PRODUCTION_REVIEW: "Production review needed",
};

export const projectSchema = z.object({
  id: z.string(),
  reference: z.string().nullable(),
  type: projectTypeSchema,
  title: z.string().nullable(),
  status: projectStatusSchema,
  step: projectStepSchema,
  answers: projectAnswersSchema,
  recommendations: z.array(projectRecommendationSchema),
  items: z.array(projectItemSchema),
  files: z.array(projectFileSchema),
  openItems: z.array(openItemSchema),
  deadline: deadlineStateSchema.nullable(),
  /** Projects are quote-led (Stage 3.1D §15; owner decision: no estimate range for now). */
  priceState: z.literal("QUOTE_REQUIRED"),
  /** Whether a link to this draft has been emailed. */
  linkEmailed: z.boolean(),
  version: z.number().int(),
  updatedAt: isoDate,
});
export type Project = z.infer<typeof projectSchema>;

/** "Continue your Event branding project — Recommendations." */
export const projectResumeSchema = z.object({ id: z.string(), type: projectTypeSchema, title: z.string().nullable(), step: projectStepSchema, updatedAt: isoDate }).nullable();

export const createProjectSchema = z.object({
  type: projectTypeSchema,
  title: z.string().trim().max(120).optional(),
  /** "In your own words" on /start: becomes the Something else description. */
  description: z.string().trim().max(2000).optional(),
});

export const updateProjectSchema = z.object({
  version: z.number().int(),
  step: projectStepSchema.optional(),
  title: z.string().trim().max(120).nullable().optional(),
  /** Only the answers that changed; null clears one. */
  answers: projectAnswersSchema.optional(),
});

export const updateRecommendationSchema = z
  .object({
    version: z.number().int(),
    state: z.enum(["INCLUDED", "REMOVED"]).optional(),
    quantity: z.number().int().min(1, "Enter at least 1").max(1_000_000).nullable().optional(),
  })
  .refine((value) => value.state !== undefined || value.quantity !== undefined, { message: "Nothing to change" });

export const addProjectItemSchema = z.object({
  version: z.number().int(),
  productSlug: z.string().max(120).optional(),
  name: z.string().trim().min(1, "Describe the item").max(120, "Use 120 characters or fewer").optional(),
  description: z.string().trim().max(2000, "Use 2,000 characters or fewer").optional(),
  quantity: z.number().int().min(1, "Enter at least 1").max(1_000_000).nullable().optional(),
  quantityNote: z.string().trim().max(120).optional(),
});

export const updateProjectItemSchema = z.object({
  version: z.number().int(),
  name: z.string().trim().min(1, "Describe the item").max(120).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  quantity: z.number().int().min(1, "Enter at least 1").max(1_000_000).nullable().optional(),
  quantityNote: z.string().trim().max(120).nullable().optional(),
});

export const attachProjectFileSchema = z.object({ fileId: z.string().uuid(), itemId: z.string().uuid().optional() });
export const emailProjectLinkSchema = z.object({ email: z.email("Enter an email like name@example.com") });

/* ------------------------------------------------------------------ */
/* Help me figure it out (Stage 3.1D §21)                              */
/* ------------------------------------------------------------------ */

export const FIGURE_IT_OUT = {
  who: opts(["BUSINESS", "A business"], ["TEAM", "A team"], ["EVENT", "An event"], ["CUSTOMERS", "Customers"], ["PERSONAL", "Something personal"], ["OTHER", "Something else"]),
  goal: opts(["UNIFORM", "Dress people the same"], ["PROMOTE", "Promote something"], ["SPACE", "Decorate a space"], ["PACKAGE", "Package a product"], ["GIFT", "Give gifts"], ["SELL", "Sell merchandise"], [NOT_SURE, "I'm not sure"]),
} as const;

/** Suggests project types from two answers. The customer can still pick any other type. */
export function suggestProjectTypes(who: string | null, goal: string | null): ProjectType[] {
  const byGoal: Record<string, ProjectType[]> = {
    UNIFORM: who === "EVENT" ? ["EVENT", "STAFF_UNIFORMS"] : ["STAFF_UNIFORMS", "SCHOOL_UNIFORMS", "HOSPITALITY"],
    PROMOTE: who === "EVENT" ? ["EVENT", "CAMPAIGN"] : ["CAMPAIGN", "BUSINESS_LAUNCH", "MERCHANDISE"],
    SPACE: ["RETAIL_SPACE", "EVENT"],
    PACKAGE: ["PACKAGING"],
    GIFT: ["CORPORATE_GIFTS", "WEDDING"],
    SELL: ["MERCHANDISE", "FASHION_PRODUCTION"],
  };
  const byWho: Record<string, ProjectType[]> = {
    BUSINESS: ["BUSINESS_LAUNCH", "STAFF_UNIFORMS", "RETAIL_SPACE"],
    TEAM: ["STAFF_UNIFORMS", "MERCHANDISE"],
    EVENT: ["EVENT", "WEDDING"],
    CUSTOMERS: ["CAMPAIGN", "PACKAGING", "MERCHANDISE"],
    PERSONAL: ["WEDDING", "FASHION_PRODUCTION"],
  };
  const list = (goal && byGoal[goal]) || (who && byWho[who]) || ["SOMETHING_ELSE"];
  return [...new Set([...list, "SOMETHING_ELSE" as const])].slice(0, 4);
}
