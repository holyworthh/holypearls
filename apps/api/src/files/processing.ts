import { type Database, eq, schema } from "@holypearls/db";
import type { StorageAdapter } from "@holypearls/storage";
import { previewImage, previewPdf, type Rendition } from "./preview.js";

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
    const result = row.detectedType === "application/pdf" ? await previewPdf(source, PAGES_FOR(row.purpose)) : await previewImage(source);
    renditions = result.renditions;
    metadata = result.metadata;
  } catch {
    await deps.db
      .update(schema.files)
      .set({
        status: "NEEDS_REVIEW",
        reason:
          row.detectedType === "application/pdf"
            ? "We couldn't open this PDF to make a preview. Our team will check it, or you can upload it again."
            : "We couldn't read this image. Our team will check it, or you can upload it again.",
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
