import { schema, type Transaction } from "@holypearls/db";

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
}

export const SEED_PRODUCTS: SeedProduct[] = [
  {
    sku: "HP-APP-007",
    slug: "polo-shirt",
    name: "Polo Shirt",
    family: "GARMENT",
    buyingMode: "CONFIGURABLE_QUOTE",
    category: "apparel-garment-production",
    subcategory: ["t-shirts-tops", "T-Shirts & Tops"],
    summary: "Branded polo shirts for teams and events, sourced or made by HolyPearls.",
    options: [
      ["colour", "Colour", ["Navy", "Black", "White", "Wine"]],
      ["fabric", "Fabric", ["Pique cotton", "Performance polyester"]],
    ],
  },
  {
    sku: "HP-CUS-001",
    slug: "heat-transfer-printing",
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
    name: "Business Cards",
    family: "PAPER_PRINT",
    buyingMode: "SIMPLE_CONFIGURABLE",
    category: "print-business-stationery",
    subcategory: ["business-stationery", "Business Stationery"],
    summary: "Premium business cards printed on quality card, delivered fast.",
    options: [
      ["paper", "Paper", ["350gsm matte", "350gsm gloss", "400gsm soft-touch"]],
      ["sides", "Printed sides", ["One side", "Both sides"]],
      ["finish", "Finish", ["None", "Foil", "Spot UV"]],
    ],
  },
  {
    sku: "HP-LF-005",
    slug: "roll-up-banner",
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
    name: "Team & Staff Branding",
    family: "CUSTOM_PROJECT",
    buyingMode: "CONSULTATIVE_PROJECT",
    category: "custom-multi-product-projects",
    subcategory: ["solutions", "Solutions"],
    summary: "Uniforms, IDs and branded items for a whole team, planned with HolyPearls.",
    options: [],
  },
];

/** Loads the catalogue once; re-running keeps what's there. */
export async function seedCatalogue(tx: Transaction): Promise<void> {
  const [existing] = await tx.select({ id: schema.categories.id }).from(schema.categories).limit(1);
  if (existing) return;
  const ids = new Map<string, string>();
  for (const [position, [slug, name, description]] of SEED_CATEGORIES.entries()) {
    const [row] = await tx
      .insert(schema.categories)
      .values({ slug, name, description, position, status: "PUBLISHED", seoTitle: `${name} | HolyPearls` })
      .returning({ id: schema.categories.id });
    ids.set(slug, row!.id);
  }
  for (const product of SEED_PRODUCTS) {
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
        searchPhrases: [product.name.toLowerCase()],
      })
      .returning({ id: schema.products.id });
    for (const [position, [key, label, values]] of product.options.entries()) {
      const [option] = await tx.insert(schema.productOptions).values({ productId: row!.id, key, label, position, required: key !== "finish" }).returning({ id: schema.productOptions.id });
      await tx.insert(schema.productOptionValues).values(
        values.map((value, index) => ({ optionId: option!.id, key: value.toLowerCase().replace(/[^a-z0-9]+/g, "-"), label: value, position: index, isDefault: index === 0 })),
      );
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
