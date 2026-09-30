import { CONTENT_DATA_SCHEMA } from "@holypearls/contracts";
import { eq, schema, type Transaction } from "@holypearls/db";

/*
 * TEST DATA content pages (T02-06) in the Pen designs' own words: projects
 * (Pen 12, 12B), our work (54, 55), resources (56, 57) and About (59).
 * Every case study is marked a demo: nothing here claims a real client or
 * result (PUB-FR-012). Staff can change all of it in the content editor; the
 * seed only adds pages that aren't there yet.
 */

type Kind = "PROJECT" | "GUIDE" | "CASE_STUDY" | "ABOUT";
interface Page {
  type: Kind;
  slug: string;
  title: string;
  summary: string;
  body?: string;
  featured?: boolean;
  demo?: boolean;
  position?: number;
  seoTitle?: string;
  seoDescription?: string;
  data: Record<string, unknown>;
  /** Products and pages this page links to ("Put it into practice"), by slug. */
  links?: { products?: string[]; pages?: [Kind, string][] };
}

const h2 = (text: string) => `<h2>${text}</h2>`;
const p = (...lines: string[]) => lines.map((line) => `<p>${line}</p>`).join("");
const ul = (...items: string[]) => `<ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>`;

const KIT_NOTE = "Starting prices are seed test data; your quote is built from your details.";
const SIX_WEEKS = [
  { when: "Week 1", what: "Brief and quote" },
  { when: "Week 2", what: "Deposit and proofs" },
  { when: "Weeks 3–4", what: "Production and Quality Check" },
  { when: "Week 5", what: "Balance and dispatch" },
  { when: "Week 6", what: "Delivery" },
];
const TIMELINE_NOTE = "Multi-product projects typically take 10–30 working days (Stage 1.4 test data). Exact dates come in your quote.";

const project = (
  slug: string,
  title: string,
  summary: string,
  data: Record<string, unknown>,
  extra: Partial<Page> = {},
): Page => ({
  type: "PROJECT",
  slug,
  title,
  summary,
  seoTitle: `${title} in Nigeria | HolyPearls`,
  seoDescription: `${summary} Tell us what it's for and HolyPearls suggests the items, then sends one quote. Delivery across Nigeria.`,
  data: { timelineTitle: "How six weeks usually go", timeline: SIX_WEEKS, timelineNote: TIMELINE_NOTE, kitNote: KIT_NOTE, ...data },
  body:
    h2("What we'll ask") +
    p("How many people, when you need it, where it's going, and any logo or brand colours you already have.") +
    h2("How it works") +
    p("We suggest the items and quantities. You change anything you like, then we send one quote. Proofs come item by item, and nothing is made until you approve them."),
  ...extra,
});

const PROJECTS: Page[] = [
  project(
    "staff-team-branding",
    "Staff & team branding",
    "Uniforms for the whole team, collected by size and branch, reordered in minutes.",
    {
      headline: "Uniforms for everyone, in one order",
      intro: "Tell us how many people and which branches. We suggest the garments, collect sizes and send one quote.",
      productHints: "Polos · shirts · aprons · name badges",
      ctaLabel: "Start a uniform project",
      kitTitle: "A typical kit for a team of 40",
      kit: [
        { group: "RECOMMENDED", productSlug: "polo-shirt", label: "Staff polo shirts", quantity: 40 },
        { group: "RECOMMENDED", productSlug: "apron", label: "Aprons", quantity: 20 },
        { group: "USEFUL", productSlug: "event-badges", label: "Name badges", quantity: 40 },
        { group: "USEFUL", productSlug: "baseball-cap", label: "Caps", quantity: 40 },
      ],
      caseStudySlug: "restaurant-group-staff-uniforms",
    },
    { featured: true, position: 1 },
  ),
  project(
    "event-branding",
    "Event branding",
    "Everything for the day, from the backdrop to crew shirts, quoted together.",
    {
      headline: "Everything for your event, in one quote",
      intro: "Tell us your guest count and date. We suggest the items and quantities, you edit the list, and we send one quote.",
      productHints: "Backdrop · roll-ups · badges · crew wear",
      ctaLabel: "Start an event project",
      kitTitle: "A typical kit for 250 guests",
      kitNote: `From the Annual Business Conference example. ${KIT_NOTE}`,
      kit: [
        { group: "RECOMMENDED", productSlug: "polo-shirt", label: "Crew polo shirts", quantity: 30 },
        { group: "RECOMMENDED", productSlug: "event-badges", label: "Name badges", quantity: 250 },
        { group: "RECOMMENDED", productSlug: null, label: "Main backdrop", quantity: 1 },
        { group: "RECOMMENDED", productSlug: "roll-up-banner", label: "Roll-up banners", quantity: 2 },
        { group: "USEFUL", productSlug: null, label: "Tote bags", quantity: 250 },
        { group: "USEFUL", productSlug: null, label: "Notebooks", quantity: 250 },
      ],
      timeline: [...SIX_WEEKS.slice(0, 4), { when: "Week 6", what: "Event: delivery and installation" }],
      caseStudySlug: "annual-business-conference",
    },
    { featured: true, position: 2, seoTitle: "Event Branding in Nigeria | Apparel, Banners, Print & More | HolyPearls" },
  ),
  project("conference-kit", "Conference kit", "Badges, lanyards, notebooks and bags for every attendee.", {
    headline: "A kit for every attendee",
    intro: "Tell us how many are coming. We suggest what goes in each kit and pack it per person.",
    productHints: "Badges · totes · notebooks",
    ctaLabel: "Start a conference kit",
    kitTitle: "A typical kit for 150 attendees",
    kit: [
      { group: "RECOMMENDED", productSlug: "event-badges", label: "Name badges", quantity: 150 },
      { group: "RECOMMENDED", productSlug: null, label: "Tote bags", quantity: 150 },
      { group: "USEFUL", productSlug: null, label: "Notebooks", quantity: 150 },
      { group: "USEFUL", productSlug: "individual-bagging", label: "Packed per person", quantity: 150 },
    ],
  }, { position: 3 }),
  project("hospitality-programme", "Hospitality programme", "Front desk, kitchen and floor staff, dressed for their roles.", {
    headline: "Every role dressed for the job",
    intro: "Front desk, kitchen and floor staff in one order, with names embroidered where you need them.",
    productHints: "Chef jackets · aprons · polos",
    ctaLabel: "Start a hospitality project",
    kitTitle: "A typical kit for a 60-room hotel",
    kit: [
      { group: "RECOMMENDED", productSlug: "polo-shirt", label: "Floor staff polos", quantity: 30 },
      { group: "RECOMMENDED", productSlug: "apron", label: "Kitchen aprons", quantity: 15 },
      { group: "USEFUL", productSlug: "flat-embroidery", label: "Embroidered names", quantity: 45 },
    ],
    caseStudySlug: "hotel-front-desk-uniforms",
  }, { position: 4 }),
  project("school-uniform-programme", "School uniform programme", "Uniforms by class and size, ordered per term.", {
    headline: "Uniforms by class and size, every term",
    intro: "Tell us the classes and roughly how many pupils. We collect sizes and deliver per class.",
    productHints: "Shirts · blazers · PE kit",
    ctaLabel: "Start a school project",
    kitTitle: "A typical order for one term",
    kit: [
      { group: "RECOMMENDED", productSlug: "polo-shirt", label: "PE polo shirts", quantity: 200 },
      { group: "USEFUL", productSlug: "baseball-cap", label: "Sports caps", quantity: 200 },
    ],
    caseStudySlug: "secondary-school-uniforms",
  }, { position: 5 }),
  project("business-launch", "Business launch", "Cards, bags, labels and signs ready for opening day.", {
    headline: "Ready for opening day",
    intro: "Tell us your opening date. We suggest what you'll need and make sure it all arrives before then.",
    productHints: "Cards · bags · labels · signage",
    ctaLabel: "Start a launch project",
    kitTitle: "A typical launch kit",
    kit: [
      { group: "RECOMMENDED", productSlug: "business-cards", label: "Business cards", quantity: 500 },
      { group: "RECOMMENDED", productSlug: "small-paper-bag", label: "Branded paper bags", quantity: 200 },
      { group: "USEFUL", productSlug: "label-sticker", label: "Product labels", quantity: 500 },
      { group: "USEFUL", productSlug: "roll-up-banner", label: "Roll-up banner", quantity: 1 },
    ],
    caseStudySlug: "boutique-opening-packaging",
  }, { position: 6 }),
  project("retail-branding", "Retail branding", "Bags, window graphics and staff tees for your shop.", {
    headline: "Your shop, branded from the window in",
    intro: "Tell us about the shop. We suggest bags, window graphics and staff wear that match.",
    productHints: "Bags · window graphics · tees",
    ctaLabel: "Start a retail project",
    kitTitle: "A typical kit for one shop",
    kit: [
      { group: "RECOMMENDED", productSlug: "small-paper-bag", label: "Paper bags", quantity: 500 },
      { group: "RECOMMENDED", productSlug: "heat-transfer-printing", label: "Printed staff tees", quantity: 10 },
      { group: "USEFUL", productSlug: "label-sticker", label: "Window and pack stickers", quantity: 200 },
    ],
  }, { position: 7 }),
  project("fashion-brand-production", "Fashion brand production", "Sampling and cut-and-sew runs for your own label.", {
    headline: "Your own label, sampled and made",
    intro: "Send us your designs or references. We make samples first, then the production run.",
    productHints: "Samples · production runs",
    ctaLabel: "Start a production project",
    kitTitle: "How a first run usually looks",
    kit: [
      { group: "RECOMMENDED", productSlug: "team-staff-branding", label: "Samples per style", quantity: 2 },
      { group: "USEFUL", productSlug: "individual-bagging", label: "Bagged per piece", quantity: 100 },
    ],
  }, { position: 8 }),
  project("corporate-gifts", "Corporate gifts", "Welcome packs and thank-you gifts, packed per person.", {
    headline: "Gifts that arrive packed and named",
    intro: "Tell us who they're for and when. We suggest the items and pack them per person.",
    productHints: "Bottles · mugs · totes · boxes",
    ctaLabel: "Start a gifts project",
    kitTitle: "A typical welcome pack for 50 people",
    kit: [
      { group: "RECOMMENDED", productSlug: "standard-mug", label: "Branded mugs", quantity: 50 },
      { group: "RECOMMENDED", productSlug: "individual-bagging", label: "Packed per person", quantity: 50 },
      { group: "USEFUL", productSlug: null, label: "Tote bags", quantity: 50 },
    ],
    caseStudySlug: "new-staff-welcome-kits",
  }, { position: 9 }),
];

const caseStudy = (slug: string, title: string, summary: string, data: Record<string, unknown>, extra: Partial<Page> = {}): Page => ({
  type: "CASE_STUDY",
  slug,
  title,
  summary,
  demo: true,
  data: { factsNote: "DEMO: placeholder facts until a real project is approved. No results, revenue or quotes are claimed.", ...data },
  ...extra,
});

const CASE_STUDIES: Page[] = [
  caseStudy(
    "annual-business-conference",
    "A conference kit for 250 guests, made as one project",
    "Crew shirts, name badges, a backdrop and roll-ups, quoted together and proofed item by item.",
    {
      headline: "Annual Business Conference: one project, four kinds of work",
      sector: "Event branding",
      capabilities: ["Embroidery", "Print", "Large format"],
      location: "Lagos",
      made: [
        { label: "Crew polo shirts", detail: "30 · embroidered", productSlug: "polo-shirt" },
        { label: "Name badges", detail: "250 · printed", productSlug: "event-badges" },
        { label: "Main backdrop", detail: "1 · printed", productSlug: null },
        { label: "Roll-up banners", detail: "2 · printed", productSlug: "roll-up-banner" },
      ],
      facts: [
        { label: "Project type", value: "Event branding" },
        { label: "Items", value: "4 product types" },
        { label: "Quantities", value: "30 polos · 250 badges · 1 backdrop · 2 roll-ups" },
        { label: "Methods", value: "Embroidery · print · large format" },
        { label: "Proofs", value: "One per item" },
        { label: "Location", value: "Lagos" },
      ],
      factsNote: "DEMO: facts come from the Stage 3.1E Quote V2 fixture. No results, revenue or quotes are claimed.",
      projectSlug: "event-branding",
    },
    {
      featured: true,
      body:
        h2("The context") +
        p("A company hosting its annual conference for 250 guests needed the event to look like one brand, from the registration desk to the stage.") +
        h2("What was needed") +
        p("Crew shirts for 30 staff, a name badge for every guest, a large backdrop for photos and roll-ups for the entrance, all ready before the event date.") +
        h2("How it came together") +
        p("The organiser described the event once. We suggested the items and quantities, agreed one quote, then sent a proof for each item. Items moved through production and Quality Check separately, and the backdrop was held until the balance was paid."),
    },
  ),
  caseStudy("restaurant-group-staff-uniforms", "Staff uniforms for a restaurant group", "Polos and aprons for three branches, with names embroidered.", {
    headline: "Restaurant group: one uniform order for three branches",
    sector: "Hospitality",
    capabilities: ["Embroidery", "Uniform programme"],
    made: [
      { label: "Staff polo shirts", detail: "embroidered", productSlug: "polo-shirt" },
      { label: "Aprons", detail: "embroidered", productSlug: "apron" },
    ],
    facts: [
      { label: "Project type", value: "Staff & team branding" },
      { label: "Methods", value: "Embroidery" },
    ],
    projectSlug: "staff-team-branding",
  }, { body: h2("The context") + p("Placeholder: a restaurant group dressing staff across three branches. Replaced when a real project is approved.") }),
  caseStudy("hotel-front-desk-uniforms", "Front-desk uniforms for a hotel", "Front-desk shirts in the hotel's colours, embroidered with names.", {
    headline: "Hotel: front-desk uniforms",
    sector: "Hospitality",
    capabilities: ["Garments"],
    facts: [{ label: "Project type", value: "Hospitality programme" }],
    projectSlug: "hospitality-programme",
  }, { body: h2("The context") + p("Placeholder: front-desk uniforms for a hotel. Replaced when a real project is approved.") }),
  caseStudy("boutique-opening-packaging", "Opening-day packaging for a boutique", "Bags, labels and cards ready for a shop's first day.", {
    headline: "Boutique: packaging for opening day",
    sector: "Retail",
    capabilities: ["Packaging", "Print"],
    made: [
      { label: "Paper bags", detail: "printed", productSlug: "small-paper-bag" },
      { label: "Labels", detail: "printed", productSlug: "label-sticker" },
    ],
    facts: [{ label: "Project type", value: "Business launch" }],
    projectSlug: "business-launch",
  }, { body: h2("The context") + p("Placeholder: opening-day packaging for a boutique. Replaced when a real project is approved.") }),
  caseStudy("office-reception-wall-graphics", "Reception wall graphics for an office", "Large-format graphics for an office reception.", {
    headline: "Office: reception wall graphics",
    sector: "Corporate",
    capabilities: ["Large format"],
    facts: [{ label: "Methods", value: "Large format" }],
  }, { body: h2("The context") + p("Placeholder: reception wall graphics for an office. Replaced when a real project is approved.") }),
  caseStudy("secondary-school-uniforms", "Uniforms for a secondary school", "Shirts and PE kit by class and size.", {
    headline: "Secondary school: uniforms by class",
    sector: "Education",
    capabilities: ["Garments"],
    facts: [{ label: "Project type", value: "School uniform programme" }],
    projectSlug: "school-uniform-programme",
  }, { body: h2("The context") + p("Placeholder: uniforms for a secondary school. Replaced when a real project is approved.") }),
  caseStudy("new-staff-welcome-kits", "Welcome kits for new staff", "Mugs, totes and notebooks packed per new starter.", {
    headline: "Welcome kits for new staff",
    sector: "Corporate",
    capabilities: ["Promotional"],
    facts: [{ label: "Project type", value: "Corporate gifts" }],
    projectSlug: "corporate-gifts",
  }, { body: h2("The context") + p("Placeholder: welcome kits for new staff. Replaced when a real project is approved.") }),
];

const guide = (slug: string, topic: string, title: string, summary: string, body: string, extra: Partial<Page> = {}, data: Record<string, unknown> = {}): Page => ({
  type: "GUIDE",
  slug,
  title,
  summary,
  body,
  seoTitle: `${title} | HolyPearls`,
  data: { topic, readingNote: "reviewed by the HolyPearls production team", ...data },
  ...extra,
});

const GUIDES: Page[] = [
  guide(
    "embroidery-or-print",
    "EMBROIDERY",
    "Embroidery or print? A practical guide",
    "Which lasts longer on a staff shirt, which suits your logo, and what each costs.",
    h2("The short answer") +
      p("Embroidery is stitched into the fabric. It looks premium and lasts through heavy washing, which is why it's common on polos, caps and uniforms. Print sits on the surface. It handles fine detail, photos and large designs better, and usually costs less for big graphics.") +
      h2("How each one works") +
      p("Embroidery turns your logo into a stitch file, then a machine sews it with thread in each colour. Print puts ink or a transfer film onto the fabric, by screen for bigger runs or by heat press for names, numbers and small runs.") +
      h2("Side by side") +
      '<div data-block="comparison"></div>' +
      h2("Which suits your logo?") +
      p("Bold shapes and short text stitch well, even small. Very fine lines, tiny text, gradients and photos don't: thread can't draw them. If your logo has those, print it, or ask us for a simplified stitch version.") +
      h2("Cost and quantity") +
      p("Embroidery is priced by size and stitch count, so a small chest logo is good value even on a few pieces. Print is priced by colours and area, and a large back design usually costs less printed than stitched. Your quote shows both where either would work.") +
      h2("Decide in 30 seconds") +
      '<div data-block="decision"></div>',
    {
      featured: true,
      seoTitle: "Embroidery vs Print: How to Choose | HolyPearls",
      links: { products: ["flat-embroidery", "heat-transfer-printing"], pages: [["PROJECT", "staff-team-branding"], ["GUIDE", "logo-3d-embroidery"], ["GUIDE", "print-ready-artwork"]] },
    },
    {
      comparison: {
        columns: [
          { title: "Embroidery", icon: "sparkles", rows: [{ label: "Look", value: "Raised, premium" }, { label: "Detail", value: "Bold shapes, simple text" }, { label: "Washing", value: "Lasts longest" }, { label: "Best on", value: "Polos, caps, jackets" }] },
          { title: "Print", icon: "printer", rows: [{ label: "Look", value: "Flat, crisp" }, { label: "Detail", value: "Fine lines, photos" }, { label: "Washing", value: "Good; depends on method" }, { label: "Best on", value: "T-shirts, large back designs" }] },
        ],
      },
      decision: {
        items: [
          { question: "Is your logo mostly bold shapes and short text?", answer: "Embroidery works well." },
          { question: "Does it have photos, gradients or tiny text?", answer: "Choose print." },
          { question: "Will it be washed every day (uniforms)?", answer: "Embroidery lasts longest." },
          { question: "Is it a big design on the back?", answer: "Print is usually better value." },
        ],
        note: "Still unsure? Upload your logo on any product and we'll recommend one in your proof.",
      },
    },
  ),
  guide("staff-sizes-without-a-fitting-day", "APPAREL", "How to get staff sizes without a fitting day", "Collect sizes online by branch, then order once.",
    h2("Ask for sizes, not measurements") + p("Most people know their shirt size. Send the size chart with the request and ask each person to pick from it.") + h2("Collect by branch") + p("List sizes per branch or team, so the order can be packed and delivered to each one.") + h2("Order a few spares") + p("Add one or two of the most common sizes for new starters and swaps.")),
  guide("fabric-for-hot-kitchens", "APPAREL", "Choosing fabric for hot kitchens", "Chef jackets and aprons that stay comfortable.",
    h2("Breathable first") + p("Cotton-rich fabrics breathe better in heat. Polyester blends dry faster and hold colour through hot washes.") + h2("Think about washing") + p("Kitchen wear is washed often and hot. Ask for fabrics and decoration rated for it; embroidery lasts longest.")),
  guide("ready-made-or-made-from-scratch", "APPAREL", "Ready-made or made from scratch?", "When to brand a ready garment and when to have one made.",
    h2("Ready-made") + p("Fastest and simplest: we source the garment and add your logo. Good from about 10 pieces.") + h2("Made from scratch") + p("We cut and sew to your fabric, fit and colour. It needs a sample first and a larger run per style and colour.")),
  guide("logo-3d-embroidery", "EMBROIDERY", "Does my logo suit 3D embroidery?", "What puff embroidery can and can't do.",
    h2("Bold and simple") + p("3D (puff) embroidery raises the stitches over foam. It suits bold letters and simple shapes, often on caps.") + h2("Avoid fine detail") + p("Thin lines and small text don't puff well. We can combine flat and 3D stitching on one logo.")),
  guide("caring-for-embroidered-uniforms", "EMBROIDERY", "Caring for embroidered uniforms", "Wash and iron so the stitching stays neat.",
    h2("Washing") + p("Turn garments inside out and wash at the temperature on the label.") + h2("Ironing") + p("Iron on the reverse side, never directly on the stitching.")),
  guide("choosing-paper-stock", "PRINT", "Which paper stock should I choose?", "Weights and finishes explained for cards, flyers and brochures.",
    h2("Weight") + p("Heavier paper feels more premium. Business cards are usually on thick card; flyers on lighter paper.") + h2("Finish") + p("Matte is easy to read and write on. Gloss makes colours and photos pop. Soft-touch feels velvety.")),
  guide("flyer-sizes-explained", "PRINT", "Flyer sizes explained", "A6, A5 and A4: what each is good for.",
    h2("A6") + p("Pocket-sized: handouts and inserts.") + h2("A5") + p("The most common flyer: room for a message and a picture.") + h2("A4") + p("Menus, price lists and posters.")),
  guide("brochure-folds", "PRINT", "How folds change a brochure", "Half, tri and gate folds, and when to use each.",
    h2("Half fold") + p("Four panels, like a small booklet.") + h2("Tri-fold") + p("Six panels that fit a standard envelope; common for menus and service lists.") + h2("Gate fold") + p("Two panels open like doors to reveal a larger middle.")),
  guide("rollup-backdrop-or-flex-banner", "LARGE_FORMAT", "Roll-up, backdrop or flex banner?", "Which display suits your event or shop.",
    h2("Roll-up banner") + p("Portable and quick to set up: entrances, stands and receptions.") + h2("Backdrop") + p("A large printed wall behind a stage or photo area.") + h2("Flex banner") + p("Weather-resistant, for outdoor signs and fences.")),
  guide("measuring-for-a-banner", "LARGE_FORMAT", "Measuring for a banner", "Measure the space, not the design.",
    h2("Measure the space") + p("Measure where it will hang or stand, then allow for fixings and a margin.") + h2("Check viewing distance") + p("Text read from far away needs to be bigger. We check this at proof.")),
  guide("planning-a-photo-wall", "LARGE_FORMAT", "Planning a photo wall", "Size, pattern and lighting for event photos.",
    h2("Size") + p("Wide enough for a group and tall enough to fill the frame behind people.") + h2("Pattern") + p("A repeating logo pattern shows in every photo, however it's cropped.")),
  guide("paper-bag-sizes-and-handles", "PACKAGING", "Paper bag sizes and handles", "Pick a bag that fits what you sell.",
    h2("Size") + p("Measure your largest item and add a little room.") + h2("Handles") + p("Twisted paper handles are strong and common; flat handles suit lighter items.")),
  guide("packaging-samples", "PACKAGING", "When to order a packaging sample", "See and hold it before the full run.",
    h2("Custom sizes") + p("Always sample a custom structure before a full run.") + h2("New finishes") + p("Sample when trying a new paper, coating or foil.")),
  guide("custom-packaging-what-to-prepare", "PACKAGING", "Custom packaging: what to prepare", "What we need to quote custom packaging.",
    h2("Tell us") + ul("What goes inside, with its size and weight", "How many you need", "Your artwork, or what it should look like", "When you need it")),
  guide("print-ready-artwork", "ORDERING", "How to prepare print-ready artwork", "Files, bleed and colours, so the proof is right first time.",
    h2("Send vector files where you can") + p("PDF, AI or SVG keep logos sharp at any size. PNG and JPEG work when they're large enough.") + h2("Bleed and safe area") + p("Extend backgrounds past the edge and keep text away from it; we show both on the proof.") + h2("Colours") + p("Screens show colour differently from print. We check colours on the proof before anything is made.")),
  guide("after-you-accept-a-quote", "ORDERING", "What happens after I accept a quote?", "Deposit, proofs, production and delivery, step by step.",
    h2("Deposit") + p("Paying the deposit books your order into production planning.") + h2("Proofs") + p("You approve the exact artwork for each item before it's made.") + h2("Production and delivery") + p("Each item goes through Quality Check, then the balance is due before dispatch.")),
  guide("how-proofs-work", "ORDERING", "How proofs work", "What a proof shows and what to check.",
    h2("What you see") + p("The artwork on the item, with its size, colours and position.") + h2("What to check") + ul("Spelling and names", "Colours and placement", "Size on the item") + h2("Changes") + p("Ask for changes on the proof. Nothing is made until you approve it.")),
];

const ABOUT: Page = {
  type: "ABOUT",
  slug: "about",
  title: "About HolyPearls",
  summary:
    "HolyPearls is a production company in Lagos. We cut and sew garments and print large format in our own production, and manage every other method to the same approved proof and Quality Check.",
  seoTitle: "About HolyPearls | Production in Lagos, delivery across Nigeria",
  data: {
    headline: "We make branded things for businesses, from the first idea to delivery.",
    capabilitiesTitle: "What we make",
    capabilitiesIntro: "Eight product families, from staff uniforms to wall art. 304 products at launch (test catalogue).",
    capabilities: [
      { name: "Cut and sew", detail: "Garments made from scratch", own: true },
      { name: "Large format", detail: "Banners, backdrops, displays", own: true },
      { name: "Embroidery", detail: "Logos, names, native wear", own: false },
      { name: "Print", detail: "Business cards, flyers, labels", own: false },
      { name: "Packaging", detail: "Bags, boxes, custom sets", own: false },
      { name: "Promotional products", detail: "Sourced and branded", own: false },
    ],
    stepsTitle: "How every order is made",
    steps: [
      { title: "Brief or configure", detail: "You tell us what you need, or choose options online" },
      { title: "Quote or price", detail: "Instant for simple items, reviewed for custom work" },
      { title: "Proof", detail: "You approve the exact artwork first" },
      { title: "Make and check", detail: "Every item goes through Quality Check" },
      { title: "Deliver", detail: "To one address or every branch" },
    ],
    teamTitle: "The team",
    teamBody: "Real people and roles are added once the team is photographed and has agreed to appear.",
    reachTitle: "Where we deliver",
    reachBody: "Made in Lagos. We deliver across Nigeria, and can ship internationally on request (test service area, to be confirmed).",
    valuesTitle: "How we work",
    values: [
      "You see the price or quote before you pay",
      "Nothing is made before you approve the proof",
      "Every item is checked before it leaves",
      "We say what we make ourselves, and what we manage",
    ],
    ctaTitle: "Tell us what you need made.",
  },
};

/** Checks each type's parts and fills the same defaults the editor uses. */
const withDefaults = (page: Page) => ({ ...page, body: page.body ?? "", data: CONTENT_DATA_SCHEMA[page.type].parse(page.data) as Record<string, unknown> });

export async function seedContent(tx: Transaction) {
  const existing = new Set((await tx.select({ type: schema.contentPages.type, slug: schema.contentPages.slug }).from(schema.contentPages)).map((row) => `${row.type}:${row.slug}`));
  const now = new Date();
  const pages = [...PROJECTS, ...CASE_STUDIES, ...GUIDES, ABOUT].map(withDefaults).filter((page) => !existing.has(`${page.type}:${page.slug}`));
  for (const page of pages) {
    const fields = {
      title: page.title,
      slug: page.slug,
      summary: page.summary,
      body: page.body,
      heroFileId: null,
      heroAlt: "",
      featured: page.featured ?? false,
      demo: page.demo ?? false,
      position: page.position ?? 0,
      seoTitle: page.seoTitle ?? "",
      seoDescription: page.seoDescription ?? "",
      canonicalPath: "",
      indexable: true,
      linkedProductIds: [] as string[],
      linkedPageIds: [] as string[],
      data: page.data,
    };
    await tx.insert(schema.contentPages).values({ type: page.type, status: "PUBLISHED", ...fields, published: fields, publishedAt: now });
  }
  // Links need every page in place first; they're only filled where a page has none yet.
  const products = await tx.select({ id: schema.products.id, slug: schema.products.slug }).from(schema.products);
  const rows = await tx.select().from(schema.contentPages);
  for (const page of [...PROJECTS, ...CASE_STUDIES, ...GUIDES, ABOUT].filter((entry) => entry.links)) {
    const row = rows.find((candidate) => candidate.type === page.type && candidate.slug === page.slug);
    if (!row || row.linkedProductIds.length || row.linkedPageIds.length) continue;
    const linkedProductIds = (page.links!.products ?? []).flatMap((slug) => products.filter((product) => product.slug === slug).map((product) => product.id));
    const linkedPageIds = (page.links!.pages ?? []).flatMap(([type, slug]) => rows.filter((candidate) => candidate.type === type && candidate.slug === slug).map((candidate) => candidate.id));
    const published = row.published ? { ...(row.published as Record<string, unknown>), linkedProductIds, linkedPageIds } : null;
    await tx.update(schema.contentPages).set({ linkedProductIds, linkedPageIds, published }).where(eq(schema.contentPages.id, row.id));
  }
}
