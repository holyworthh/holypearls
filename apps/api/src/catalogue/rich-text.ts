import { Parser } from "htmlparser2";
import sanitizeHtml from "sanitize-html";

/*
 * Rich text for content pages (T02-06). Staff write in the editor (Pen 106);
 * what's saved is cleaned here against an allow-list, so nothing a browser
 * could run ever reaches a public page. The public site renders the saved
 * HTML as is.
 */

/** Images only from the public media route: `/api/v1/media/<file id>/preview`. */
export const MEDIA_SRC = /^\/api\/v1\/media\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/(preview|thumbnail)$/;
/** Guide diagrams the editor places in the text; their content lives in the page's data. */
const BLOCKS = new Set(["comparison", "decision"]);
const SCHEMES = ["http", "https", "mailto", "tel"];
/** Removed as unsafe (reported); other unknown tags are just unwrapped. */
const UNSAFE_TAGS = new Set(["iframe", "object", "embed", "form", "input", "button", "textarea", "select", "style", "link", "meta", "base", "svg", "math", "frame", "frameset", "applet"]);

export interface Removed {
  scripts: number;
  handlers: number;
  other: number;
}

const unsafeUrl = (value: string) => {
  // Control characters and spaces are dropped on purpose: browsers ignore them, so "java\0script:" would still run.
  // eslint-disable-next-line no-control-regex
  const trimmed = value.replace(/[\u0000- ]/g, "").toLowerCase();
  return /^(javascript|vbscript|data):/.test(trimmed);
};

/** Counts what the cleaner will remove, for the editor's "Unsafe content removed" message. */
function countUnsafe(html: string): Removed {
  const removed: Removed = { scripts: 0, handlers: 0, other: 0 };
  const parser = new Parser(
    {
      onopentag(name, attributes) {
        if (name === "script") removed.scripts += 1;
        else if (UNSAFE_TAGS.has(name)) removed.other += 1;
        for (const [attribute, value] of Object.entries(attributes)) {
          if (/^on/i.test(attribute)) removed.handlers += 1;
          else if ((attribute === "href" || attribute === "src") && unsafeUrl(value)) removed.other += 1;
        }
        if (name === "img" && !MEDIA_SRC.test(attributes.src ?? "") && !unsafeUrl(attributes.src ?? "")) removed.other += 1;
      },
    },
    { decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true },
  );
  parser.write(html);
  parser.end();
  return removed;
}

export function cleanRichText(html: string): { html: string; removed: Removed | null } {
  const removed = countUnsafe(html);
  const clean = sanitizeHtml(html, {
    allowedTags: ["h2", "h3", "p", "br", "strong", "em", "ul", "ol", "li", "a", "blockquote", "figure", "img", "figcaption", "table", "caption", "thead", "tbody", "tr", "th", "td", "hr", "div"],
    allowedAttributes: { a: ["href", "rel"], img: ["src", "alt"], th: ["scope"], div: ["data-block"] },
    allowedSchemes: SCHEMES,
    allowedSchemesAppliedToAttributes: ["href"],
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    nonTextTags: ["script", "style", "textarea", "option", "noscript", "iframe", "object", "embed", "svg", "math"],
    transformTags: {
      h1: "h2",
      h4: "h3",
      h5: "h3",
      h6: "h3",
      b: "strong",
      i: "em",
      a: (tagName, attributes) => {
        const href = attributes.href ?? "";
        // Links off the site open without passing on who sent them.
        const external = /^https?:\/\//i.test(href);
        const attribs: Record<string, string> = external ? { href, rel: "noopener noreferrer" } : { href };
        return { tagName, attribs };
      },
    },
    exclusiveFilter: (frame) =>
      (frame.tag === "img" && !MEDIA_SRC.test(frame.attribs.src ?? "")) ||
      (frame.tag === "div" && !BLOCKS.has(frame.attribs["data-block"] ?? "")) ||
      (frame.tag === "a" && !frame.attribs.href),
  });
  const total = removed.scripts + removed.handlers + removed.other;
  return { html: clean.trim(), removed: total ? removed : null };
}

/** Plain text of cleaned HTML, for the search index and descriptions. */
export function plainText(html: string): string {
  return sanitizeHtml(html.replace(/<\/(p|h2|h3|li|figcaption|td|th|blockquote)>/g, " "), { allowedTags: [], allowedAttributes: {} })
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** File IDs of the media-library images a body uses. */
export function mediaIdsIn(html: string): string[] {
  const ids = new Set<string>();
  for (const match of html.matchAll(/<img[^>]*src="([^"]+)"/g)) {
    const id = MEDIA_SRC.exec(match[1]!)?.[1];
    if (id) ids.add(id);
  }
  return [...ids];
}
