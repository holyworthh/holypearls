import {
  type AdminContentPage,
  type AdminContentSummary,
  CONTENT_DATA_SCHEMA,
  type ContentCard,
  type ContentFields,
  type ContentType,
  contentFieldsSchema,
  contentHref,
  type GuideData,
  GUIDE_TOPIC_LABEL,
  type ProjectData,
  type CaseStudyData,
  type PublicContentPage,
  type PublicImage,
  toFieldErrors,
} from "@holypearls/contracts";
import { and, asc, type Database, desc, eq, inArray, ne, schema, sql, type Transaction } from "@holypearls/db";
import { AppError } from "../errors.js";
import { attachFile } from "../files/files.js";
import type { ActorContext } from "../identity/actor.js";
import { recordAudit } from "../platform/audit.js";
import { cleanRichText, mediaIdsIn, mediaImagesIn, plainText } from "./rich-text.js";
import { cardsByIds, cardsBySlugs, image } from "./storefront.js";

/*
 * Content pages (T02-06, PUB-FR-011–013). Staff edit a working copy; the
 * public site reads only `published`, the copy made when staff last
 * published. CONTENT_MANAGE, audited.
 */

type Row = typeof schema.contentPages.$inferSelect;

const FIELD_KEYS = [
  "title",
  "slug",
  "summary",
  "body",
  "heroFileId",
  "heroAlt",
  "featured",
  "demo",
  "position",
  "seoTitle",
  "seoDescription",
  "canonicalPath",
  "indexable",
  "linkedProductIds",
  "linkedPageIds",
  "data",
] as const satisfies readonly (keyof ContentFields)[];

const fieldsOf = (row: Row): ContentFields => ({
  title: row.title,
  slug: row.slug,
  summary: row.summary,
  body: row.body,
  heroFileId: row.heroFileId,
  heroAlt: row.heroAlt,
  featured: row.featured,
  demo: row.demo,
  position: row.position,
  seoTitle: row.seoTitle,
  seoDescription: row.seoDescription,
  canonicalPath: row.canonicalPath,
  indexable: row.indexable,
  linkedProductIds: row.linkedProductIds,
  linkedPageIds: row.linkedPageIds,
  data: (row.data ?? {}) as Record<string, unknown>,
});

/** Image size recorded when the file was checked. */
const fileWidth = sql<number | null>`(${schema.files.metadata}->>'width')::int`;
const fileHeight = sql<number | null>`(${schema.files.metadata}->>'height')::int`;

/** Key order doesn't count: jsonb stores object keys in its own order. */
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical((value as Record<string, unknown>)[key])]),
        )
      : value;
export const same = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const taken = (error: unknown) => (error as { cause?: { code?: string } }).cause?.code === "23505";

/** A type's parts with defaults filled in, or field errors keyed `data.<path>`. */
export function parseData(type: ContentType, data: unknown): Record<string, unknown> {
  const parsed = CONTENT_DATA_SCHEMA[type].safeParse(data ?? {});
  if (parsed.success) return parsed.data as Record<string, unknown>;
  const fieldErrors = Object.fromEntries(Object.entries(toFieldErrors(parsed.error)).map(([key, message]) => [`data.${key}`, message]));
  throw new AppError("VALIDATION_FAILED", { fieldErrors });
}

async function heroImage(db: Database | Transaction, fileId: string | null, alt: string): Promise<PublicImage | null> {
  if (!fileId) return null;
  const [file] = await db.select({ width: fileWidth, height: fileHeight }).from(schema.files).where(eq(schema.files.id, fileId));
  return file ? image(fileId, alt, file.width, file.height) : null;
}

async function staffName(db: Database, staffId: string | null): Promise<string | null> {
  if (!staffId) return null;
  const [row] = await db.select({ name: schema.staffProfiles.displayName }).from(schema.staffProfiles).where(eq(schema.staffProfiles.id, staffId));
  return row?.name ?? null;
}

const summaryOf = (row: Row, updatedBy: string | null): AdminContentSummary => ({
  id: row.id,
  type: row.type,
  slug: row.slug,
  title: row.title,
  status: row.status,
  demo: row.demo,
  unpublishedChanges: row.status !== "ARCHIVED" && (row.published === null || !same(fieldsOf(row), row.published)),
  updatedAt: row.updatedAt.toISOString(),
  updatedBy,
  publishedAt: row.publishedAt?.toISOString() ?? null,
});

async function loadRow(db: Database | Transaction, id: string): Promise<Row> {
  const [row] = await db.select().from(schema.contentPages).where(eq(schema.contentPages.id, id));
  if (!row) throw new AppError("NOT_FOUND");
  return row;
}

export async function getAdminContentPage(db: Database, id: string): Promise<AdminContentPage> {
  const row = await loadRow(db, id);
  const [linkedProducts, linkedPages] = await Promise.all([
    row.linkedProductIds.length
      ? db
          .select({ id: schema.products.id, name: schema.products.name, slug: schema.products.slug, status: schema.products.status })
          .from(schema.products)
          .where(inArray(schema.products.id, row.linkedProductIds))
      : [],
    row.linkedPageIds.length
      ? db
          .select({ id: schema.contentPages.id, type: schema.contentPages.type, title: schema.contentPages.title, slug: schema.contentPages.slug, status: schema.contentPages.status })
          .from(schema.contentPages)
          .where(inArray(schema.contentPages.id, row.linkedPageIds))
      : [],
  ]);
  const order = <T extends { id: string }>(ids: string[], rows: T[]) => ids.flatMap((id) => rows.filter((item) => item.id === id));
  return {
    ...summaryOf(row, await staffName(db, row.updatedByStaffId)),
    fields: fieldsOf(row),
    version: row.version,
    heroImage: await heroImage(db, row.heroFileId, row.heroAlt),
    linkedProducts: order(row.linkedProductIds, linkedProducts),
    linkedPages: order(row.linkedPageIds, linkedPages),
    sanitized: (row.sanitized as AdminContentPage["sanitized"]) ?? null,
  };
}

export async function listAdminContent(db: Database, type?: ContentType): Promise<AdminContentSummary[]> {
  const rows = await db
    .select({ page: schema.contentPages, updatedBy: schema.staffProfiles.displayName })
    .from(schema.contentPages)
    .leftJoin(schema.staffProfiles, eq(schema.staffProfiles.id, schema.contentPages.updatedByStaffId))
    .where(type ? eq(schema.contentPages.type, type) : undefined)
    .orderBy(asc(sql`case ${schema.contentPages.status} when 'ARCHIVED' then 1 else 0 end`), desc(schema.contentPages.updatedAt));
  return rows.map((row) => summaryOf(row.page, row.updatedBy));
}

const staffId = (actor: ActorContext) => (actor.type === "user" ? (actor.staff?.staffProfileId ?? null) : null);

export async function createContentPage(db: Database, actor: ActorContext, input: { type: ContentType; title: string; slug: string }) {
  try {
    const id = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(schema.contentPages)
        .values({ type: input.type, title: input.title, slug: input.slug, data: parseData(input.type, {}), updatedByStaffId: staffId(actor) })
        .returning({ id: schema.contentPages.id });
      await recordAudit(tx, actor, {
        action: "content.page_created",
        summary: `Content page created: ${input.title}`,
        recordType: "CONTENT_PAGE",
        recordId: row!.id,
        recordLabel: input.title,
        after: { type: input.type, slug: input.slug, status: "DRAFT" },
        permission: "CONTENT_MANAGE",
      });
      return row!.id;
    });
    return getAdminContentPage(db, id);
  } catch (error) {
    if (taken(error)) {
      const message = input.type === "ABOUT" ? "There's already an About page" : "Another page of this type already uses this address";
      throw new AppError("VALIDATION_FAILED", { fieldErrors: { slug: message } });
    }
    throw error;
  }
}

/** Every media-library file a copy of the page uses: hero, body figures and case-study gallery. */
export function contentMediaIds(fields: ContentFields): string[] {
  const gallery = ((fields.data as Partial<CaseStudyData>).gallery ?? []).map((item) => item.fileId);
  return [...new Set([...(fields.heroFileId ? [fields.heroFileId] : []), ...mediaIdsIn(fields.body), ...gallery])];
}

const MEDIA_PURPOSES = ["CONTENT_MEDIA", "PRODUCT_MEDIA"] as const;
type MediaIssue = "missing" | "processing" | null;

/**
 * The one check for a page's images. Saving (`strict` false) only needs each
 * file to be a media-library upload, so staff can keep writing while an image
 * is still being checked. Publishing (`strict` true) needs every image READY,
 * with the rendition the page shows and alt text. Errors are keyed by field.
 */
export async function contentMediaProblems(db: Database | Transaction, fields: ContentFields, strict: boolean): Promise<Record<string, string>> {
  const ids = contentMediaIds(fields);
  if (!ids.length) return {};
  const [files, renditions] = await Promise.all([
    db
      .select({ id: schema.files.id, purpose: schema.files.purpose, status: schema.files.status, contentType: sql<string>`coalesce(${schema.files.detectedType}, ${schema.files.declaredType})` })
      .from(schema.files)
      .where(inArray(schema.files.id, ids)),
    db.select({ fileId: schema.fileRenditions.fileId, kind: schema.fileRenditions.kind }).from(schema.fileRenditions).where(inArray(schema.fileRenditions.fileId, ids)),
  ]);
  const issueOf = (id: string, kind: "preview" | "thumbnail" = "preview"): MediaIssue => {
    const file = files.find((candidate) => candidate.id === id);
    if (!file || !(MEDIA_PURPOSES as readonly string[]).includes(file.purpose)) return "missing";
    if (!strict) return null;
    if (file.status === "PROCESSING" || file.status === "PENDING_UPLOAD") return "processing";
    if (file.status !== "READY" || !file.contentType.startsWith("image/")) return "missing";
    const rendition = kind === "preview" ? "PREVIEW" : "THUMBNAIL";
    if (!renditions.some((candidate) => candidate.fileId === id && candidate.kind === rendition)) return "processing";
    return null;
  };
  const errors: Record<string, string> = {};
  if (fields.heroFileId) {
    const issue = issueOf(fields.heroFileId);
    if (issue === "missing") errors.heroFileId = "This hero image is no longer available. Choose another.";
    else if (issue === "processing") errors.heroFileId = "The hero image is still being checked. Publish once it's ready.";
    else if (!fields.heroAlt.trim()) errors.heroAlt = "Describe the image for people who can't see it";
  }
  const body = mediaImagesIn(fields.body);
  const bodyIssues = body.map((item) => issueOf(item.id, item.kind));
  const missing = bodyIssues.filter((issue) => issue === "missing").length;
  if (missing === 1) errors.body = "One image in the text is no longer available. Remove or replace it.";
  else if (missing > 1) errors.body = `${missing} images in the text are no longer available. Remove or replace them.`;
  else if (bodyIssues.includes("processing")) errors.body = "An image in the text is still being checked. Publish once it's ready.";
  else if (strict && body.some((item) => !item.alt)) errors.body = "Describe every image in the text (alt text).";
  ((fields.data as Partial<CaseStudyData>).gallery ?? []).forEach((item, index) => {
    const issue = issueOf(item.fileId);
    if (issue === "missing") errors[`data.gallery.${index}.fileId`] = "This gallery image is no longer available.";
    else if (issue === "processing") errors[`data.gallery.${index}.fileId`] = "This gallery image is still being checked.";
    else if (strict && !item.alt.trim()) errors[`data.gallery.${index}.alt`] = "Describe the image for people who can't see it";
  });
  return errors;
}

/** Keeps the working copy's uploads attached (so the daily clean-up keeps them). It never makes an image public. */
async function syncMedia(tx: Transaction, pageId: string, fields: ContentFields) {
  const wanted = contentMediaIds(fields);
  const known = wanted.length
    ? await tx
        .select({ id: schema.files.id })
        .from(schema.files)
        .where(and(inArray(schema.files.id, wanted), inArray(schema.files.purpose, [...MEDIA_PURPOSES])))
    : [];
  await tx.delete(schema.contentPageMedia).where(eq(schema.contentPageMedia.pageId, pageId));
  if (known.length) {
    await tx.insert(schema.contentPageMedia).values(known.map((file) => ({ pageId, fileId: file.id })));
    // Attached uploads are kept; the daily clean-up only removes unattached ones.
    for (const file of known) await attachFile(tx, file.id, { type: "CONTENT_PAGE", id: pageId });
  }
}

async function checkLinks(db: Database, id: string, fields: ContentFields) {
  const fieldErrors: Record<string, string> = {};
  if (fields.linkedProductIds.length) {
    const found = await db.select({ id: schema.products.id }).from(schema.products).where(inArray(schema.products.id, fields.linkedProductIds));
    if (found.length !== new Set(fields.linkedProductIds).size) fieldErrors.linkedProductIds = "One of these products doesn't exist";
  }
  if (fields.linkedPageIds.length) {
    if (fields.linkedPageIds.includes(id)) fieldErrors.linkedPageIds = "A page can't link to itself";
    const found = await db.select({ id: schema.contentPages.id }).from(schema.contentPages).where(inArray(schema.contentPages.id, fields.linkedPageIds));
    if (found.length !== new Set(fields.linkedPageIds).size) fieldErrors.linkedPageIds ??= "One of these pages doesn't exist";
  }
  Object.assign(fieldErrors, await contentMediaProblems(db, fields, false));
  if (Object.keys(fieldErrors).length) throw new AppError("VALIDATION_FAILED", { fieldErrors });
}

/** Saves the working copy if nobody else saved first (TECH-02 §5). The text is cleaned first. */
export async function updateContentPage(db: Database, actor: ActorContext, id: string, input: ContentFields & { version: number }) {
  const before = await loadRow(db, id);
  const { version, ...raw } = input;
  const cleaned = cleanRichText(raw.body);
  const fields: ContentFields = contentFieldsSchema.parse({ ...raw, body: cleaned.html, data: parseData(before.type, raw.data) });
  if (before.type === "ABOUT" && fields.slug !== "about") throw new AppError("VALIDATION_FAILED", { fieldErrors: { slug: "The About page's address is /about" } });
  await checkLinks(db, id, fields);
  const changed = FIELD_KEYS.filter((key) => !same(fields[key], fieldsOf(before)[key]));
  try {
    const saved = await db.transaction(async (tx) => {
      const rows = await tx
        .update(schema.contentPages)
        .set({ ...fields, sanitized: cleaned.removed, updatedByStaffId: staffId(actor), version: sql`${schema.contentPages.version} + 1` })
        .where(and(eq(schema.contentPages.id, id), eq(schema.contentPages.version, version)))
        .returning({ id: schema.contentPages.id });
      if (rows.length === 0) return false;
      await syncMedia(tx, id, fields);
      await recordAudit(tx, actor, {
        action: "content.page_updated",
        summary: `Content page edited: ${fields.title}`,
        recordType: "CONTENT_PAGE",
        recordId: id,
        recordLabel: fields.title,
        // The text itself isn't copied into the log; only which fields changed.
        before: { changed },
        after: cleaned.removed ? { changed, removedUnsafe: cleaned.removed } : { changed },
        permission: "CONTENT_MANAGE",
      });
      return true;
    });
    if (!saved) throw new AppError("VERSION_CONFLICT", { context: { latest: await getAdminContentPage(db, id) } });
  } catch (error) {
    if (taken(error)) throw new AppError("VALIDATION_FAILED", { fieldErrors: { slug: "Another page of this type already uses this address" } });
    throw error;
  }
  return getAdminContentPage(db, id);
}

/** What must be true before a page goes live. */
export function publishProblems(row: Row): Record<string, string> {
  const problems: Record<string, string> = {};
  if (!row.summary) problems.summary = "Add a short summary";
  if (row.type === "GUIDE" && !plainText(row.body)) problems.body = "Write the guide's text";
  return problems;
}

export interface PublishedChange {
  type: ContentType;
  slug: string;
  /** The address it was published at before, when publishing moved it. */
  previousSlug: string | null;
}

/** Publishing copies the working copy to what the site shows (Pen 106 "Publish"). */
export async function publishContentPage(db: Database, actor: ActorContext, id: string, version: number): Promise<{ page: AdminContentPage; change: PublishedChange }> {
  const now = new Date();
  let row: Row;
  try {
    // The row is locked while its images are checked and the copy is taken, so
    // a save in between can't put unchecked images on the site.
    row = await db.transaction(async (tx) => {
      const [locked] = await tx.select().from(schema.contentPages).where(eq(schema.contentPages.id, id)).for("update");
      if (!locked) throw new AppError("NOT_FOUND");
      if (locked.version !== version) throw new AppError("VERSION_CONFLICT");
      if (locked.status === "ARCHIVED") throw new AppError("CONFLICT", { message: "Archived pages can't be published.", context: { reason: "ARCHIVED" } });
      const snapshot = fieldsOf(locked);
      const problems = { ...publishProblems(locked), ...(await contentMediaProblems(tx, snapshot, true)) };
      if (Object.keys(problems).length) throw new AppError("RULE_FAILED", { message: "Fix these before publishing.", fieldErrors: problems });
      const rows = await tx
        .update(schema.contentPages)
        .set({
          status: "PUBLISHED",
          published: snapshot,
          // The first publication stays the publication date; every publish moves the modified date.
          publishedAt: locked.publishedAt ?? now,
          lastPublishedAt: now,
          updatedByStaffId: staffId(actor),
          version: sql`${schema.contentPages.version} + 1`,
        })
        .where(and(eq(schema.contentPages.id, id), eq(schema.contentPages.version, version)))
        .returning({ id: schema.contentPages.id });
      if (rows.length === 0) throw new AppError("VERSION_CONFLICT");
      // The public media route may show exactly the images this copy uses.
      await tx.delete(schema.contentPagePublishedMedia).where(eq(schema.contentPagePublishedMedia.pageId, id));
      const media = contentMediaIds(snapshot);
      if (media.length) await tx.insert(schema.contentPagePublishedMedia).values(media.map((fileId) => ({ pageId: id, fileId })));
      await recordAudit(tx, actor, {
        action: "content.page_published",
        summary: `Content page published: ${locked.title}`,
        recordType: "CONTENT_PAGE",
        recordId: id,
        recordLabel: locked.title,
        before: { status: locked.status },
        after: { status: "PUBLISHED", href: contentHref(locked.type, locked.slug) },
        permission: "CONTENT_MANAGE",
      });
      return locked;
    });
  } catch (error) {
    if (error instanceof AppError && error.code === "VERSION_CONFLICT") throw new AppError("VERSION_CONFLICT", { context: { latest: await getAdminContentPage(db, id) } });
    throw error;
  }
  const previous = row.published as ContentFields | null;
  return {
    page: await getAdminContentPage(db, id),
    change: { type: row.type, slug: row.slug, previousSlug: previous && previous.slug !== row.slug ? previous.slug : null },
  };
}

/**
 * Unpublish (PUBLISHED → DRAFT), archive (→ ARCHIVED) or restore (ARCHIVED →
 * DRAFT). Unpublishing and archiving take the page and its images off the site.
 */
export async function changeContentStatus(db: Database, actor: ActorContext, id: string, to: "DRAFT" | "ARCHIVED", version: number) {
  const row = await loadRow(db, id);
  const conflict = async () => new AppError("VERSION_CONFLICT", { context: { latest: await getAdminContentPage(db, id) } });
  if (row.version !== version) throw await conflict();
  if (row.status === to) throw new AppError("CONFLICT", { message: to === "ARCHIVED" ? "This page is already archived." : "This page is already a draft.", context: { reason: to } });
  if (row.type === "ABOUT" && to === "ARCHIVED") throw new AppError("CONFLICT", { message: "The About page can be unpublished but not archived.", context: { reason: "ABOUT" } });
  const action = to === "ARCHIVED" ? "archived" : row.status === "ARCHIVED" ? "restored" : "unpublished";
  const done = await db.transaction(async (tx) => {
    // The version in the write is the real check: a stale request changes nothing.
    const rows = await tx
      .update(schema.contentPages)
      .set({ status: to, updatedByStaffId: staffId(actor), version: sql`${schema.contentPages.version} + 1` })
      .where(and(eq(schema.contentPages.id, id), eq(schema.contentPages.version, version)))
      .returning({ id: schema.contentPages.id });
    if (rows.length === 0) return false;
    await tx.delete(schema.contentPagePublishedMedia).where(eq(schema.contentPagePublishedMedia.pageId, id));
    await recordAudit(tx, actor, {
      action: `content.page_${action}`,
      summary: `Content page ${action}: ${row.title}`,
      recordType: "CONTENT_PAGE",
      recordId: id,
      recordLabel: row.title,
      before: { status: row.status },
      after: { status: to },
      permission: "CONTENT_MANAGE",
    });
    return true;
  });
  if (!done) throw await conflict();
  return { page: await getAdminContentPage(db, id), change: { type: row.type, slug: (row.published as ContentFields | null)?.slug ?? row.slug, previousSlug: null } };
}

/* ---------- Public reads: the published copy of PUBLISHED pages only ---------- */

type Published = { row: Row; live: ContentFields };

async function publishedRows(db: Database, where: ReturnType<typeof and>): Promise<Published[]> {
  const rows = await db
    .select()
    .from(schema.contentPages)
    .where(and(eq(schema.contentPages.status, "PUBLISHED"), where));
  return rows.map((row) => ({ row, live: row.published as ContentFields }));
}

const labelOf = (type: ContentType, data: Record<string, unknown>) => {
  if (type === "GUIDE") return GUIDE_TOPIC_LABEL[(data as GuideData).topic] ?? "";
  if (type === "CASE_STUDY") return [(data as CaseStudyData).sector, ...((data as CaseStudyData).capabilities ?? [])].filter(Boolean).join(" · ");
  if (type === "PROJECT") return (data as ProjectData).productHints ?? "";
  return "";
};

/** Products a page names (project kit, case-study "what we made"), in order. */
const namedProducts = (data: Record<string, unknown>) => [
  ...((data as Partial<ProjectData>).kit ?? []).flatMap((item) => (item.productSlug ? [item.productSlug] : [])),
  ...((data as Partial<CaseStudyData>).made ?? []).flatMap((item) => (item.productSlug ? [item.productSlug] : [])),
];

async function cardsOf(db: Database, pages: Published[]): Promise<ContentCard[]> {
  const heroIds = pages.flatMap(({ live }) => (live.heroFileId ? [live.heroFileId] : []));
  const sizes = heroIds.length
    ? await db.select({ id: schema.files.id, width: fileWidth, height: fileHeight }).from(schema.files).where(inArray(schema.files.id, heroIds))
    : [];
  // Until a page has its own photo, its card shows the first product it names that has one (real product photos only).
  const fallbackSlugs = [...new Set(pages.filter(({ live }) => !live.heroFileId).flatMap(({ live }) => namedProducts(live.data)))];
  const fallbackCards = await cardsBySlugs(db, fallbackSlugs);
  const fallbackImage = (data: Record<string, unknown>) =>
    namedProducts(data)
      .map((slug) => fallbackCards.find((card) => card.slug === slug)?.image ?? null)
      .find(Boolean) ?? null;
  return pages.map(({ row, live }) => {
    const size = sizes.find((file) => file.id === live.heroFileId);
    return {
      type: row.type,
      slug: live.slug,
      href: contentHref(row.type, live.slug),
      title: live.title,
      summary: live.summary,
      image: live.heroFileId && size ? image(live.heroFileId, live.heroAlt, size.width, size.height) : fallbackImage(live.data),
      featured: live.featured,
      demo: live.demo,
      label: labelOf(row.type, live.data),
      data: live.data,
    };
  });
}

const sortCards = (pages: Published[]) =>
  pages.sort((a, b) => Number(b.live.featured) - Number(a.live.featured) || a.live.position - b.live.position || a.live.title.localeCompare(b.live.title));

export async function publicContentIndex(db: Database, type: "PROJECT" | "GUIDE" | "CASE_STUDY"): Promise<ContentCard[]> {
  return cardsOf(db, sortCards(await publishedRows(db, and(eq(schema.contentPages.type, type)))));
}

export async function contentCardsByIds(db: Database, ids: string[]): Promise<ContentCard[]> {
  if (!ids.length) return [];
  const pages = await publishedRows(db, and(inArray(schema.contentPages.id, ids)));
  return cardsOf(db, ids.flatMap((id) => pages.filter((page) => page.row.id === id)));
}

export async function publicContentPage(db: Database, type: ContentType, slug: string): Promise<PublicContentPage> {
  const [page] = await publishedRows(db, and(eq(schema.contentPages.type, type), sql`${schema.contentPages.published}->>'slug' = ${slug}`));
  if (!page) throw new AppError("NOT_FOUND");
  const { row, live } = page;
  const data = live.data;
  const slugs = namedProducts(data);
  const [bySlug, byId, linkedPages, hero] = await Promise.all([
    cardsBySlugs(db, [...new Set(slugs)]),
    cardsByIds(db, live.linkedProductIds),
    contentCardsByIds(db, live.linkedPageIds),
    heroImage(db, live.heroFileId, live.heroAlt),
  ]);
  const products = [...bySlug, ...byId.filter((card) => !bySlug.some((other) => other.slug === card.slug))];
  // Other pages this one names: the case study a project shows, the project a case study leads to.
  const related = [
    ...((data as Partial<ProjectData>).caseStudySlug ? [["CASE_STUDY", (data as ProjectData).caseStudySlug!] as const] : []),
    ...((data as Partial<CaseStudyData>).projectSlug ? [["PROJECT", (data as CaseStudyData).projectSlug!] as const] : []),
  ];
  const named = related.length
    ? await cardsOf(
        db,
        (
          await Promise.all(
            related.map(([relatedType, relatedSlug]) =>
              publishedRows(db, and(eq(schema.contentPages.type, relatedType), sql`${schema.contentPages.published}->>'slug' = ${relatedSlug}`)),
            ),
          )
        ).flat(),
      )
    : [];
  const gallery = (data as Partial<CaseStudyData>).gallery ?? [];
  const galleryFiles = gallery.length
    ? await db
        .select({ id: schema.files.id, width: fileWidth, height: fileHeight })
        .from(schema.files)
        .where(inArray(
          schema.files.id,
          gallery.map((item) => item.fileId),
        ))
    : [];
  const images = Object.fromEntries(
    gallery.flatMap((item) => {
      const file = galleryFiles.find((candidate) => candidate.id === item.fileId);
      return file ? [[item.fileId, image(item.fileId, item.alt, file.width, file.height)!]] : [];
    }),
  );
  return {
    type: row.type,
    slug: live.slug,
    href: contentHref(row.type, live.slug),
    title: live.title,
    summary: live.summary,
    body: live.body,
    hero,
    demo: live.demo,
    seo: { title: live.seoTitle, description: live.seoDescription, canonicalPath: live.canonicalPath, indexable: live.indexable },
    data,
    products,
    linkedPages: [...named, ...linkedPages.filter((card) => !named.some((other) => other.href === card.href))],
    images,
    publishedAt: (row.publishedAt ?? row.updatedAt).toISOString(),
    updatedAt: (row.lastPublishedAt ?? row.publishedAt ?? row.updatedAt).toISOString(),
  };
}

/** Pages for the XML sitemap (PUB-SEO-009): published, indexable, not pointing their canonical elsewhere. */
export async function sitemapContent(db: Database) {
  const pages = await publishedRows(db, and(ne(schema.contentPages.type, "ABOUT")));
  const about = await publishedRows(db, and(eq(schema.contentPages.type, "ABOUT")));
  return [...pages, ...about]
    .filter(({ row, live }) => live.indexable && (!live.canonicalPath || live.canonicalPath === contentHref(row.type, live.slug)))
    .map(({ row, live }) => ({ path: contentHref(row.type, live.slug), updatedAt: (row.lastPublishedAt ?? row.publishedAt ?? row.updatedAt).toISOString() }));
}
