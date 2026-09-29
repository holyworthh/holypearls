import { and, eq, isNull, schema, type Transaction } from "@holypearls/db";

/*
 * Published hub content for the two hubs designed in Pen (18 · Apparel,
 * 11 · Print & display), in the design's own words. Staff can change all of
 * it in the hub editor; the seed only fills a hub that has never been saved.
 */

type Section = Record<string, unknown> & { type: string; visible: boolean; heading: string };

const empty = (type: string, heading = ""): Section => ({ type, visible: false, heading });

const APPAREL: Section[] = [
  {
    type: "summary",
    visible: true,
    heading: "Apparel and uniforms",
    body: "Polos, T-shirts, workwear and caps for your team. We brand ready-made garments or make them from scratch.",
    primaryLabel: "Browse products",
    secondaryLabel: "Plan a uniform project",
    secondaryHref: "/contact?topic=project",
  },
  { type: "subcategories", visible: true, heading: "What are you outfitting?" },
  { type: "featured", visible: true, heading: "Team favourites", productSlugs: ["polo-shirt"] },
  {
    type: "process",
    visible: true,
    heading: "Choose how it's made",
    steps: [
      { title: "Source & Customize", body: "We supply the garment and add your logo. The fastest option, with a price estimate as you go.", detail: "Best for: from 10 pieces · 3–7 working days" },
      { title: "Make From Scratch", body: "We cut and sew it in our own production, in your fabric, pattern and fit.", detail: "From 20 per style/colour · sample 5–10 days · bulk 10–25" },
      { title: "Customer Supplied", body: "Send us your own garments. We add your logo and send them back.", detail: "Best for: garments you already own" },
    ],
  },
  {
    type: "guidance",
    visible: true,
    heading: "Stitch, print or press?",
    intro: "",
    columns: ["Method", "Best for", "Feel", "Minimum", "Typical production"],
    rows: [
      ["Embroidery", "Logos on polos, caps, workwear", "Raised, textured, premium", "5 pieces (simple logo)", "3–7 working days"],
      ["Screen print", "Bold graphics, bigger runs", "Smooth, very durable", "Confirmed at review", "3–5 working days"],
      ["Heat transfer", "Names, numbers, small runs", "Flat, flexible", "Confirmed at review", "3–5 working days"],
    ],
    note: "Stage 1.4 seed values for a sourced garment · screen-print and transfer minimums not yet set — confirm with operations",
  },
  {
    type: "related",
    visible: true,
    heading: "Outfitting a whole team?",
    links: [
      { title: "Restaurant & hospitality", body: "Polos, aprons, name tags", href: "/contact?topic=project" },
      { title: "Field & operations", body: "Durable workwear, hi-vis, caps", href: "/contact?topic=project" },
    ],
  },
  {
    type: "faq",
    visible: true,
    heading: "Guides",
    items: [
      { question: "Embroidery or print? A practical guide", answer: "Embroidery suits logos on polos, caps and workwear and feels raised and premium. Print suits bold graphics and bigger runs. Ask us and we'll recommend one for your artwork." },
      { question: "How to get staff sizes without a fitting day", answer: "Share a size link with your team and each person enters their own size. You approve the list before we produce." },
      { question: "Choosing fabric for hot kitchens", answer: "Breathable cotton blends and performance polyester stay cooler. We'll suggest fabrics when you configure your order." },
      { question: "About custom apparel at HolyPearls", answer: "We source ready-made garments and brand them, or cut and sew garments from scratch in our own production." },
    ],
  },
  empty("grid", "All apparel"),
];

const PRINT: Section[] = [
  {
    type: "summary",
    visible: true,
    heading: "Print and display",
    body: "Business cards, flyers, banners, labels, packaging and wall art. Most print items are priced as you choose options; custom work gets a quote.",
    primaryLabel: "Browse products",
    secondaryLabel: "",
    secondaryHref: "",
  },
  { type: "subcategories", visible: true, heading: "Browse print and display" },
  { type: "featured", visible: true, heading: "Most ordered", productSlugs: ["business-cards", "roll-up-banner"] },
  {
    type: "guidance",
    visible: true,
    heading: "Choose the right format",
    intro: "Start from where it will be used. Each row links to the product with the right sizes preselected.",
    columns: ["Where it's used", "Best format", "Starting price (test data)", "Typical time"],
    rows: [
      ["Handed out at an event or shop", "Flyers, A5", "₦18,000 / 100", "2–5 days"],
      ["Standing display at a stand or reception", "Roll-up banner", "₦55,000 each", "1–4 days"],
      ["Outside a shop or on a fence", "Flex banner, custom size", "₦2,200 per m²", "1–4 days"],
      ["Photo wall at an event", "Backdrop banner", "From ₦65,000", "2–5 days"],
      ["Tables in a restaurant", "Menus", "₦18,000 / 50", "3–5 days"],
    ],
    note: "",
  },
  {
    type: "process",
    visible: true,
    heading: "Large format is printed by us, then checked before it leaves.",
    steps: [
      { title: "Upload artwork or send it later", body: "", detail: "" },
      { title: "Approve a proof at the right size", body: "", detail: "" },
      { title: "We print, finish and check it", body: "Installation, where offered, is quoted separately after a site check.", detail: "" },
    ],
  },
  {
    type: "related",
    visible: true,
    heading: "Often part of a bigger order",
    links: [
      { title: "Event branding", body: "Backdrop, roll-ups, badges and crew shirts, quoted together", href: "/contact?topic=project" },
      { title: "Business launch", body: "Cards, bags, labels and signage for opening day", href: "/contact?topic=project" },
    ],
  },
  {
    type: "faq",
    visible: true,
    heading: "Before you order",
    items: [
      { question: "How to prepare print-ready artwork", answer: "Send a PDF with fonts outlined and 3 mm bleed. AI and SVG files work too. We check every file and send a proof before printing." },
      { question: "Which paper stock should I choose?", answer: "Smooth matte reads clearly, gloss makes photos pop and soft-touch feels thicker and premium. The product page describes each one." },
      { question: "Roll-up, backdrop or flex banner?", answer: "Roll-ups stand on their own and pack away; backdrops make photo walls; flex banners hang outside and come in any size." },
      { question: "Can I see a proof before printing?", answer: "Yes. Every order gets a proof to approve before we print anything." },
      { question: "What if I don't have artwork yet?", answer: "Choose design help when you configure, or send artwork later where the product allows it." },
    ],
  },
  empty("grid", "All print and display"),
];

export async function seedHubs(tx: Transaction): Promise<void> {
  for (const [slug, sections] of [
    ["apparel-garment-production", APPAREL],
    ["print-business-stationery", PRINT],
  ] as const) {
    await tx
      .update(schema.categories)
      .set({ hub: { sections } })
      .where(and(eq(schema.categories.slug, slug), isNull(schema.categories.hub), isNull(schema.categories.hubDraft)));
  }
}
