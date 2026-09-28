import { type Database, eq, schema } from "@holypearls/db";
import type { StorageAdapter } from "@holypearls/storage";
import { previewImage, previewPdf, previewSvg, type Rendition } from "./preview.js";

const NO_PREVIEW: Record<string, string> = {
  "application/pdf": "We couldn't open this PDF to make a preview. Our team will check it, or you can upload it again.",
  "application/illustrator":
    "We can't show a preview of this Illustrator file. In Illustrator, save it again with \"Create PDF Compatible File\" ticked, or export a PDF. Our team can still open it.",
  "image/svg+xml": "We couldn't draw this SVG. Our team will check it, or you can export a PDF and upload that.",
};

/** Proofs get every page up to 20; everything else gets the first page (TECH-04 §5). */
const PAGES_FOR = (purpose: string) => (purpose === "PROOF" ? 20 : 1);

/**
 * file.preview (worker only; loads sharp and the PDF renderer). Makes the
 * previews, then READY. A file that can't be previewed becomes NEEDS_REVIEW
 * with a reason, never an error loop. Safe to run twice.
 */
export async function previewFile(
  deps: { db: Database; storage: StorageAdapter; publicStorage: StorageAdapter },
  fileId: string,
): Promise<void> {
  const [row] = await deps.db.select().from(schema.files).where(eq(schema.files.id, fileId));
  if (!row || row.status !== "PROCESSING" || !row.detectedType) return;
  const store = row.bucket === "public" ? deps.publicStorage : deps.storage;

  if (row.detectedType === "text/csv") {
    await deps.db.update(schema.files).set({ status: "READY" }).where(eq(schema.files.id, fileId));
    return;
  }

  let renditions: Rendition[];
  let metadata: Record<string, number>;
  try {
    const source = await store.read(row.storageKey);
    const type = row.detectedType;
    const result =
      type === "application/pdf" || type === "application/illustrator"
        ? await previewPdf(source, PAGES_FOR(row.purpose))
        : type === "image/svg+xml"
          ? await previewSvg(source)
          : await previewImage(source);
    renditions = result.renditions;
    metadata = result.metadata;
  } catch {
    await deps.db
      .update(schema.files)
      .set({
        status: "NEEDS_REVIEW",
        reason: NO_PREVIEW[row.detectedType] ?? "We couldn't read this image. Our team will check it, or you can upload it again.",
      })
      .where(eq(schema.files.id, fileId));
    return;
  }

  for (const rendition of renditions) {
    const key = `files/preview/${fileId}/${rendition.kind.toLowerCase()}-${rendition.page}.${rendition.contentType === "image/png" ? "png" : "webp"}`;
    await store.write(key, rendition.body, rendition.contentType);
    await deps.db
      .insert(schema.fileRenditions)
      .values({ fileId, kind: rendition.kind, page: rendition.page, storageKey: key, contentType: rendition.contentType, width: rendition.width, height: rendition.height })
      .onConflictDoNothing();
  }
  await deps.db.update(schema.files).set({ status: "READY", metadata, reason: null }).where(eq(schema.files.id, fileId));
}
