import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { ProductCard } from "../components/catalogue/ProductCard";
import s from "../components/home/home.module.css";
import { Icon } from "../components/pen/Icon";
import { categoryHref } from "../components/site/nav";
import { SuggestInput } from "../components/search/SearchSuggest";
import { SiteShell } from "../components/site/SiteShell";
import { getNavigation } from "../lib/storefront";

// Rendered per request so a build without the API never freezes empty menus; the API data itself is cached under tags.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "HolyPearls · Branded uniforms, print and merch" },
  description: "Order staff uniforms, event materials, business cards and signage in one place. See the price upfront and approve your design before we make anything.",
  alternates: { canonical: "/" },
};

/** Temporary reference photography from the Pen board (labelled on the page, as in the design). */
const photo = (n: number): CSSProperties => ({ backgroundImage: `url("/pen/generated-${n}.webp")` });

const OUTCOMES = [
  { title: "Staff uniforms", meta: "Polos, aprons and workwear for your whole team", href: categoryHref("apparel-garment-production"), photo: 50 },
  { title: "An event or conference", meta: "Backdrops, name badges, crew shirts", href: categoryHref("large-format-signage-displays"), photo: 48 },
  { title: "A product launch", meta: "Packaging, labels and launch kits", href: categoryHref("bags-packaging"), photo: 47 },
  { title: "Office or shop branding", meta: "Signs, wall graphics and displays", href: categoryHref("large-format-signage-displays"), photo: 45 },
  { title: "Gifts for staff or clients", meta: "Corporate gifts and welcome packs", href: categoryHref("promotional-products-corporate-gifts"), photo: 47 },
];

/** Category photos from the Pen board (desktop lead row and mobile thumbnails). */
const CATEGORY_PHOTO: Record<string, number> = {
  "apparel-garment-production": 44,
  "print-business-stationery": 37,
  "large-format-signage-displays": 34,
  "embroidery-garment-customization": 38,
  "bags-packaging": 47,
};

const SMBD = [
  ["source", "We find the right shirts, fabric or paper for your budget and deadline.", "The right shirts, fabric or paper."],
  ["make", "We cut and sew garments and print large-format graphics in our own production.", "We cut and sew garments ourselves."],
  ["brand", "Embroidery, screen printing, transfers or print, done exactly to the design you approved.", "Branded exactly to your approved design."],
  ["deliver", "Packed, labelled and delivered to one address or split across your branches.", "Delivered to one address or several."],
] as const;

const KIT = [
  ["×30", "Crew polos", "PROOF V2 APPROVED · IN PRODUCTION", "IN PRODUCTION", s.toneSuccess],
  ["×250", "Name badges", "PROOF V2 · AWAITING YOU", "PROOF V2 · AWAITING YOU", s.toneWarning],
  ["×1", "Main backdrop", "READY — AWAITING RELEASE", "READY — AWAITING RELEASE", s.toneInfo],
  ["×2", "Roll-up banners", "QUALITY CHECK", "QUALITY CHECK", s.toneMuted],
] as const;

const JOB = [
  ["PROJECT", "HP-P-2026-0142"],
  ["TYPE", "EVENT BRANDING"],
  ["SCALE", "250 GUESTS · 30 CREW"],
  ["QUOTE", "V2 · ACCEPTED"],
  ["ORDER", "HP-2026-0142"],
] as const;

const STEPS = [
  ["Plan", "Choose a product, or tell us what you need."],
  ["Configure", "Pick colours, quantities, artwork and your deadline."],
  ["Quote or pay", "See the price right away, or get a quote."],
  ["Proof", "Approve your design before anything is made."],
  ["Make and check", "Every item is checked before it leaves us."],
  ["Deliver", "To one address or several."],
] as const;

const FEATURES = [
  ["stamp", "Saved designs", "Logo fixed, quantities flexible"],
  ["users-round", "Size collection", "Staff enter their own sizes"],
  ["store", "Company store", "A private shop for your people"],
  ["badge-check", "Approvals", "Spending limits and sign-off"],
] as const;

const pad = (index: number) => String(index + 1).padStart(2, "0");
const PROJECT_HREF = "/contact?topic=project";

function SearchForm({ id, variant }: { id: string; variant: "hero" | "final" | "mHero" | "mFinal" }) {
  const hero = variant === "hero";
  if (variant === "mHero") {
    return (
      <form className={s.mIntent} role="search" action="/products">
        <Icon name="search" size={22} />
        <span className={s.query}>
          <span className={s.mSearchLabel} aria-hidden="true">
            WHAT DO YOU NEED MADE?
          </span>
          <SuggestInput id={id} className={s.mSearchInput} placeholder="Polos, backdrops, cards…" label="What do you need made?" />
        </span>
      </form>
    );
  }
  if (variant === "mFinal") {
    return (
      <form className={s.mFinalSearch} role="search" action="/products">
        <Icon name="search" size={20} />
        <SuggestInput id={id} className={s.mSearchInput} placeholder="Search products or ideas" label="Search products or ideas" />
      </form>
    );
  }
  return (
    <form className={hero ? s.intentSearch : s.finalSearch} role="search" action="/products">
      <Icon name="search" size={24} />
      {hero ? (
        <span className={s.query}>
          <span className={s.searchLabel} aria-hidden="true">
            WHAT DO YOU NEED MADE?
          </span>
          <SuggestInput id={id} className={s.searchInput} placeholder="Try “50 embroidered polos” or “event backdrop”" label="What do you need made?" />
        </span>
      ) : (
        <span className={s.query}>
          <SuggestInput id={id} className={s.searchInput} placeholder="Search products, materials or ideas" label="Search products, materials or ideas" />
        </span>
      )}
      <button type="submit" className={`${s.redButton} ${hero ? "" : s.inkSearchButton}`}>
        Search
      </button>
    </form>
  );
}

/**
 * Homepage (Pen 15 · FYNoI desktop, 16 · kZf2b mobile; PUB-FR-001, 002, 014).
 * Categories, "Popular" and "Most ordered" come from the catalogue (admin
 * managed); editorial photos are the design's labelled reference imagery.
 */
export default async function HomePage() {
  const navigation = await getNavigation();
  const categories = navigation.categories;
  const [lead, ...rest] = categories;
  return (
    <SiteShell>
      {/* ── Desktop (Pen 15) ── */}
      <div className={s.desk}>
        <section className={`${s.hero} ${s.pad}`} aria-labelledby="hero-title">
          <div className={s.heroTop}>
            <h1 id="hero-title" className={s.heroHeadline} data-enter>
              <span>Branded uniforms,</span>
              <span className={s.heroHeadlineMuted}>print and merch</span>
            </h1>
            <div className={s.heroAside} data-enter style={{ "--hp-enter-index": 1 } as CSSProperties}>
              <p className={s.heroBody}>
                Order staff uniforms, event materials, business cards and signage in one place. See the price upfront and approve your design before we make
                anything.
              </p>
              <div className={s.heroActions}>
                <a className={s.inkButton} href={PROJECT_HREF}>
                  Start a project
                  <Icon name="arrow-right" size={18} />
                </a>
                <a className={s.textLink} href="#how-it-works">
                  How it works
                </a>
              </div>
            </div>
          </div>
          <div className={s.intentRow}>
            <SearchForm id="home-search" variant="hero" />
            {navigation.popular.length ? (
              <div className={s.popular}>
                <span className={s.popularLabel}>POPULAR</span>
                {navigation.popular.slice(0, 3).map((product) => (
                  <a key={product.slug} className={s.chip} href={`/products/${product.slug}`}>
                    {product.name}
                  </a>
                ))}
              </div>
            ) : null}
          </div>
          <div className={`${s.heroMedia} ${s.photo}`} data-enter style={{ ...photo(51), "--hp-enter-index": 2 } as CSSProperties} role="img" aria-label="A cutter lays out fabric on a production table" />
          <p className={s.refNote}>TEMPORARY REFERENCE IMAGERY · NOT HOLYPEARLS PREMISES, EQUIPMENT OR CLIENTS</p>
        </section>

        <section className={`${s.outcomes} ${s.pad}`} aria-labelledby="needs-title">
          <div className={s.sectionHead}>
            <h2 id="needs-title" className={s.sectionTitle}>
              What do you need?
            </h2>
            <a className={s.headLink} href={PROJECT_HREF}>
              All projects →
            </a>
          </div>
          <div className={s.outcomeGrid}>
            <div className={`${s.outcomePhoto} ${s.photo}`} data-unveil style={photo(50)} role="img" aria-label="A team in branded uniforms at work" />
            <div className={s.outcomeSide}>
              <ol className={s.list}>
                {OUTCOMES.map((outcome, index) => (
                  <li key={outcome.title}>
                    <a className={s.outcomeRow} href={outcome.href}>
                      <span className={s.outcomeNo}>{pad(index)}</span>
                      <span className={s.outcomeText}>
                        <span className={s.outcomeTitle}>{outcome.title}</span>
                        <span className={s.outcomeMeta}>{outcome.meta}</span>
                      </span>
                      <Icon name="arrow-up-right" size={22} />
                    </a>
                  </li>
                ))}
              </ol>
              <p className={s.conceptNote}>Concept reference · not a client claim</p>
            </div>
          </div>
        </section>

        <section className={`${s.families} ${s.pad}`} aria-labelledby="categories-title">
          <div className={s.sectionHead}>
            <h2 id="categories-title" className={s.sectionTitle}>
              Shop by category
            </h2>
            <a className={s.headLink} href="/products">
              Browse all {navigation.totalProducts} products →
            </a>
          </div>
          <ol className={s.list}>
            {categories.map((category, index) => {
              const isLead = category === lead;
              return (
                <li key={category.slug}>
                  <a className={`${s.indexRow} ${isLead ? s.indexRowLead : ""}`} href={categoryHref(category.slug)}>
                    <span className={s.indexNum}>{pad(index)}</span>
                    <span className={s.indexText}>
                      <span className={`${s.indexTitle} ${isLead ? s.indexTitleLead : ""}`}>{category.name}</span>
                      {category.description ? <span className={`${s.indexSub} ${isLead ? s.indexSubLead : ""}`}>{category.description}</span> : null}
                    </span>
                    <span className={s.indexCount}>
                      {category.productCount} {category.productCount === 1 ? "product" : "products"}
                    </span>
                    {isLead ? <span className={`${s.indexPhoto} ${s.photo}`} style={photo(CATEGORY_PHOTO[category.slug] ?? 44)} aria-hidden="true" /> : null}
                    <span className={`${s.roundArrow} ${isLead ? s.roundArrowLead : ""}`} aria-hidden="true">
                      <Icon name="arrow-right" size={20} />
                    </span>
                  </a>
                </li>
              );
            })}
          </ol>
        </section>

        {navigation.mostOrdered.length ? (
          <section className={`${s.popularProducts} ${s.pad}`} aria-labelledby="popular-title">
            <div className={s.sectionHead}>
              <h2 id="popular-title" className={s.sectionTitle}>
                Most ordered
              </h2>
              <a className={s.headLink} href="/products?sort=popular">
                See all →
              </a>
            </div>
            <ul className={`${s.list} ${s.productRow}`}>
              {navigation.mostOrdered.slice(0, 4).map((product) => (
                <li key={product.slug}>
                  <ProductCard product={product} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section id="how-its-made" className={s.smbd} aria-labelledby="made-title">
          <div className={`${s.immersive} ${s.pad}`}>
            <p className={s.refFlag}>Temporary reference image · not holypearls premises</p>
            <h2 id="made-title" className={s.immersiveTitle}>
              You brief us once.
              <br />
              We handle the rest.
            </h2>
          </div>
          <ol className={`${s.list} ${s.smbdColumns} ${s.pad}`}>
            {SMBD.map(([title, body], index) => (
              <li key={title} className={s.smbdColumn}>
                <span className={s.smbdNum}>
                  {pad(index)} · {title}
                </span>
                <p className={s.smbdBody}>{body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className={`${s.story} ${s.pad}`} aria-labelledby="story-title">
          <div className={s.storyText}>
            <p className={s.eyebrow}>PROJECT STORY · ANNUAL BUSINESS CONFERENCE · 250 ATTENDEES</p>
            <h2 id="story-title" className={s.storyTitle}>
              One event,
              <br />
              one order
            </h2>
            <p className={s.storyBody}>Crew shirts, name badges, a backdrop and roll-ups. Put them in one project, get one quote, and approve each item before it&apos;s made.</p>
            <ul className={s.list}>
              {KIT.map(([qty, name, state, , tone]) => (
                <li key={name} className={s.kitRow}>
                  <span className={s.kitQty}>{qty}</span>
                  <span className={s.kitName}>{name}</span>
                  <span className={`${s.kitState} ${tone}`}>{state}</span>
                </li>
              ))}
            </ul>
            <a className={s.outlineButton} href={PROJECT_HREF}>
              Plan an event order
            </a>
          </div>
          <div className={`${s.storyPhoto} ${s.photo}`} data-unveil style={photo(43)}>
            <span className={s.ticket}>CONCEPT REFERENCE · NOT A CLIENT CLAIM</span>
            <dl className={s.jobTicket}>
              {JOB.map(([key, value]) => (
                <div key={key} className={s.jobLine}>
                  <dt className={s.jobKey}>{key}</dt>
                  <dd className={s.jobValue}>{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section id="how-it-works" className={`${s.how} ${s.pad}`} aria-labelledby="steps-title">
          <div className={s.sectionHead}>
            <h2 id="steps-title" className={`${s.sectionTitle} ${s.howTitle}`}>
              How ordering works
            </h2>
            <a className={s.headLink} href="/help">
              How it works →
            </a>
          </div>
          <ol className={`${s.list} ${s.steps}`}>
            {STEPS.map(([title, body], index) => (
              <li key={title} className={s.step}>
                <span className={s.bar} aria-hidden="true">
                  <span className={`${s.node} ${title === "Proof" ? s.nodeAccent : ""}`} />
                  <span className={s.barLine} />
                </span>
                <span className={s.stepNum}>{pad(index)}</span>
                <h3 className={s.stepTitle}>{title}</h3>
                <p className={s.stepBody}>{body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className={`${s.made} ${s.pad}`} aria-labelledby="production-title">
          <div className={s.registration} aria-hidden="true">
            <Icon name="crosshair" size={14} />
            <span>PRODUCTION EVIDENCE</span>
            <span className={s.registrationLine} />
            <span>CORE + MANAGED METHODS</span>
          </div>
          <div className={s.sectionHead}>
            <h2 id="production-title" className={s.madeTitle}>
              How it&apos;s made
            </h2>
            <a className={`${s.headLink} ${s.headLinkLight}`} href="#how-its-made">
              See our production →
            </a>
          </div>
          <div className={`${s.macroPhoto} ${s.photo}`} data-unveil style={photo(52)}>
            <span className={s.ticket}>EMBROIDERY · SHOWN AT DETAIL SCALE</span>
            <span className={`${s.refFlag} ${s.refFlagMono}`}>TEMPORARY REFERENCE IMAGE · REAL SHOOT REQUIRED</span>
          </div>
          <div className={s.register}>
            <div className={s.registerText}>
              <div className={s.core}>
                <p className={s.coreLabel}>OUR CORE PRODUCTION</p>
                <p className={s.coreItem}>Garments cut and sewn from scratch</p>
                <p className={s.coreItem}>Large-format printing</p>
              </div>
              <div className={s.methodsBlock}>
                <p className={s.methodsLabel}>EVERY METHOD, ONE STANDARD</p>
                <p className={s.methods}>
                  Embroidery · Screen printing · Heat transfer · Paper print &amp; business cards · Specialist finishing · Packaging · Promotional objects · Signage
                  fabrication &amp; installation
                </p>
                <p className={s.standard}>Whatever the method, we make it to your approved design, check it and deliver it.</p>
              </div>
            </div>
            <div className={`${s.largePhoto} ${s.photo}`} data-unveil style={photo(45)}>
              <span className={s.squareTicket}>LARGE FORMAT · CORE CAPABILITY</span>
              <span className={`${s.refFlag} ${s.refFlagMono}`}>TEMPORARY REFERENCE IMAGE</span>
            </div>
          </div>
        </section>

        <section className={`${s.b2b} ${s.pad}`} aria-labelledby="b2b-title">
          <div className={s.b2bText}>
            <p className={s.eyebrow}>FOR TEAMS THAT ORDER AGAIN</p>
            <h2 id="b2b-title" className={s.b2bTitle}>
              Reorder in
              <br />
              minutes
            </h2>
            <p className={s.storyBody}>
              Give your company its own HolyPearls account. Save approved designs, collect staff sizes online, set spending limits and run a staff store. Your
              next order takes minutes instead of weeks of emails.
            </p>
            <ul className={s.list}>
              {FEATURES.map(([icon, title, meta]) => (
                <li key={title} className={s.feature}>
                  <Icon name={icon} size={22} />
                  <span className={s.featureTitle}>{title}</span>
                  <span className={s.featureMeta}>{meta}</span>
                </li>
              ))}
            </ul>
            <div className={s.b2bActions}>
              <a className={s.inkButton} href="/contact?topic=business">
                Set up a company account
              </a>
              <a className={s.textLink} href="/contact?topic=business">
                Talk to our business team
              </a>
            </div>
          </div>
          <div className={s.workspace} aria-label="Example company workspace" role="img">
            <div className={s.org}>
              <span className={s.orgMark}>AC</span>
              <div>
                <p className={s.orgName}>ACME Hospitality Group · Workspace</p>
                <p className={s.orgMeta}>TEMPLATES · 5 APPROVED</p>
              </div>
            </div>
            <div className={s.templates}>
              {[
                ["Staff Polo — Navy", "ACME logo V4 · left chest", 49],
                ["Apron — ACME template", "ACME logo V4 · embroidered", 44],
              ].map(([title, lock, n]) => (
                <div key={title} className={s.template}>
                  <span className={`${s.templatePhoto} ${s.photo}`} style={photo(n as number)} />
                  <p className={s.templateTitle}>{title}</p>
                  <span className={s.locked}>
                    <Icon name="lock" size={14} />
                    {lock}
                  </span>
                  <span className={s.templateButton}>Order again</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className={`${s.final} ${s.pad}`} aria-labelledby="final-title">
          <h2 id="final-title" className={s.finalTitle}>
            What do you need made?
          </h2>
          <SearchForm id="final-search" variant="final" />
          <a className={s.finalAlt} href={PROJECT_HREF}>
            <span className={s.finalAltQ}>Not sure yet?</span>
            Start a project and we&apos;ll help →
          </a>
        </section>
      </div>

      {/* ── Mobile (Pen 16) ── */}
      <div className={s.mob}>
        <section className={s.mHero} aria-labelledby="m-hero-title">
          <h1 id="m-hero-title" className={s.mHeadline} data-enter>
            Branded uniforms, print and merch
          </h1>
          <SearchForm id="m-home-search" variant="mHero" />
          <a className={s.mFullButton} href={PROJECT_HREF}>
            Start a project
            <Icon name="arrow-right" size={18} />
          </a>
        </section>
        <div className={s.mHeroMedia}>
          <div className={`${s.mHeroPhoto} ${s.photo}`} style={photo(51)} role="img" aria-label="A cutter lays out fabric on a production table">
            <span className={s.mCap}>Temporary reference image · poster frame</span>
          </div>
        </div>

        <section className={s.mOutcomes} aria-labelledby="m-needs-title">
          <h2 id="m-needs-title" className={s.mTitle}>
            What do you need?
          </h2>
          <ul className={s.mSwipe}>
            {OUTCOMES.slice(0, 3).map((outcome) => (
              <li key={outcome.title} style={{ display: "contents" }}>
                <a className={s.mOutcome} href={outcome.href}>
                  <span className={`${s.mOutcomePhoto} ${s.photo}`} style={photo(outcome.photo)} />
                  <span className={s.mRow}>
                    {outcome.title}
                    <Icon name="arrow-right" size={20} />
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section className={s.mFamilies} aria-labelledby="m-categories-title">
          <h2 id="m-categories-title" className={s.mTitle}>
            Shop by category
          </h2>
          <ul className={s.list}>
            {categories.slice(0, 4).map((category, index) => (
              <li key={category.slug}>
                <a className={s.mCat} href={categoryHref(category.slug)}>
                  <span className={`${s.mCatPhoto} ${s.photo}`} style={CATEGORY_PHOTO[category.slug] ? photo(CATEGORY_PHOTO[category.slug]!) : undefined} />
                  <span className={s.mCatText}>
                    <span className={s.mCatTitle}>{category.name}</span>
                    <span className={s.mCatMeta}>
                      {pad(index)} · {category.productCount} {category.productCount === 1 ? "product" : "products"}
                    </span>
                  </span>
                  <Icon name="chevron-right" size={20} />
                </a>
              </li>
            ))}
          </ul>
          {rest.length > 3 ? (
            <a className={s.mMore} href="/products">
              + {categories.slice(4).map((category) => category.name.split(" ")[0]).join(", ")}. See all {navigation.totalProducts} products →
            </a>
          ) : null}
        </section>

        {navigation.mostOrdered.length ? (
          <section className={s.mPopular} aria-labelledby="m-popular-title">
            <h2 id="m-popular-title" className={s.mTitle}>
              Most ordered
            </h2>
            <ul className={`${s.list} ${s.mPairs}`}>
              {navigation.mostOrdered.slice(0, 4).map((product) => (
                <li key={product.slug}>
                  <ProductCard product={product} tight />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className={s.mSmbd} aria-labelledby="m-made-title">
          <h2 id="m-made-title" className={`${s.mTitle} ${s.mTitleLight}`}>
            You brief us once.
            <br />
            We handle the rest.
          </h2>
          <div className={`${s.mSewing} ${s.photo}`} data-unveil style={photo(46)} role="img" aria-label="Sewing machinists at work" />
          <ol className={`${s.list} ${s.mGap24}`}>
            {SMBD.map(([title, , short], index) => (
              <li key={title} className={s.mSmbdRow}>
                <span className={s.mSmbdHead}>
                  <span className={s.mSmbdNum}>{pad(index)}</span>
                  <h3 className={s.mSmbdTitle}>{title[0]!.toUpperCase() + title.slice(1)}</h3>
                </span>
                <p className={s.mSmbdBody}>{short}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className={s.mStory} aria-labelledby="m-story-title">
          <div className={`${s.mEventPhoto} ${s.photo}`} data-unveil style={photo(43)}>
            <span className={s.mTicket}>CONCEPT REFERENCE</span>
          </div>
          <h2 id="m-story-title" className={s.mTitle}>
            One event,
            <br />
            one order
          </h2>
          <ul className={`${s.list} ${s.mGap18}`}>
            {KIT.map(([qty, name, , short, tone]) => (
              <li key={name} className={s.mKit}>
                <span className={s.mKitQty}>{qty}</span>
                <span className={s.kitName}>{name === "Roll-up banners" ? "Roll-ups" : name}</span>
                <span className={`${s.mKitState} ${tone}`}>{short}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className={s.mHow} aria-labelledby="m-steps-title">
          <h2 id="m-steps-title" className={s.mTitle}>
            How ordering works
          </h2>
          <ol className={`${s.list} ${s.mGap20}`}>
            {STEPS.map(([title], index) => (
              <li key={title} className={s.mStep}>
                <span className={`${s.mNode} ${title === "Proof" ? s.mNodeAccent : ""}`}>{pad(index)}</span>
                {title}
              </li>
            ))}
          </ol>
        </section>

        <section className={s.mMade} aria-labelledby="m-production-title">
          <h2 id="m-production-title" className={`${s.mTitle} ${s.mTitleLight}`}>
            How it&apos;s made
          </h2>
          <div className={`${s.mMacro} ${s.photo}`} data-unveil style={photo(52)}>
            <span className={s.mTicket}>EMBROIDERY · DETAIL SCALE · TEMP REFERENCE</span>
          </div>
          <div className={`${s.mLarge} ${s.photo}`} data-unveil style={photo(45)}>
            <span className={s.mTicket}>LARGE FORMAT · CORE CAPABILITY</span>
          </div>
          <div className={s.mCapability}>
            <p className={s.coreLabel}>OUR CORE PRODUCTION</p>
            <p className={s.mCore}>We cut and sew garments and print large-format graphics ourselves</p>
            <p className={s.mMethods}>
              We also handle embroidery, screen printing, transfers, business cards, packaging, gifts and signage. Everything is made to your approved design and
              checked before it leaves us.
            </p>
          </div>
        </section>

        <section className={s.mB2b} aria-labelledby="m-b2b-title">
          <h2 id="m-b2b-title" className={s.mTitle}>
            Reorder in
            <br />
            minutes
          </h2>
          <p className={s.mB2bBody}>Save approved designs, collect staff sizes online and run a staff store.</p>
          <ul className={`${s.list} ${s.mGap18}`}>
            {FEATURES.map(([icon, title]) => (
              <li key={title} className={s.mFeature}>
                <Icon name={icon} size={20} />
                {title}
              </li>
            ))}
          </ul>
          <a className={s.mFullButton} href="/contact?topic=business">
            Set up a company account
          </a>
        </section>

        <section className={s.mFinal} aria-labelledby="m-final-title">
          <h2 id="m-final-title" className={s.mFinalTitle}>
            What do you need made?
          </h2>
          <SearchForm id="m-final-search" variant="mFinal" />
          <a className={s.mFinalLink} href={PROJECT_HREF}>
            Not sure yet? Start a project →
          </a>
        </section>
      </div>
    </SiteShell>
  );
}
