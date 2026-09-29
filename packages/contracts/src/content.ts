import { z } from "zod";
import { publicImageSchema, publicProductCardSchema } from "./storefront.js";

/*
 * Content pages (T02-06, PUB-FR-011–013): project / solution pages, guides,
 * case studies and About. Staff write them in the content editor (Pen 106 ·
 * X3mMi); the public site shows only what was last published.
 */

export const contentTypeSchema = z.enum(["PROJECT", "GUIDE", "CASE_STUDY", "ABOUT"]);
export type ContentType = z.infer<typeof contentTypeSchema>;
export const contentStatusSchema = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]);
export type ContentStatus = z.infer<typeof contentStatusSchema>;

/** Where each type lives on the site (Stage 3 §43). */
export const CONTENT_PATH: Record<ContentType, string> = {
  PROJECT: "/projects",
  GUIDE: "/resources",
  CASE_STUDY: "/our-work",
  ABOUT: "/about",
};

export const contentHref = (type: ContentType, slug: string) => (type === "ABOUT" ? "/about" : `${CONTENT_PATH[type]}/${slug}`);

export const CONTENT_TYPE_LABEL: Record<ContentType, string> = {
  PROJECT: "Project page",
  GUIDE: "Guide",
  CASE_STUDY: "Case study",
  ABOUT: "About",
};

/** Guide topics (Pen 56 · IkI3Y). */
export const guideTopicSchema = z.enum(["APPAREL", "EMBROIDERY", "PRINT", "LARGE_FORMAT", "PACKAGING", "ORDERING"]);
export type GuideTopic = z.infer<typeof guideTopicSchema>;
export const GUIDE_TOPIC_LABEL: Record<GuideTopic, string> = {
  APPAREL: "Apparel",
  EMBROIDERY: "Embroidery",
  PRINT: "Print",
  LARGE_FORMAT: "Large format",
  PACKAGING: "Packaging",
  ORDERING: "Ordering and artwork",
};

const slug = z
  .string()
  .trim()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lower-case letters, numbers and hyphens")
  .max(80, "Use 80 characters or fewer");
const line = (max: number) => z.string().trim().max(max, `Use ${max} characters or fewer`);
const pair = z.object({ label: line(40), value: line(160) }).strict();

/** Project / solution page (Pen 12 · xiB3h card, 12B · SZbrl page). */
export const projectDataSchema = z
  .object({
    /** The page's big heading, e.g. "Everything for your event, in one quote"; the title names the project. */
    headline: line(140).default(""),
    /** The line under the heading. */
    intro: line(400).default(""),
    /** Small product hints on the directory card, e.g. "Polos · shirts · aprons". */
    productHints: line(120).default(""),
    /** Start button label on the page, e.g. "Start an event project". */
    ctaLabel: line(60).default(""),
    kitTitle: line(120).default(""),
    kitNote: line(400).default(""),
    /** An example kit: suggested products and typical quantities (Stage 3 §27). */
    kit: z
      .array(
        z
          .object({
            group: z.enum(["RECOMMENDED", "USEFUL"]),
            /** The product it stands for, when there is one; its price is shown. */
            productSlug: slug.nullable().default(null),
            label: line(80),
            quantity: z.number().int().min(1).max(100_000),
          })
          .strict(),
      )
      .max(12)
      .default([]),
    timelineTitle: line(120).default(""),
    timeline: z.array(z.object({ when: line(30), what: line(80) }).strict()).max(8).default([]),
    timelineNote: line(300).default(""),
    /** A case study showing this kind of project. */
    caseStudySlug: slug.nullable().default(null),
  })
  .strict();
export type ProjectData = z.infer<typeof projectDataSchema>;

/** Case study (Pen 54 · j9dFP card, 55 · nnXfJ page). Facts only; never invented clients or results (PUB-FR-012). */
export const caseStudyDataSchema = z
  .object({
    /** The page's big heading; the title is used on cards. */
    headline: line(140).default(""),
    sector: line(40).default(""),
    capabilities: z.array(line(40)).max(6).default([]),
    location: line(60).default(""),
    made: z.array(z.object({ label: line(80), detail: line(80), productSlug: slug.nullable().default(null) }).strict()).max(8).default([]),
    gallery: z.array(z.object({ fileId: z.uuid(), alt: line(200) }).strict()).max(6).default([]),
    facts: z.array(pair).max(10).default([]),
    factsNote: line(300).default(""),
    /** The project page "Start a similar project" leads to. */
    projectSlug: slug.nullable().default(null),
  })
  .strict();
export type CaseStudyData = z.infer<typeof caseStudyDataSchema>;

/** Guide (Pen 56 · IkI3Y, 57 · nbOI4, 58 · C43mU9). */
export const guideDataSchema = z
  .object({
    topic: guideTopicSchema.default("ORDERING"),
    readingNote: line(120).default(""),
    /** "Side by side" diagram, placed in the text where the editor put it. */
    comparison: z
      .object({
        columns: z
          .array(z.object({ title: line(40), icon: z.enum(["sparkles", "printer", "shirt", "file-text", "package", "presentation"]), rows: z.array(pair).max(8) }).strict())
          .min(2)
          .max(3),
      })
      .strict()
      .nullable()
      .default(null),
    /** "Decide in 30 seconds" questions, placed in the text where the editor put it. */
    decision: z
      .object({ items: z.array(z.object({ question: line(160), answer: line(160) }).strict()).min(1).max(8), note: line(300).default("") })
      .strict()
      .nullable()
      .default(null),
  })
  .strict();
export type GuideData = z.infer<typeof guideDataSchema>;

/** About (Pen 59 · LXw1v). */
export const aboutDataSchema = z
  .object({
    headline: line(140).default(""),
    capabilitiesTitle: line(80).default(""),
    capabilitiesIntro: line(300).default(""),
    capabilities: z.array(z.object({ name: line(40), detail: line(80), own: z.boolean() }).strict()).max(8).default([]),
    stepsTitle: line(80).default(""),
    steps: z.array(z.object({ title: line(40), detail: line(120) }).strict()).max(6).default([]),
    teamTitle: line(60).default(""),
    teamBody: line(300).default(""),
    reachTitle: line(60).default(""),
    reachBody: line(300).default(""),
    valuesTitle: line(60).default(""),
    values: z.array(line(120)).max(6).default([]),
    ctaTitle: line(80).default(""),
  })
  .strict();
export type AboutData = z.infer<typeof aboutDataSchema>;

export const CONTENT_DATA_SCHEMA = {
  PROJECT: projectDataSchema,
  GUIDE: guideDataSchema,
  CASE_STUDY: caseStudyDataSchema,
  ABOUT: aboutDataSchema,
} as const;
export type ContentData = ProjectData | GuideData | CaseStudyData | AboutData;

/** The fields staff edit (Pen 106 editor and SEO panel). The body is rich text, cleaned on the server. */
export const contentFieldsSchema = z
  .object({
    title: z.string().trim().min(1, "Give the page a title").max(140, "Use 140 characters or fewer"),
    slug,
    summary: line(300).default(""),
    body: z.string().max(100_000, "The text is too long").default(""),
    heroFileId: z.uuid().nullable().default(null),
    heroAlt: line(200).default(""),
    /** Lead card on the index (projects: double height, work: featured, guides: most read). */
    featured: z.boolean().default(false),
    /** Labelled "Demo" on the site until real, approved content replaces it (PUB-FR-012). */
    demo: z.boolean().default(false),
    position: z.number().int().min(0).max(10_000).default(0),
    seoTitle: line(70).default(""),
    seoDescription: line(170).default(""),
    /** Empty means the page itself (the default). Otherwise a path on this site. */
    canonicalPath: z
      .string()
      .trim()
      .max(200)
      .regex(/^(|\/[a-z0-9\-/]*)$/, "Use a path on this site, like /resources/embroidery-vs-print")
      .default(""),
    indexable: z.boolean().default(true),
    linkedProductIds: z.array(z.uuid()).max(12, "Link up to 12 products").default([]),
    linkedPageIds: z.array(z.uuid()).max(12, "Link up to 12 pages").default([]),
    data: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
export type ContentFields = z.infer<typeof contentFieldsSchema>;

export const createContentPageSchema = z.object({ type: contentTypeSchema, title: contentFieldsSchema.shape.title, slug }).strict();
export const updateContentPageSchema = contentFieldsSchema.extend({ version: z.number().int().positive() }).strict();
export const publishContentPageSchema = z.object({ version: z.number().int().positive() }).strict();
export const changeContentStatusSchema = z.object({ to: z.enum(["DRAFT", "ARCHIVED"]), version: z.number().int().positive() }).strict();

const linkedPage = z.object({ id: z.string(), type: contentTypeSchema, title: z.string(), slug: z.string(), status: contentStatusSchema });
const linkedProduct = z.object({ id: z.string(), name: z.string(), slug: z.string(), status: z.string() });

export const adminContentSummarySchema = z.object({
  id: z.string(),
  type: contentTypeSchema,
  slug: z.string(),
  title: z.string(),
  status: contentStatusSchema,
  demo: z.boolean(),
  /** Saved edits not yet published. */
  unpublishedChanges: z.boolean(),
  updatedAt: z.string(),
  updatedBy: z.string().nullable(),
  publishedAt: z.string().nullable(),
});
export type AdminContentSummary = z.infer<typeof adminContentSummarySchema>;
export const adminContentListSchema = z.object({ entries: z.array(adminContentSummarySchema) });
export const adminContentQuerySchema = z.object({ type: contentTypeSchema.optional() }).strict();

export const adminContentPageSchema = adminContentSummarySchema.extend({
  fields: contentFieldsSchema,
  version: z.number().int(),
  heroImage: publicImageSchema.nullable(),
  linkedProducts: z.array(linkedProduct),
  linkedPages: z.array(linkedPage),
  /** Set when the last save removed unsafe markup from the text (Pen 106 state "Sanitized on save"). */
  sanitized: z.object({ scripts: z.number().int(), handlers: z.number().int(), other: z.number().int() }).nullable(),
});
export type AdminContentPage = z.infer<typeof adminContentPageSchema>;

/** A card linking to a content page (indexes, related items, search). */
export const contentCardSchema = z.object({
  type: contentTypeSchema,
  slug: z.string(),
  href: z.string(),
  title: z.string(),
  summary: z.string(),
  image: publicImageSchema.nullable(),
  featured: z.boolean(),
  demo: z.boolean(),
  /** Guide topic, case study sector, or project product hints. */
  label: z.string(),
  data: z.record(z.string(), z.unknown()),
});
export type ContentCard = z.infer<typeof contentCardSchema>;
export const contentIndexSchema = z.object({ entries: z.array(contentCardSchema) });
export const contentIndexQuerySchema = z.object({ type: z.enum(["PROJECT", "GUIDE", "CASE_STUDY"]) }).strict();

/** One published page as the public site renders it. */
export const publicContentPageSchema = z.object({
  type: contentTypeSchema,
  slug: z.string(),
  href: z.string(),
  title: z.string(),
  summary: z.string(),
  /** Clean HTML: only the tags and attributes the editor allows. */
  body: z.string(),
  hero: publicImageSchema.nullable(),
  demo: z.boolean(),
  seo: z.object({ title: z.string(), description: z.string(), canonicalPath: z.string(), indexable: z.boolean() }),
  data: z.record(z.string(), z.unknown()),
  /** Products named in the page (kit, "what we made") and linked products, by slug. */
  products: z.array(publicProductCardSchema),
  linkedPages: z.array(contentCardSchema),
  images: z.record(z.string(), publicImageSchema),
  publishedAt: z.string(),
  updatedAt: z.string(),
});
export type PublicContentPage = z.infer<typeof publicContentPageSchema>;
