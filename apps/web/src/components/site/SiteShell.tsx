import { SkipLink } from "@holypearls/ui";
import type { ReactNode } from "react";
import { getNavigation } from "../../lib/storefront";
import { Icon } from "../pen/Icon";
import footer from "./footer.module.css";
import { buildNavigation, categoryHref } from "./nav";
import { Newsletter } from "./Newsletter";
import { SiteHeader } from "./SiteHeader";
import styles from "./site.module.css";

/**
 * Delivery coverage (PUB-FR-014): accurate, with no promised times or prices.
 * Exact costs and dates are shown at checkout or in the quote.
 */
export const DELIVERY_COVERAGE =
  "We deliver across Nigeria and can arrange international shipping. Delivery costs and dates depend on the order and the address, and are confirmed at checkout or in your quote.";

function UtilityStrip() {
  return (
    <div className={styles.strip}>
      <div className={`${styles.container} ${styles.stripInner}`}>
        <p className={styles.stripTagline}>SOURCE · MAKE · BRAND · DELIVER</p>
        <nav aria-label="Utility">
          <div className={styles.stripLinks}>
            <a href="/contact?topic=order">Track an order</a>
            <a href="/contact">Help centre</a>
            <a href="/sign-in">Workspace sign in</a>
          </div>
        </nav>
      </div>
    </div>
  );
}

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
      ["Start a Project", "/contact?topic=project"],
      ["Staff uniforms", categoryHref("apparel-garment-production")],
      ["Events", categoryHref("large-format-signage-displays")],
      ["Brand launches", categoryHref("print-business-stationery")],
      ["Gifts & kits", categoryHref("promotional-products-corporate-gifts")],
    ],
  },
  {
    id: "company",
    head: "COMPANY",
    links: [
      ["Our Work", "/#how-its-made"],
      ["How it works", "/#how-it-works"],
      ["Production studio", "/#how-its-made"],
      ["Resources", "/help"],
      ["Contact", "/contact"],
    ],
  },
  {
    id: "help",
    head: "HELP",
    links: [
      ["Track an order", "/contact?topic=order"],
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
          <a href={href}>{label}</a>
        </li>
      ))}
    </ul>
  );
}

function FooterLogo() {
  return (
    <a className={footer.logo} href="/" aria-label="HolyPearls home">
      <span className={footer.pearl} aria-hidden="true" />
      HolyPearls
    </a>
  );
}

/**
 * Footer (Pen HP/Nav/Footer; mobile accordion from Pen 16). Delivery coverage
 * (PUB-FR-014) is on the Delivery help page it links to, and on product pages.
 */
function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className={footer.footer}>
      <div className={footer.top}>
        <div className={footer.brand}>
          <FooterLogo />
          <p className={footer.blurb}>Branded uniforms, print and merch for businesses, from brief to delivery.</p>
          <Newsletter />
        </div>
        {FOOTER_COLUMNS.map((column) => (
          <nav key={column.id} aria-label={column.head.toLowerCase()} className={footer.column}>
            <FooterLinks column={column} labelled />
          </nav>
        ))}
      </div>
      <div className={footer.bottom}>
        <p className={footer.legal}>© {year} HOLYPEARLS</p>
        <nav aria-label="Legal" className={footer.legalLinks}>
          <a href="/help?topic=privacy">Privacy</a>
          <a href="/help?topic=terms">Terms</a>
          <a href="/help?topic=accessibility">Accessibility</a>
        </nav>
      </div>
      <div className={footer.mobile}>
        <FooterLogo />
        {FOOTER_COLUMNS.map((column) => (
          <details key={column.id} className={footer.accordion}>
            <summary>
              {column.head[0] + column.head.slice(1).toLowerCase()}
              <Icon name="plus" size={20} className={footer.plus} />
            </summary>
            <FooterLinks column={column} labelled={false} />
          </details>
        ))}
        <p className={footer.mobileLegal}>© {year} HOLYPEARLS</p>
      </div>
    </footer>
  );
}

/** The public site's shell: utility strip, header with menus, main content and footer. */
export async function SiteShell({ children }: { children: ReactNode }) {
  const navigation = await getNavigation();
  return (
    <div className={styles.page}>
      <SkipLink />
      <UtilityStrip />
      <SiteHeader items={buildNavigation(navigation)} />
      <main id="main-content" tabIndex={-1} className={styles.main}>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
