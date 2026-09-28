import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

/** TECH-04 §5: 2,000 px previews and 400 px thumbnails, metadata stripped. */
export const PREVIEW_EDGE = 2000;
export const THUMBNAIL_EDGE = 400;
const PDF_LIMIT_MS = 60_000;
const PDF_HEAP_MB = 1024;

export interface Rendition {
  kind: "PREVIEW" | "THUMBNAIL" | "PAGE";
  page: number;
  body: Buffer;
  contentType: string;
  width: number;
  height: number;
}

export interface ImagePreview {
  renditions: Rendition[];
  metadata: { width: number; height: number };
}

/** Resized copies with no EXIF, GPS or other metadata (sharp drops it unless asked to keep it). */
export async function previewImage(source: Buffer): Promise<ImagePreview> {
  const image = sharp(source, { failOn: "error", limitInputPixels: 268_402_689 }).rotate();
  const info = await image.metadata();
  const make = async (kind: "PREVIEW" | "THUMBNAIL", edge: number) => {
    const { data, info: out } = await sharp(source, { failOn: "error" })
      .rotate()
      .resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    return { kind, page: 1, body: data, contentType: "image/webp", width: out.width, height: out.height } satisfies Rendition;
  };
  return {
    renditions: [await make("PREVIEW", PREVIEW_EDGE), await make("THUMBNAIL", THUMBNAIL_EDGE)],
    metadata: { width: info.width ?? 0, height: info.height ?? 0 },
  };
}

interface ChildResult {
  ok: boolean;
  error?: string;
  total?: number;
  pages?: { page: number; png: string; width: number; height: number }[];
}

/** Renders PDF pages in an isolated child process with a time and memory limit. */
export function renderPdf(source: Buffer, options: { pages: number; width?: number }): Promise<{ total: number; pages: Rendition[] }> {
  const script = new URL("./pdf-child.js", import.meta.url);
  const runningTs = import.meta.url.endsWith(".ts");
  const child = fork(fileURLToPath(runningTs ? new URL("./pdf-child.ts", import.meta.url) : script), [], {
    execArgv: [`--max-old-space-size=${PDF_HEAP_MB}`, ...(runningTs ? ["--import", "tsx"] : [])],
    stdio: ["ignore", "ignore", "ignore", "ipc"],
    env: {},
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("PDF rendering took too long"));
    }, PDF_LIMIT_MS);
    child.once("message", (message: ChildResult) => {
      clearTimeout(timer);
      if (!message.ok) return reject(new Error(message.error ?? "PDF could not be rendered"));
      resolve({
        total: message.total ?? 0,
        pages: (message.pages ?? []).map((page) => ({
          kind: "PAGE" as const,
          page: page.page,
          body: Buffer.from(page.png, "base64"),
          contentType: "image/png",
          width: page.width,
          height: page.height,
        })),
      });
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`PDF renderer stopped (${code ?? "killed"})`));
    });
    child.send({ pdf: source.toString("base64"), pages: options.pages, width: options.width ?? PREVIEW_EDGE / 2 });
  });
}

/** PDF previews: the first page (every page up to 20 for proofs), plus a thumbnail of page 1. */
export async function previewPdf(source: Buffer, pages: number): Promise<{ renditions: Rendition[]; metadata: { pages: number } }> {
  const rendered = await renderPdf(source, { pages });
  const first = rendered.pages[0];
  if (!first) throw new Error("PDF has no pages");
  const thumb = await sharp(first.body)
    .resize({ width: THUMBNAIL_EDGE, height: THUMBNAIL_EDGE, fit: "inside" })
    .webp({ quality: 80 })
    .toBuffer({ resolveWithObject: true });
  return {
    renditions: [
      ...rendered.pages,
      { kind: "THUMBNAIL", page: 1, body: thumb.data, contentType: "image/webp", width: thumb.info.width, height: thumb.info.height },
    ],
    metadata: { pages: rendered.total },
  };
}
