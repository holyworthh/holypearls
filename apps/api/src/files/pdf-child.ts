/**
 * Renders PDF pages to PNG in a separate process, so a broken or hostile PDF
 * can't take the worker down (TECH-04 §5). The parent gives it 60 seconds and
 * a 1 GB heap; it reads the PDF from IPC and never opens a network connection.
 */
import * as mupdf from "mupdf";

interface RenderRequest {
  pdf: string;
  pages: number;
  width: number;
}

process.once("message", (message: RenderRequest) => {
  try {
    const document = mupdf.Document.openDocument(Buffer.from(message.pdf, "base64"), "application/pdf");
    const total = document.countPages();
    const pages: { page: number; png: string; width: number; height: number }[] = [];
    for (let index = 0; index < Math.min(total, message.pages); index += 1) {
      const page = document.loadPage(index);
      const [x0, , x1] = page.getBounds();
      const scale = message.width / Math.max(1, x1 - x0);
      const pixmap = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true);
      pages.push({ page: index + 1, png: Buffer.from(pixmap.asPNG()).toString("base64"), width: pixmap.getWidth(), height: pixmap.getHeight() });
    }
    process.send?.({ ok: true, total, pages }, () => process.exit(0));
  } catch (error) {
    process.send?.({ ok: false, error: error instanceof Error ? error.message : "render failed" }, () => process.exit(0));
  }
});
