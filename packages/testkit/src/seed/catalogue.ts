import { eq, schema, type Transaction } from "@holypearls/db";

/*
 * Catalogue TEST DATA (T02-01): the nine canonical categories (Stage 1.2) and
 * one product per product family, taken from the Stage 1.4 seed sheet. Prices
 * and rules arrive with T03-01.
 */

export const SEED_CATEGORIES = [
  ["apparel-garment-production", "Apparel & Garment Production", "Ready-made, manufactured and bespoke garments."],
  ["embroidery-garment-customization", "Embroidery & Garment Customization", "Embroidery, printing and garment decoration."],
  ["print-business-stationery", "Print & Business Stationery", "Commercial and corporate print."],
  ["large-format-signage-displays", "Large Format, Signage & Displays", "Oversized print and physical visibility materials."],
  ["bags-packaging", "Bags & Packaging", "Retail, delivery, merchandise and presentation packaging."],
  ["stickers-labels-product-branding", "Stickers, Labels & Product Branding", "Adhesive products, garment tags and product identification."],
  ["promotional-products-corporate-gifts", "Promotional Products & Corporate Gifts", "Branded merchandise and gifts."],
  ["wall-art-decorative-print", "Wall Art & Decorative Print", "Canvas, framed and decorative applications."],
  ["custom-multi-product-projects", "Custom & Multi-Product Projects", "Jobs spanning several capabilities."],
] as const;

type Mode = "SIMPLE_CONFIGURABLE" | "CONFIGURABLE_QUOTE" | "CONSULTATIVE_PROJECT";

interface SeedProduct {
  sku: string;
  slug: string;
  name: string;
  family: (typeof schema.PRODUCT_FAMILIES)[number];
  buyingMode: Mode;
  category: (typeof SEED_CATEGORIES)[number][0];
  subcategory: [slug: string, name: string];
  summary: string;
  options: [key: string, label: string, values: string[]][];
  /** Swatch colours for colour option values, by value key (product data). */
  swatches?: Record<string, string>;
  specifications?: { label: string; value: string }[];
  faqs?: { question: string; answer: string }[];
  /** Products shown beside this one, in order ("Complete the uniform", Pen 19). */
  related?: string[];
  /** Everyday words people search with (PUB-FR-007); staff add more in admin. */
  phrases?: string[];
  /** Directory filters (Pen 17): how it can be made and decoration methods. */
  routes?: ("SOURCE_CUSTOMIZE" | "MAKE_FROM_SCRATCH" | "CUSTOMER_SUPPLIED")[];
  decorations?: ("EMBROIDERY" | "SCREEN_PRINT" | "HEAT_TRANSFER" | "PAPER_PRINT" | "LARGE_FORMAT_PRINT")[];
}

export const SEED_PRODUCTS: SeedProduct[] = [
  {
    sku: "HP-APP-007",
    slug: "polo-shirt",
    routes: ["SOURCE_CUSTOMIZE", "MAKE_FROM_SCRATCH", "CUSTOMER_SUPPLIED"],
    decorations: ["EMBROIDERY", "SCREEN_PRINT", "HEAT_TRANSFER"],
    phrases: ["staff shirts", "company polos", "embroidered polos", "corporate uniform"],
    name: "Polo Shirt",
    family: "GARMENT",
    buyingMode: "CONFIGURABLE_QUOTE",
    category: "apparel-garment-production",
    subcategory: ["t-shirts-tops", "T-Shirts & Tops"],
    // Copy from Pen 19 (Polo PDP).
    summary: "A reliable polo for your team, with your logo printed or embroidered. Choose a ready-made polo, have it made from scratch, or send us your own.",
    options: [
      ["colour", "Colour", ["Navy", "Black", "White", "Olive", "Wine", "Royal", "Grey", "Gold"]],
      ["fabric", "Fabric", ["Pique cotton", "Performance polyester"]],
    ],
    swatches: { navy: "#1F2A44", black: "#0C0C0E", white: "#F4F4F5", olive: "#6B7A4E", wine: "#8C2F22", royal: "#2F5B8A", grey: "#8A8A93", gold: "#D9B44A" },
    specifications: [
      { label: "Fabric", value: "Fabric is chosen with you and confirmed before production" },
      { label: "Fit", value: "Regular · Relaxed · Slim · Custom" },
      { label: "Sizes", value: "XS–XXL shown · extended sizes on request" },
      { label: "Proof", value: "Final artwork confirmed in your proof before production" },
    ],
    faqs: [
      { question: "Can I mix sizes in one order?", answer: "Yes. Choose how many of each size; the minimum counts across all sizes. If you don't know the sizes yet, you can add them later." },
      { question: "What file should I send?", answer: "Send your logo as a PNG, PDF, SVG or AI file. We turn it into an embroidery or print file and show you a proof before production." },
      { question: "Can I order a sample first?", answer: "Yes. Ask for a sample when you configure your polo; we make one piece before the full order." },
    ],
    related: ["apron", "baseball-cap", "event-badges", "individual-bagging"],
  },
  {
    sku: "HP-CUS-001",
    slug: "heat-transfer-printing",
    routes: ["SOURCE_CUSTOMIZE", "CUSTOMER_SUPPLIED"],
    decorations: ["HEAT_TRANSFER"],
    name: "Heat Transfer Printing",
    family: "APPAREL_PRINT",
    buyingMode: "CONFIGURABLE_QUOTE",
    category: "embroidery-garment-customization",
    subcategory: ["apparel-printing", "Apparel Printing"],
    summary: "Full-colour heat transfer prints on your garments or ours.",
    options: [["placement", "Placement", ["Left chest", "Full front", "Full back"]]],
  },
  {
    sku: "HP-EMB-001",
    slug: "flat-embroidery",
    routes: ["SOURCE_CUSTOMIZE", "CUSTOMER_SUPPLIED"],
    decorations: ["EMBROIDERY"],
    phrases: ["embroidered logo", "embroidery on caps", "embroidered patches", "embroidered name badges"],
    name: "Flat Embroidery",
    family: "EMBROIDERY",
    buyingMode: "CONFIGURABLE_QUOTE",
    category: "embroidery-garment-customization",
    subcategory: ["embroidery", "Embroidery"],
    summary: "Clean, durable embroidered logos on shirts, caps and bags.",
    options: [["placement", "Placement", ["Left chest", "Sleeve", "Cap front"]]],
  },
  {
    sku: "HP-PRN-011",
    slug: "business-cards",
    decorations: ["PAPER_PRINT"],
    phrases: ["complimentary cards", "visiting cards"],
    name: "Business Cards",
    family: "PAPER_PRINT",
    buyingMode: "SIMPLE_CONFIGURABLE",
    category: "print-business-stationery",
    subcategory: ["business-stationery", "Business Stationery"],
    summary: "Premium business cards printed on quality card, delivered fast.",
    options: [
      // How the paper feels first, weight second (COM-FR-041); keys stay the same.
      ["paper", "Paper", ["350gsm-matte|Smooth matte · 350gsm", "350gsm-gloss|Glossy · 350gsm", "400gsm-soft-touch|Soft-touch, thicker · 400gsm"]],
      ["sides", "Printed sides", ["One side", "Both sides"]],
      ["finish", "Finish", ["None", "Foil", "Spot UV"]],
    ],
  },
  {
    sku: "HP-LF-005",
    slug: "roll-up-banner",
    decorations: ["LARGE_FORMAT_PRINT"],
    phrases: ["banner", "event banner"],
    name: "Roll-Up Banner",
    family: "LARGE_FORMAT",
    buyingMode: "SIMPLE_CONFIGURABLE",
    category: "large-format-signage-displays",
    subcategory: ["roll-ups", "Roll-Ups"],
    summary: "Portable roll-up banners with stand and carry bag.",
    options: [["size", "Size", ["85 × 200 cm", "100 × 200 cm", "120 × 200 cm"]]],
  },
  {
    sku: "HP-PKG-001",
    slug: "small-paper-bag",
    decorations: ["PAPER_PRINT"],
    name: "Small Paper Bag",
    family: "PACKAGING",
    buyingMode: "CONFIGURABLE_QUOTE",
    category: "bags-packaging",
    subcategory: ["paper-presentation-packaging", "Paper & Presentation Packaging"],
    summary: "Branded paper bags for retail and gifting.",
    options: [["handle", "Handle", ["Twisted paper", "Flat paper", "Ribbon"]]],
  },
  {
    sku: "HP-LBL-001",
    slug: "label-sticker",
    decorations: ["PAPER_PRINT"],
    name: "Label Sticker",
    family: "STICKER_LABEL",
    buyingMode: "SIMPLE_CONFIGURABLE",
    category: "stickers-labels-product-branding",
    subcategory: ["stickers", "Stickers"],
    summary: "Product labels and stickers cut to shape.",
    options: [["finish", "Finish", ["Gloss", "Matte"]]],
  },
  {
    sku: "HP-PRO-001",
    slug: "standard-mug",
    phrases: ["souvenir mugs", "branded mugs"],
    name: "Standard Mug",
    family: "PROMOTIONAL_ITEM",
    buyingMode: "SIMPLE_CONFIGURABLE",
    category: "promotional-products-corporate-gifts",
    subcategory: ["drinkware", "Drinkware"],
    summary: "Branded ceramic mugs for gifts and merchandise.",
    options: [["colour", "Colour", ["White", "Black"]]],
  },
  {
    sku: "HP-WAL-001",
    slug: "landscape-canvas",
    decorations: ["LARGE_FORMAT_PRINT"],
    name: "Landscape Canvas",
    family: "WALL_ART",
    buyingMode: "SIMPLE_CONFIGURABLE",
    category: "wall-art-decorative-print",
    subcategory: ["canvas", "Canvas"],
    summary: "Gallery-wrapped canvas prints for homes and offices.",
    options: [["size", "Size", ["40 × 30 cm", "60 × 40 cm", "90 × 60 cm"]]],
  },
  {
    sku: "HP-PRJ-001",
    slug: "team-staff-branding",
    decorations: ["EMBROIDERY", "SCREEN_PRINT", "HEAT_TRANSFER"],
    name: "Team & Staff Branding",
    family: "CUSTOM_PROJECT",
    buyingMode: "CONSULTATIVE_PROJECT",
    category: "custom-multi-product-projects",
    subcategory: ["solutions", "Solutions"],
    summary: "Uniforms, IDs and branded items for a whole team, planned with HolyPearls.",
    options: [],
  },
  // The polo's "Complete the uniform" set (Pen 19).
  {
    sku: "HP-APP-050",
    slug: "apron",
    routes: ["SOURCE_CUSTOMIZE", "MAKE_FROM_SCRATCH"],
    decorations: ["EMBROIDERY", "SCREEN_PRINT", "HEAT_TRANSFER"],
    name: "Apron",
    family: "GARMENT",
    buyingMode: "CONFIGURABLE_QUOTE",
    category: "apparel-garment-production",
    subcategory: ["workwear", "Workwear"],
    summary: "Print or embroidery",
    options: [["colour", "Colour", ["Charcoal", "Black", "Navy"]]],
    swatches: { charcoal: "#4A4A4F", black: "#0C0C0E", navy: "#1F2A44" },
  },
  {
    sku: "HP-APP-117",
    slug: "baseball-cap",
    routes: ["SOURCE_CUSTOMIZE", "CUSTOMER_SUPPLIED"],
    decorations: ["EMBROIDERY", "HEAT_TRANSFER"],
    phrases: ["branded caps", "embroidered caps"],
    name: "Baseball Cap",
    family: "GARMENT",
    buyingMode: "CONFIGURABLE_QUOTE",
    category: "apparel-garment-production",
    subcategory: ["headwear", "Headwear"],
    summary: "Print or embroidery",
    options: [["colour", "Colour", ["Navy", "Black", "White"]]],
    swatches: { navy: "#1F2A44", black: "#0C0C0E", white: "#F4F4F5" },
  },
  {
    sku: "HP-PRN-027",
    slug: "event-badges",
    decorations: ["PAPER_PRINT"],
    name: "Event Badges",
    family: "PAPER_PRINT",
    buyingMode: "SIMPLE_CONFIGURABLE",
    category: "print-business-stationery",
    subcategory: ["id-event", "ID & Event"],
    summary: "With lanyard",
    options: [["lanyard", "Lanyard", ["Black", "Red"]]],
  },
  {
    sku: "HP-PKG-014",
    slug: "individual-bagging",
    name: "Individual bagging",
    family: "PACKAGING",
    buyingMode: "CONFIGURABLE_QUOTE",
    category: "bags-packaging",
    subcategory: ["paper-presentation-packaging", "Paper & Presentation Packaging"],
    summary: "Named, sorted by branch",
    options: [],
  },
];

const OLD_POLO_SUMMARY = "Branded polo shirts for teams and events, sourced or made by HolyPearls.";

/** Loads the catalogue; re-running keeps what's there and adds products new to the seed. */
export async function seedCatalogue(tx: Transaction): Promise<void> {
  const ids = new Map((await tx.select({ id: schema.categories.id, slug: schema.categories.slug }).from(schema.categories)).map((row) => [row.slug, row.id]));
  if (!ids.size) {
    for (const [position, [slug, name, description]] of SEED_CATEGORIES.entries()) {
      const [row] = await tx
        .insert(schema.categories)
        .values({ slug, name, description, position, status: "PUBLISHED", seoTitle: `${name} | HolyPearls` })
        .returning({ id: schema.categories.id });
      ids.set(slug, row!.id);
    }
  }
  const present = new Set((await tx.select({ slug: schema.products.slug }).from(schema.products)).map((row) => row.slug));
  for (const product of SEED_PRODUCTS) {
    if (present.has(product.slug)) continue;
    let subId = ids.get(product.subcategory[0]);
    if (!subId) {
      const [row] = await tx
        .insert(schema.categories)
        .values({ slug: product.subcategory[0], name: product.subcategory[1], parentId: ids.get(product.category)!, status: "PUBLISHED" })
        .returning({ id: schema.categories.id });
      subId = row!.id;
      ids.set(product.subcategory[0], subId);
    }
    const [row] = await tx
      .insert(schema.products)
      .values({
        sku: product.sku,
        slug: product.slug,
        name: `${product.name}`,
        summary: product.summary,
        description: `${product.summary} (TEST DATA)`,
        family: product.family,
        buyingMode: product.buyingMode,
        categoryId: subId,
        // Seeded as PUBLISHED so public pages have content; staff publishing needs an image and SEO title.
        status: "PUBLISHED",
        publishedAt: new Date(),
        seoTitle: `${product.name} | HolyPearls`,
        searchPhrases: [product.name.toLowerCase(), ...(product.phrases ?? [])],
        routes: product.routes ?? [],
        decorations: product.decorations ?? [],
      })
      .returning({ id: schema.products.id });
    for (const [position, [key, label]] of product.options.entries()) {
      await tx.insert(schema.productOptions).values({ productId: row!.id, key, label, position, required: key !== "finish" });
    }
  }
  await seedProductDetails(tx);
}

/** "key|Label" keeps a stable key when the label reads better than the key. */
const splitValue = (value: string): [key: string, label: string] =>
  value.includes("|") ? (value.split("|") as [string, string]) : [value.toLowerCase().replace(/[^a-z0-9]+/g, "-"), value];

/**
 * Fills what product pages show (Pen 19): option values with swatches,
 * specifications, questions, everyday search phrases and related products. Only adds what's missing, so
 * staff edits are kept. The polo's first-seed summary gives way to the Pen copy.
 */
async function seedProductDetails(tx: Transaction): Promise<void> {
  const products = await tx
    .select({
      id: schema.products.id,
      slug: schema.products.slug,
      summary: schema.products.summary,
      specifications: schema.products.specifications,
      faqs: schema.products.faqs,
      searchPhrases: schema.products.searchPhrases,
      routes: schema.products.routes,
      decorations: schema.products.decorations,
    })
    .from(schema.products);
  const idOf = new Map(products.map((row) => [row.slug, row.id]));
  for (const seeded of SEED_PRODUCTS) {
    const row = products.find((item) => item.slug === seeded.slug);
    if (!row) continue;
    const updates: Partial<typeof schema.products.$inferInsert> = {};
    if (row.summary === OLD_POLO_SUMMARY) updates.summary = seeded.summary;
    if (seeded.specifications && !(row.specifications as unknown[]).length) updates.specifications = seeded.specifications;
    if (seeded.faqs && !(row.faqs as unknown[]).length) updates.faqs = seeded.faqs;
    const missing = (seeded.phrases ?? []).filter((phrase) => !row.searchPhrases.includes(phrase));
    if (missing.length) updates.searchPhrases = [...row.searchPhrases, ...missing];
    if (seeded.routes && !row.routes.length) updates.routes = seeded.routes;
    if (seeded.decorations && !row.decorations.length) updates.decorations = seeded.decorations;
    if (Object.keys(updates).length) await tx.update(schema.products).set(updates).where(eq(schema.products.id, row.id));

    const options = await tx.select({ id: schema.productOptions.id, key: schema.productOptions.key }).from(schema.productOptions).where(eq(schema.productOptions.productId, row.id));
    for (const [optionKey, , values] of seeded.options) {
      const option = options.find((item) => item.key === optionKey);
      if (!option) continue;
      const have = await tx
        .select({ id: schema.productOptionValues.id, key: schema.productOptionValues.key, swatch: schema.productOptionValues.swatch })
        .from(schema.productOptionValues)
        .where(eq(schema.productOptionValues.optionId, option.id));
      for (const [position, value] of values.entries()) {
        const [key, label] = splitValue(value);
        const swatch = seeded.swatches?.[key] ?? null;
        const found = have.find((item) => item.key === key);
        if (!found) await tx.insert(schema.productOptionValues).values({ optionId: option.id, key, label, position, isDefault: position === 0 && !have.length, swatch });
        else await tx.update(schema.productOptionValues).set({ position, ...(found.swatch === null && swatch ? { swatch } : {}) }).where(eq(schema.productOptionValues.id, found.id));
      }
    }

    for (const [position, slug] of (seeded.related ?? []).entries()) {
      const relatedId = idOf.get(slug);
      if (relatedId) await tx.insert(schema.productRelations).values({ productId: row.id, relatedProductId: relatedId, position }).onConflictDoNothing();
    }
  }
}

/** Starting lists for the mega-menu and the homepage (PUB-FR-004); staff change them in admin. Kept if they exist. */
export async function seedMerchandising(tx: Transaction): Promise<void> {
  const products = await tx.select({ id: schema.products.id, slug: schema.products.slug }).from(schema.products);
  const ids = (slugs: string[]) => slugs.flatMap((slug) => products.filter((product) => product.slug === slug).map((product) => product.id));
  await tx
    .insert(schema.merchandisingLists)
    .values([
      { key: "menu.popular", productIds: ids(["polo-shirt", "business-cards", "roll-up-banner", "small-paper-bag", "label-sticker", "standard-mug"]) },
      { key: "home.most-ordered", productIds: ids(["polo-shirt", "business-cards", "roll-up-banner", "standard-mug"]) },
    ])
    .onConflictDoNothing();
}
