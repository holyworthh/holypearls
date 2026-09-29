/*
 * Helpers for content-page text (T02-06). The HTML was cleaned by the API on
 * save (tags and attributes on an allow-list), so it's rendered as is; these
 * only add heading anchors and find the guide diagrams' places.
 */

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " };
const decode = (text: string) => text.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, name: string) => ENTITIES[name] ?? "");
const stripTags = (html: string) => decode(html.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();

export const slugify = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "section";

export interface Heading {
  id: string;
  text: string;
}

/** Adds an id to each <h2> (unique per page) and lists them for the contents. */
export function withHeadingIds(html: string): { html: string; headings: Heading[] } {
  const seen = new Map<string, number>();
  const headings: Heading[] = [];
  const out = html.replace(/<h2>([\s\S]*?)<\/h2>/g, (_, inner: string) => {
    const text = stripTags(inner);
    const base = slugify(text);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    const id = count ? `${base}-${count + 1}` : base;
    headings.push({ id, text });
    return `<h2 id="${id}">${inner}</h2>`;
  });
  return { html: out, headings };
}

export type BlockName = "comparison" | "decision";

/** Splits the text where the editor placed a diagram: text, block, text… */
export function splitBlocks(html: string): ({ kind: "html"; html: string } | { kind: "block"; name: BlockName })[] {
  const parts: ({ kind: "html"; html: string } | { kind: "block"; name: BlockName })[] = [];
  let rest = html;
  const pattern = /<div data-block="(comparison|decision)"><\/div>/;
  for (let match = pattern.exec(rest); match; match = pattern.exec(rest)) {
    if (match.index > 0) parts.push({ kind: "html", html: rest.slice(0, match.index) });
    parts.push({ kind: "block", name: match[1] as BlockName });
    rest = rest.slice(match.index + match[0].length);
  }
  if (rest.trim()) parts.push({ kind: "html", html: rest });
  return parts;
}

export const plain = stripTags;
