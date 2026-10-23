/*
 * The canonical and structured-data check (T14-01; PUB-SEO-001–009; Stage 3
 * §48, §53). Used by e2e/seo.spec.ts over every page in the sitemap, and by
 * `check-seo.ts` against staging or production. It checks what Google's
 * Rich Results validator requires for each type we publish, so a template
 * that drops a required field, publishes an unknown type, or adds an Offer
 * to a quoted product fails here.
 */

type Node = Record<string, unknown>;

const has = (node: Node, key: string) => node[key] !== undefined && node[key] !== null && node[key] !== "";
const isUrl = (value: unknown) => typeof value === "string" && /^https?:\/\//.test(value);

/** Required properties for each type we publish (Google Search Central structured-data docs). */
const RULES: Record<string, (node: Node, at: string) => string[]> = {
  Organization: (node, at) => need(node, at, ["name", "url"]),
  WebSite: (node, at) => need(node, at, ["name", "url"]),
  BreadcrumbList: (node, at) => {
    const items = Array.isArray(node.itemListElement) ? (node.itemListElement as Node[]) : [];
    if (!items.length) return [`${at}: BreadcrumbList needs itemListElement`];
    return items.flatMap((item, index) => [
      ...(item.position !== index + 1 ? [`${at}: breadcrumb ${index + 1} has position ${String(item.position)}`] : []),
      ...need(item, `${at}.itemListElement[${index}]`, ["name"]),
      // The last crumb may omit its URL; every other one needs it.
      ...(index < items.length - 1 && !isUrl(item.item) ? [`${at}: breadcrumb ${index + 1} needs an absolute item URL`] : []),
    ]);
  },
  Product: (node, at) => [...need(node, at, ["name"]), ...offers(node, at)],
  ProductGroup: (node, at) => {
    const variants = Array.isArray(node.hasVariant) ? (node.hasVariant as Node[]) : [];
    return [
      ...need(node, at, ["name", "productGroupID"]),
      ...(Array.isArray(node.variesBy) && (node.variesBy as unknown[]).every((value) => typeof value === "string" && value.startsWith("https://schema.org/")) ? [] : [`${at}: variesBy must list schema.org properties`]),
      ...(variants.length ? [] : [`${at}: ProductGroup needs hasVariant`]),
      ...offers(node, at),
      ...variants.flatMap((variant, index) => [...need(variant, `${at}.hasVariant[${index}]`, ["name"]), ...(variant["@type"] === "Product" ? [] : [`${at}.hasVariant[${index}] must be a Product`])]),
    ];
  },
  CollectionPage: (node, at) => {
    const list = node.mainEntity as Node | undefined;
    const items = Array.isArray(list?.itemListElement) ? (list!.itemListElement as Node[]) : [];
    return [...need(node, at, ["name", "url"]), ...items.flatMap((item, index) => (item.position === index + 1 && isUrl(item.url) ? [] : [`${at}: list item ${index + 1} needs its position and URL`]))];
  },
  Article: (node, at) => need(node, at, ["headline", "datePublished", "author"]),
  Service: (node, at) => need(node, at, ["name", "provider"]),
};

function need(node: Node, at: string, keys: string[]) {
  return keys.filter((key) => !has(node, key)).map((key) => `${at}: ${String(node["@type"])} needs ${key}`);
}

/** An Offer states a real price: amount, currency and availability (PUB-SEO-003). */
function offers(node: Node, at: string) {
  if (!has(node, "offers")) return [];
  const offer = node.offers as Node;
  return [
    ...(offer["@type"] === "Offer" ? [] : [`${at}: offers must be an Offer`]),
    ...(typeof offer.price === "string" && /^\d+(\.\d{2})?$/.test(offer.price) && Number(offer.price) > 0 ? [] : [`${at}: Offer needs a price above zero`]),
    ...(offer.priceCurrency === "NGN" || offer.priceCurrency === "USD" ? [] : [`${at}: Offer needs priceCurrency`]),
    ...(typeof offer.availability === "string" && offer.availability.startsWith("https://schema.org/") ? [] : [`${at}: Offer needs availability`]),
  ];
}

/** Every ld+json block on the page, parsed. A block that isn't valid JSON is an error. */
export function structuredData(html: string): { nodes: Node[]; errors: string[] } {
  const nodes: Node[] = [];
  const errors: string[] = [];
  for (const match of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      const parsed = JSON.parse(match[1]!) as Node | Node[];
      nodes.push(...(Array.isArray(parsed) ? parsed : [parsed]));
    } catch {
      errors.push("a structured-data block isn't valid JSON");
    }
  }
  return { nodes, errors };
}

/** Checks each top-level node: schema.org context, a type we publish, and that type's required fields. */
export function validateStructuredData(nodes: Node[]) {
  return nodes.flatMap((node, index) => {
    const at = `#${index + 1}`;
    if (node["@context"] !== "https://schema.org") return [`${at}: @context must be https://schema.org`];
    const rule = RULES[String(node["@type"])];
    return rule ? rule(node, at) : [`${at}: unexpected type ${String(node["@type"])}`];
  });
}

const same = (a: string, b: string) => {
  try {
    return new URL(a).href === new URL(b).href;
  } catch {
    return false;
  }
};

/** One sitemap page: a self-referencing canonical, indexable, and valid structured data. */
export function checkPage(html: string, url: string) {
  const canonical = html.match(/<link[^>]*rel="canonical"[^>]*href="([^"]+)"/)?.[1] ?? html.match(/<link[^>]*href="([^"]+)"[^>]*rel="canonical"/)?.[1];
  const { nodes, errors } = structuredData(html);
  return {
    types: nodes.map((node) => String(node["@type"])),
    errors: [
      // Compared as URLs: the site root is the same address with or without its trailing slash.
      ...(canonical && same(canonical, url) ? [] : [`canonical is ${canonical ?? "missing"}, expected ${url}`]),
      ...(/<meta[^>]*name="robots"[^>]*content="[^"]*noindex/.test(html) ? ["a sitemap page must not be noindex"] : []),
      ...errors,
      ...validateStructuredData(nodes),
    ],
  };
}

/** The <loc> addresses in a sitemap or sitemap index. */
export const locs = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]!.replace(/&amp;/g, "&"));
