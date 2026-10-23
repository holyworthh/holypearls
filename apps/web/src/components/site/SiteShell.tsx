import { SkipLink } from "@holypearls/ui";
import type { ReactNode } from "react";
import { getNavigation } from "../../lib/storefront";
import { Icon } from "../pen/Icon";
import footer from "./footer.module.css";
import { LogoFull } from "./Logo";
import { buildNavigation, categoryHref, projectHref } from "./nav";
import { Newsletter } from "./Newsletter";
import { SiteHeader } from "./SiteHeader";
import styles from "./site.module.css";

/**
 * Delivery coverage (PUB-FR-014): accurate, with no promised times or prices.
 * Exact costs and dates are shown at checkout or in the quote.
 */
export const DELIVERY_COVERAGE =
  "We deliver across Nigeria and can arrange international shipping. Delivery costs and dates depend on the order and the address, and are confirmed at checkout or in your quote.";

const FOOTER_COLUMNS: { id: string; head: string; links: [string, string][] }[] = [
  {
    id: "products",
    head: "PRODUCTS",
    links: [
      ["Apparel & garment", categoryHref("apparel-garment-production")],
      ["Print & stationery", categoryHref("print-business-stationery")],
      ["Large format & displays", categoryHref("large-format-signage-displays")],
      ["Bags & packaging", categoryHref("bags-packaging")],
      ["All products", "/products"],
    ],
  },
  {
    id: "projects",
    head: "PROJECTS",
    links: [
      ["Start a Project", "/start"],
      ["Staff uniforms", projectHref("staff-team-branding")],
      ["Events", projectHref("event-branding")],
      ["Brand launches", projectHref("business-launch")],
      ["Gifts & kits", projectHref("corporate-gifts")],
    ],
  },
  {
    id: "company",
    head: "COMPANY",
    links: [
      ["Our Work", "/our-work"],
      ["How it works", "/about#how-we-work"],
      ["Production studio", "/about"],
      ["Resources", "/resources"],
      ["Contact", "/contact"],
    ],
  },
  {
    id: "help",
    head: "HELP",
    links: [
      ["Track an order", "/track"],
      ["Quotes & payments", "/contact?topic=quote"],
      ["Artwork & proofs", "/contact?topic=artwork"],
      ["Delivery", "/contact?topic=delivery"],
      ["Workspace sign in", "/sign-in"],
    ],
  },
];

function FooterLinks({ column, labelled }: { column: (typeof FOOTER_COLUMNS)[number]; labelled: boolean }) {
  return (
    <ul className={footer.column} aria-labelledby={labelled ? `footer-${column.id}` : undefined}>
      {labelled ? (
        <li>
          <h2 id={`footer-${column.id}`} className={footer.head}>
            {column.head}
          </h2>
        </li>
      ) : null}
      {column.links.map(([label, href]) => (
        <li key={label}>
          <a className={footer.link} href={href}>
            {label}
          </a>
        </li>
      ))}
    </ul>
  );
}

/**
 * Footer (Pen Stage 4.3 · HP/Nav/Footer and HP/Nav/MobileFooter, Ledger). The
 * woven Holy Blue strip, the full logo, a Blue Deep call to action and the
 * giant wordmark. Delivery coverage (PUB-FR-014) is on the Delivery help page
 * it links to, and on product pages.
 */
function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className={footer.footer}>
      <div className={footer.woven} aria-hidden="true" />
      <div className={footer.body}>
        <div className={footer.brand}>
          <a href="/" aria-label="Holypearls home" className={footer.logoLink}>
            <LogoFull id="footer-logo-arc" />
          </a>
          <p className={footer.blurb}>
            <span className={footer.blurbLong}>Branded uniforms, print and merch for businesses across Nigeria, from brief to delivery.</span>
            <span className={footer.blurbShort}>Branded uniforms, print and merch, from brief to delivery.</span>
          </p>
          <a className={footer.brickButton} href="/start">
            Start a Project
            <Icon name="arrow-right" size={18} />
          </a>
        </div>
        <div className={footer.side}>
          <div className={footer.cta}>
            <div className={footer.ctaCopy}>
              <p className={footer.ctaTitle}>Have something in mind?</p>
              <p className={footer.ctaBody}>Describe it. We reply with a plan and a price.</p>
            </div>
            <div className={footer.ctaActions}>
              <a className={footer.whiteButton} href="/start">
                Start a Project
                <Icon name="arrow-right" size={18} />
              </a>
              <Newsletter />
            </div>
          </div>
          <div className={footer.columns}>
            {FOOTER_COLUMNS.map((column) => (
              <nav key={column.id} aria-label={column.head.toLowerCase()}>
                <FooterLinks column={column} labelled />
              </nav>
            ))}
          </div>
        </div>
        <div className={footer.accordions}>
          {FOOTER_COLUMNS.map((column) => (
            <details key={column.id} className={footer.accordion}>
              <summary>
                {column.head[0] + column.head.slice(1).toLowerCase()}
                <Icon name="plus" size={20} className={footer.plus} />
              </summary>
              <FooterLinks column={column} labelled={false} />
            </details>
          ))}
        </div>
      </div>
      <div className={footer.bottom}>
        <p className={footer.legal}>© {year} Holypearls</p>
        <nav aria-label="Legal" className={footer.legalLinks}>
          <a className={footer.link} href="/privacy">
            Privacy
          </a>
          <a className={footer.link} href="/help?topic=terms">
            Terms
          </a>
          <a className={`${footer.link} ${footer.deskOnly}`} href="/help?topic=accessibility">
            Accessibility
          </a>
          <a className={footer.link} href="/photo-credits">
            Photo credits
          </a>
          <span className={footer.deskOnly}>Payments by Paystack</span>
          <a className={footer.backTop} href="#main-content" aria-label="Back to top">
            <Icon name="arrow-up" size={16} />
          </a>
        </nav>
      </div>
      {/* Decorative: the wordmark is drawn by CSS (::before), so it isn't read or contrast-checked as text. */}
      <div className={footer.giant} aria-hidden="true" />
    </footer>
  );
}

/** The public site's shell: header with menus, main content and footer. Working tools (the project builder, Pen 24) leave the footer out. */
export async function SiteShell({ children, footer = true }: { children: ReactNode; footer?: boolean }) {
  const navigation = await getNavigation();
  return (
    <div className={styles.page}>
      <SkipLink />
      {/* One banner landmark holds the header bar (the Ledger header has no utility strip). */}
      <header className={styles.banner} data-sticky-header>
        <SiteHeader items={buildNavigation(navigation)} />
      </header>
      <main id="main-content" tabIndex={-1} className={styles.main}>
        {children}
      </main>
      {footer ? <SiteFooter /> : null}
    </div>
  );
}
