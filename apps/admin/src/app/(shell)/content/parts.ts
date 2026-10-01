import { type ContentType, GUIDE_TOPIC_LABEL } from "@holypearls/contracts";

/**
 * The structured parts of each page type, as form fields. They mirror the
 * per-type data schemas in @holypearls/contracts (content.ts); the API
 * validates the result, so this only decides how the form looks.
 */
export type PartField =
  | { kind: "text"; key: string; label: string; hint?: string; max: number; nullable?: boolean }
  | { kind: "textarea"; key: string; label: string; hint?: string; max: number }
  | { kind: "number"; key: string; label: string; min: number; max: number }
  | { kind: "checkbox"; key: string; label: string }
  | { kind: "select"; key: string; label: string; options: readonly { value: string; label: string }[] }
  | { kind: "strings"; key: string; label: string; item: string; max: number; length: number }
  | { kind: "list"; key: string; label: string; item: string; max: number; min?: number; fields: readonly PartField[] }
  /** An optional block (null when absent), such as a guide's comparison. */
  | { kind: "optional"; key: string; label: string; hint?: string; fields: readonly PartField[]; empty: Record<string, unknown> };

const pair = [
  { kind: "text", key: "label", label: "Label", max: 40 },
  { kind: "text", key: "value", label: "Value", max: 160 },
] as const satisfies readonly PartField[];

const productSlug = { kind: "text", key: "productSlug", label: "Product address", hint: "Optional: the product's address, e.g. polo-shirt. Its price is shown.", max: 80, nullable: true } as const;

export const PARTS: Record<ContentType, readonly PartField[]> = {
  PROJECT: [
    { kind: "text", key: "headline", label: "Page heading", hint: "The big heading on the page. The title names the project on cards.", max: 140 },
    { kind: "textarea", key: "intro", label: "Intro", max: 400 },
    { kind: "text", key: "productHints", label: "Product hints", hint: "Shown on the directory card, e.g. Polos · shirts · aprons", max: 120 },
    { kind: "text", key: "ctaLabel", label: "Start button label", hint: "e.g. Start an event project", max: 60 },
    { kind: "text", key: "kitTitle", label: "Kit heading", max: 120 },
    { kind: "textarea", key: "kitNote", label: "Kit note", max: 400 },
    {
      kind: "list",
      key: "kit",
      label: "Example kit",
      item: "Kit item",
      max: 12,
      fields: [
        {
          kind: "select",
          key: "group",
          label: "Group",
          options: [
            { value: "RECOMMENDED", label: "Recommended" },
            { value: "USEFUL", label: "Also useful" },
          ],
        },
        { kind: "text", key: "label", label: "Item", max: 80 },
        { kind: "number", key: "quantity", label: "Typical quantity", min: 1, max: 100_000 },
        productSlug,
      ],
    },
    { kind: "text", key: "timelineTitle", label: "Timeline heading", max: 120 },
    {
      kind: "list",
      key: "timeline",
      label: "Timeline",
      item: "Step",
      max: 8,
      fields: [
        { kind: "text", key: "when", label: "When", max: 30 },
        { kind: "text", key: "what", label: "What happens", max: 80 },
      ],
    },
    { kind: "textarea", key: "timelineNote", label: "Timeline note", max: 300 },
    { kind: "text", key: "caseStudySlug", label: "Case study address", hint: "Optional: a case study showing this kind of project.", max: 80, nullable: true },
  ],
  CASE_STUDY: [
    { kind: "text", key: "headline", label: "Page heading", max: 140 },
    { kind: "text", key: "sector", label: "Sector", max: 40 },
    { kind: "strings", key: "capabilities", label: "Capabilities", item: "Capability", max: 6, length: 40 },
    { kind: "text", key: "location", label: "Location", max: 60 },
    {
      kind: "list",
      key: "made",
      label: "What we made",
      item: "Item",
      max: 8,
      fields: [{ kind: "text", key: "label", label: "Item", max: 80 }, { kind: "text", key: "detail", label: "Detail", max: 80 }, productSlug],
    },
    { kind: "list", key: "facts", label: "Project facts", item: "Fact", max: 10, fields: pair },
    { kind: "textarea", key: "factsNote", label: "Facts note", max: 300 },
    { kind: "text", key: "projectSlug", label: "Similar project address", hint: "Optional: the project page “Start a similar project” leads to.", max: 80, nullable: true },
  ],
  GUIDE: [
    { kind: "select", key: "topic", label: "Topic", options: Object.entries(GUIDE_TOPIC_LABEL).map(([value, label]) => ({ value, label })) },
    { kind: "text", key: "readingNote", label: "Reading note", hint: "e.g. 6 min read", max: 120 },
    {
      kind: "optional",
      key: "comparison",
      label: "Comparison",
      hint: "Place it in the text with the comparison tool.",
      empty: { columns: [{ title: "", icon: "sparkles", rows: [] }, { title: "", icon: "printer", rows: [] }] },
      fields: [
        {
          kind: "list",
          key: "columns",
          label: "Options compared",
          item: "Option",
          min: 2,
          max: 3,
          fields: [
            { kind: "text", key: "title", label: "Option", max: 40 },
            {
              kind: "select",
              key: "icon",
              label: "Icon",
              options: [
                { value: "sparkles", label: "Sparkles" },
                { value: "printer", label: "Printer" },
                { value: "shirt", label: "Shirt" },
                { value: "file-text", label: "Document" },
                { value: "package", label: "Package" },
                { value: "presentation", label: "Display" },
              ],
            },
            { kind: "list", key: "rows", label: "Rows", item: "Row", max: 8, fields: pair },
          ],
        },
      ],
    },
    {
      kind: "optional",
      key: "decision",
      label: "Decision aid",
      hint: "Place it in the text with the decision aid tool.",
      empty: { items: [{ question: "", answer: "" }], note: "" },
      fields: [
        {
          kind: "list",
          key: "items",
          label: "Questions",
          item: "Question",
          min: 1,
          max: 8,
          fields: [
            { kind: "text", key: "question", label: "Question", max: 160 },
            { kind: "text", key: "answer", label: "Answer", max: 160 },
          ],
        },
        { kind: "textarea", key: "note", label: "Note", max: 300 },
      ],
    },
  ],
  ABOUT: [
    { kind: "text", key: "headline", label: "Page heading", max: 140 },
    { kind: "text", key: "capabilitiesTitle", label: "Capabilities heading", max: 80 },
    { kind: "textarea", key: "capabilitiesIntro", label: "Capabilities intro", max: 300 },
    {
      kind: "list",
      key: "capabilities",
      label: "Capabilities",
      item: "Capability",
      max: 8,
      fields: [
        { kind: "text", key: "name", label: "Name", max: 40 },
        { kind: "text", key: "detail", label: "Detail", max: 80 },
        { kind: "checkbox", key: "own", label: "Done in our own workshop" },
      ],
    },
    { kind: "text", key: "stepsTitle", label: "Steps heading", max: 80 },
    {
      kind: "list",
      key: "steps",
      label: "Steps",
      item: "Step",
      max: 6,
      fields: [
        { kind: "text", key: "title", label: "Step", max: 40 },
        { kind: "text", key: "detail", label: "Detail", max: 120 },
      ],
    },
    { kind: "text", key: "teamTitle", label: "Team heading", max: 60 },
    { kind: "textarea", key: "teamBody", label: "Team text", max: 300 },
    { kind: "text", key: "reachTitle", label: "Reach heading", max: 60 },
    { kind: "textarea", key: "reachBody", label: "Reach text", max: 300 },
    { kind: "text", key: "valuesTitle", label: "Values heading", max: 60 },
    { kind: "strings", key: "values", label: "Values", item: "Value", max: 6, length: 120 },
    { kind: "text", key: "ctaTitle", label: "Closing heading", max: 80 },
  ],
};

/** A blank item for a list, from its fields. */
export function blank(fields: readonly PartField[]): Record<string, unknown> {
  return Object.fromEntries(
    fields.map((field) => {
      switch (field.kind) {
        case "number":
          return [field.key, field.min];
        case "checkbox":
          return [field.key, false];
        case "select":
          return [field.key, field.options[0]?.value ?? ""];
        case "strings":
        case "list":
          return [field.key, field.kind === "list" && field.min ? Array.from({ length: field.min }, () => blank(field.fields)) : []];
        case "optional":
          return [field.key, null];
        case "text":
          return [field.key, field.nullable ? null : ""];
        default:
          return [field.key, ""];
      }
    }),
  );
}
