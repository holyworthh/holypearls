import type { Metadata } from "next";
import type { CSSProperties } from "react";
import s from "../components/home/home.module.css";
import { HeroSearch } from "../components/home/HeroSearch";
import { PauseMotion } from "../components/motion/Motion";
import { PoloPicker } from "../components/home/PoloPicker";
import { Icon, type IconName } from "../components/pen/Icon";
import { JsonLd } from "../components/seo/JsonLd";
import { categoryHref, projectHref } from "../components/site/nav";
import { SiteShell } from "../components/site/SiteShell";
import { organizationLd, websiteLd } from "../lib/seo";

// Rendered per request so a build without the API never freezes empty menus (the shell reads the catalogue navigation).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Custom Uniforms, Merch & Printing in Nigeria | Holypearls" },
  description: "Branded polos, event banners, business cards and packaging for businesses across Nigeria. Get a price in minutes and approve your proof before anything is made.",
  alternates: { canonical: "/" },
};

const PROJECT_HREF = "/start";
const img = (name: string) => `/ledger/${name}.jpg`;
const index = (i: number) => ({ "--hp-reveal-index": i }) as CSSProperties;

/* Fabric swatches floating in the hero (desktop shows six, mobile three). */
const SWATCHES = [
  { name: "Kente weave", code: "HP·271", photo: "swatch-kente", mobile: true },
  { name: "Fabric library", code: "HP·572", photo: "swatch-fabric-library", mobile: false },
  { name: "Thread", code: "HP·700", photo: "swatch-thread", mobile: true },
  { name: "Colourways", code: "HP·280", photo: "swatch-colourways", mobile: true },
  { name: "Embroidery", code: "HP·242", photo: "swatch-embroidery", mobile: false },
  { name: "Prints", code: "HP·740", photo: "swatch-prints", mobile: false },
];

const MAKES = ["Polo shirts", "Chef jackets", "Business cards", "Roll-up banners", "Event badges", "Hoodies", "Tote bags", "Custom boxes", "Caps", "Front-desk uniforms", "Notebooks", "Backdrops"];

/*
 * Goal routes (PUB-FR-002): uniforms, events, business launch, merchandise,
 * packaging and custom projects. Tiles and chips go to the real project pages
 * and category hubs.
 */
const TILES = [
  { title: "Custom uniforms", sub: "Polos from ₦8,500", href: projectHref("staff-team-branding"), photo: "tile-uniforms", tone: s.toneSun, wide: true },
  { title: "T-shirts & hoodies", sub: "Tees, hoodies and caps", href: categoryHref("apparel-garment-production"), photo: "tile-tees", tone: s.toneCoral },
  { title: "Event branding", sub: "Backdrops to badges", href: projectHref("event-branding"), photo: "tile-events", tone: s.toneSage },
  { title: "Custom packaging", sub: "Standard or bespoke", href: categoryHref("bags-packaging"), photo: "tile-packaging", tone: s.toneLilac },
  { title: "Branded merch", sub: "Caps, totes, gifts", href: projectHref("corporate-gifts"), photo: "tile-merch", tone: s.toneBlue },
  { title: "Something custom", sub: "Describe it", href: "/contact?topic=custom-request", photo: "tile-custom", tone: s.toneInk, wide: true },
];

const CHIPS: [string, string][] = [
  ["staff uniforms", projectHref("staff-team-branding")],
  ["event banners", projectHref("event-branding")],
  ["souvenirs", projectHref("corporate-gifts")],
  ["business cards", projectHref("business-launch")],
];

/* Price states (PRD 00 §8): each card carries its status word and icon, never colour alone. */
const WAYS = [
  { badge: "✓ Fixed price", tone: s.badgeReady, title: "Buy it now", body: "See the exact price and pay.", examples: "Business cards, roll-up banners" },
  { badge: "≈ Estimate", tone: s.badgeEstimate, title: "Get an estimate", body: "Live estimate, final quote before you pay.", examples: "Embroidered polos, caps" },
  { badge: "Let’s talk", tone: s.badgeTalk, title: "Start a project", body: "Tell us the goal. We quote it all.", examples: "Events, uniform rollouts" },
];

const STEPS: [IconName, string, string][] = [
  ["list", "Choose", "Pick a product or describe your project."],
  ["tag", "Price", "Pay a fixed price or get a quote."],
  ["circle-check", "Approve", "See your proof before we start."],
  ["truck", "Delivered", "Made, checked and sent to your door."],
];

const INDUSTRIES = ["Schools", "Hotels", "Restaurants", "Churches", "Hospitals", "Banks", "Security", "Events", "Startups", "Salons", "Logistics", "NGOs"];

/* Concept references until real client work is photographed (shoot deferred); no client is named or claimed. */
const WORK = [
  { photo: "work-staff-uniforms", detail: "Staff uniforms · 3 branches" },
  { photo: "tile-events", detail: "Conference branding · 250 guests" },
  { photo: "tile-uniforms", detail: "Embroidered polos · retail team" },
  { photo: "tile-packaging", detail: "Custom gift boxes · launch" },
  { photo: "tile-tees", detail: "Event tees · 5k run" },
];

const CITIES = ["Lagos", "Abuja", "Port Harcourt", "Ibadan", "Kano", "Enugu", "Benin City", "Kaduna"];

const FAQS: [string, string][] = [
  ["How much do custom polo shirts cost?", "Embroidered polos start from ₦8,500 each. Your exact estimate updates as you choose."],
  ["What is the minimum order?", "It depends on the product. Polos start at 10, business cards at 100."],
  ["How long does production take?", "Most items take 3–7 working days after you approve your proof. Delivery time is shown separately."],
  ["Can I see my design before it’s made?", "Yes. Every order gets a production proof to approve first."],
  ["Do I need an account to order?", "No. You can order as a guest and track everything by email link."],
];

function Arrow() {
  return <Icon name="arrow-right" size={18} className={s.arrow} />;
}

function Stamp({ className }: { className?: string }) {
  return (
    <span className={`${s.stamp} ${className ?? ""}`} aria-hidden="true">
      <svg viewBox="0 0 26 26" className={s.stampMark}>
        <circle cx="13" cy="13" r="7" />
        <path d="M13 2v22M2 13h22" />
      </svg>
      <span className={s.stampLine} data-line="MADE &" />
      <span className={s.stampLine} data-line="CHECKED" />
    </span>
  );
}

/**
 * Homepage (Pen Stage 4.3 · F01 Homepage desktop 1440 ZqhyZ and mobile 390
 * Y0ftk8, from the owner's Ledger canvas; PUB-FR-001, 002, 014).
 */
export default function HomePage() {
  return (
    <SiteShell>
      <JsonLd data={[organizationLd(), websiteLd()]} />

      <section className={`${s.hero} hp-surface-dark`} aria-labelledby="hero-title">
        <div className={s.swatches} aria-hidden="true">
          {SWATCHES.map((swatch, i) => (
            <figure key={swatch.name} className={`${s.swatchCard} ${s[`swatch${i + 1}`]} ${swatch.mobile ? "" : s.deskOnly}`}>
              <span className={s.swatchPhoto} style={{ backgroundImage: `url("${img(swatch.photo)}")` }} />
              <figcaption className={s.swatchCaption}>
                <span>{swatch.name}</span>
                <span className={s.swatchCode}>{swatch.code}</span>
              </figcaption>
            </figure>
          ))}
          <Stamp className={s.heroStamp} />
        </div>
        <div className={s.heroCopy}>
          <p className={s.heroBadge}>
            <span className={s.dot} />
            <span className={s.deskOnly}>CUSTOM APPAREL, EMBROIDERY &amp; PRINTING IN NIGERIA</span>
            <span className={s.mobOnly}>CUSTOM APPAREL &amp; PRINTING IN NIGERIA</span>
          </p>
          <h1 id="hero-title" className={s.heroTitle} data-enter>
            Custom uniforms, merch &amp; print,{" "}
            <span className={s.highlight}>
              made for you.
              <svg className={s.stitch} viewBox="0 0 420 18" preserveAspectRatio="none" aria-hidden="true">
                <path d="M4 12 C 120 2, 300 2, 416 10" />
              </svg>
            </span>
          </h1>
          <p className={s.heroLede} data-enter style={{ "--hp-enter-index": 1 } as CSSProperties}>
            <span className={s.deskOnly}>Branded polos, event banners, business cards and packaging. Get a price in minutes.</span>
            <span className={s.mobOnly}>Branded polos, banners, business cards and packaging. Get a price in minutes.</span>
          </p>
          <form className={s.heroSearch} role="search" action="/search" data-enter style={{ "--hp-enter-index": 2 } as CSSProperties}>
            <label className={s.heroSearchLabel} htmlFor="home-search">
              What do you need made?
            </label>
            <div className={s.heroField}>
              <Icon name="search" size={20} className={s.heroFieldIcon} />
              <HeroSearch id="home-search" inputClassName={s.heroInput} />
              <button type="submit" className={`${s.searchButton} ${s.deskOnly}`}>
                Search
              </button>
            </div>
          </form>
          <div className={s.heroActions} data-enter style={{ "--hp-enter-index": 3 } as CSSProperties}>
            <a className={`${s.button} ${s.whiteButton}`} href={PROJECT_HREF}>
              Start a Project
              <Arrow />
            </a>
            <a className={s.heroLink} href="#how">
              How it works
            </a>
          </div>
        </div>
      </section>
      <div className={s.woven} aria-hidden="true" />

      <div className={s.marquee} aria-label="Things we make">
        <ul className={s.marqueeTrack}>
          {[...MAKES, ...MAKES].map((make, i) => (
            <li key={`${make}-${i}`} className={s.marqueeItem} aria-hidden={i >= MAKES.length || undefined}>
              {make}
              <span className={s.star} aria-hidden="true">
                ✺
              </span>
            </li>
          ))}
        </ul>
        <PauseMotion className={s.motionToggle} />
      </div>

      <section className={s.section} aria-labelledby="shop-title">
        <div className={s.headRow} data-reveal>
          <div className={s.heading}>
            <p className={s.eyebrow}>Shop by category</p>
            <h2 id="shop-title" className={s.sectionTitle}>
              Custom apparel, print &amp; packaging
            </h2>
          </div>
          <ul className={s.chips}>
            {CHIPS.map(([label, href]) => (
              <li key={label}>
                <a className={s.chip} href={href}>
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </div>
        <ul className={s.tiles}>
          {TILES.map((tile, i) => (
            <li key={tile.title} className={`${tile.wide ? s.tileWide : ""} ${i === 5 ? s.tileLast : ""}`} data-reveal style={index(i % 3)}>
              <a className={`${s.tile} ${tile.tone}`} href={tile.href}>
                <span className={s.tileTop}>
                  <span className={s.tileText}>
                    <span className={s.tileTitle}>{tile.title}</span>
                    <span className={s.tileSub}>{tile.sub}</span>
                  </span>
                  <span className={s.tileArrow} aria-hidden="true">
                    <Arrow />
                  </span>
                </span>
                <span className={s.tilePhoto}>
                  <span className={s.zoomImage} style={{ backgroundImage: `url("${img(tile.photo)}")` }} />
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className={s.section} aria-labelledby="try-title">
        <PoloPicker />
      </section>

      <section className={s.section} aria-labelledby="ways-title">
        <div className={s.heading} data-reveal>
          <p className={s.eyebrow}>Pricing, simply</p>
          <h2 id="ways-title" className={s.sectionTitle}>
            Three ways to order
          </h2>
        </div>
        <ul className={s.ways}>
          {WAYS.map((way, i) => (
            <li key={way.title} className={s.way} data-reveal style={index(i)}>
              <span className={`${s.badge} ${way.tone}`}>{way.badge}</span>
              <h3 className={s.wayTitle}>{way.title}</h3>
              <p className={s.wayBody}>{way.body}</p>
              <p className={s.wayExamples}>{way.examples}</p>
            </li>
          ))}
        </ul>
      </section>

      <section id="how" className={s.section} aria-labelledby="how-title">
        <div className={s.headRow} data-reveal>
          <div className={s.heading}>
            <p className={s.eyebrow}>How custom orders work</p>
            <h2 id="how-title" className={s.sectionTitle}>
              From idea to doorstep in four steps
            </h2>
          </div>
          <a className={`${s.button} ${s.inkButton} ${s.buttonSm} ${s.deskOnly}`} href={PROJECT_HREF}>
            Start a Project
            <Arrow />
          </a>
        </div>
        <div className={s.stepsWrap}>
          <span className={s.thread} data-reveal="clip" aria-hidden="true" />
          <ol className={s.steps}>
            {STEPS.map(([icon, title, body], i) => (
              <li key={title} className={s.step} data-reveal style={index(i)}>
                <span className={s.stepIcon}>
                  <Icon name={icon} size={26} />
                </span>
                <span className={s.stepText}>
                  <span className={s.stepNo}>STEP {i + 1}</span>
                  <span className={s.stepTitle}>{title}</span>
                  <span className={s.stepBody}>{body}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
        <a className={`${s.button} ${s.brickButton} ${s.mobOnly} ${s.fullMobile}`} href={PROJECT_HREF}>
          Start a Project
          <Arrow />
        </a>
      </section>

      <section className={`${s.section} ${s.split}`} aria-labelledby="made-title">
        <div className={s.splitCopy} data-reveal>
          <p className={s.eyebrow}>Made by people</p>
          <h2 id="made-title" className={s.splitTitle}>
            Real workshops. Your approval first.
          </h2>
          <p className={s.bodyPlus}>Every order gets a production proof. Nothing is stitched or printed until you say yes.</p>
          <a className={`${s.button} ${s.outlineButton} ${s.fullMobile}`} href="/about">
            See how it’s made
            <Arrow />
          </a>
        </div>
        <div className={s.workshops}>
          {[
            ["workshop-cut-sew", "Cut & sew"],
            ["workshop-screen-print", "Screen print"],
            ["workshop-checked-packed", "Checked & packed"],
          ].map(([photo, label], i) => (
            <figure key={label} className={`${s.workshop} ${i === 0 ? s.workshopTall : ""}`} data-reveal style={index(i)}>
              <span className={s.zoomImage} style={{ backgroundImage: `url("${img(photo!)}")` }} role="img" aria-label={label} />
              <figcaption className={s.photoLabel}>{label}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className={`${s.section} ${s.corporate}`} aria-labelledby="corporate-title">
        <div className={s.corporatePhoto} data-reveal>
          <span className={s.zoomImage} style={{ backgroundImage: `url("${img("corporate-kitchen")}")` }} role="img" aria-label="Kitchen team in matching chef uniforms" />
          <span className={s.cropsLight} aria-hidden="true" />
        </div>
        <div className={s.splitCopy} data-reveal style={index(1)}>
          <p className={s.eyebrow}>Corporate uniforms</p>
          <h2 id="corporate-title" className={s.splitTitle}>
            Branded uniforms for every team
          </h2>
          <p className={s.bodyPlus}>One look across every branch. Reorder in two clicks.</p>
          <ul className={s.industries}>
            {INDUSTRIES.map((industry) => (
              <li key={industry}>
                <a className={`${s.chip} ${s.chipLg}`} href={projectHref("staff-team-branding")}>
                  {industry}
                </a>
              </li>
            ))}
          </ul>
          <a className={`${s.button} ${s.blueButton} ${s.fullMobile}`} href="/contact?topic=business">
            Set up a Brand Workspace
            <Arrow />
          </a>
        </div>
      </section>

      <section className={`${s.section} ${s.work}`} aria-labelledby="work-title">
        <div className={`${s.headRow} ${s.workHead}`} data-reveal>
          <div className={s.heading}>
            <p className={s.eyebrow}>Our work</p>
            <h2 id="work-title" className={s.sectionTitle}>
              Made for teams like yours
            </h2>
          </div>
          <a className={`${s.button} ${s.outlineButton} ${s.buttonSm} ${s.deskOnly}`} href="/our-work">
            See all projects
            <Arrow />
          </a>
          <a className={`${s.heroLink} ${s.inkLink} ${s.mobOnly}`} href="/our-work">
            See all
          </a>
        </div>
        <ul className={s.rail} tabIndex={0} aria-label="Recent projects">
          {WORK.map((item, i) => (
            <li key={item.detail} data-reveal style={index(i)}>
              <a className={s.project} href="/our-work">
                <span className={s.projectPhoto}>
                  <span className={s.zoomImage} style={{ backgroundImage: `url("${img(item.photo)}")` }} />
                </span>
                <span className={s.projectTitle}>{item.detail}</span>
                <span className={s.projectMeta}>Concept reference</span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className={`${s.section} ${s.help}`} aria-label="Delivery and questions">
        <div className={s.delivery} data-reveal>
          <p className={s.eyebrow}>Delivery</p>
          <h2 className={s.deliveryTitle}>Custom printing, delivered across Nigeria</h2>
          <p className={s.deliveryBody}>
            Nationwide delivery, rates shown at checkout.<span className={s.deskOnly}> International freight is confirmed in your quote.</span>
          </p>
          <ul className={s.cities}>
            {CITIES.map((city) => (
              <li key={city} className={s.city}>
                {city}
              </li>
            ))}
            <li className={`${s.city} ${s.cityMore}`}>+ everywhere else</li>
          </ul>
        </div>
        <div className={s.faq}>
          <h2 className={s.faqTitle} data-reveal>
            Frequently asked questions
          </h2>
          <div className={s.faqList} data-reveal style={index(1)}>
            {FAQS.map(([question, answer], i) => (
              <details key={question} className={s.faqItem} open={i === 0}>
                <summary className={s.faqQuestion}>
                  <span>{question}</span>
                  <span className={s.plus} aria-hidden="true">
                    <Icon name="plus" size={16} />
                  </span>
                </summary>
                <p className={s.faqAnswer}>{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className={s.describe} aria-labelledby="describe-title">
        <div className={s.describeCopy} data-reveal>
          <h2 id="describe-title" className={s.describeTitle}>
            Not sure what to call it? Describe it.
          </h2>
          <p className={s.describeBody}>We’ll recommend products and send one clear quote.</p>
        </div>
        <div className={s.describePhoto} data-reveal style={index(1)}>
          <span className={s.zoomImage} style={{ backgroundImage: `url("${img("cta-describe")}")` }} role="img" aria-label="Designer in a bold printed outfit" />
        </div>
        <div className={s.describeActions}>
          <a className={`${s.button} ${s.inkButton}`} href={PROJECT_HREF}>
            Start a Project
            <Arrow />
          </a>
          <a className={`${s.button} ${s.lineButton}`} href="/contact">
            Chat with us
          </a>
        </div>
      </section>
    </SiteShell>
  );
}
