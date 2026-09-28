import { SkipLink } from "@holypearls/ui";
import type { ReactNode } from "react";
import { getNavigation } from "../../lib/storefront";
import { buildNavigation, categoryHref, GOALS } from "./nav";
import { Logo, SiteHeader } from "./SiteHeader";
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

function SiteFooter({ categories }: { categories: { slug: string; name: string }[] }) {
  const year = new Date().getFullYear();
  return (
    <footer className={styles.footer}>
      <div className={`${styles.container} ${styles.footerInner}`}>
        <div className={styles.footerTop}>
          <div className={styles.footerBrand}>
            <Logo />
            <p className={styles.footerBlurb}>Branded uniforms, print and merch for businesses, from brief to delivery.</p>
          </div>
          <nav aria-labelledby="footer-products">
            <ul className={styles.footerColumn}>
              <li>
                <h2 id="footer-products" className={styles.footerHead}>
                  PRODUCTS
                </h2>
              </li>
              {categories.slice(0, 4).map((category) => (
                <li key={category.slug}>
                  <a href={categoryHref(category.slug)}>{category.name}</a>
                </li>
              ))}
              <li>
                <a href="/products">All products</a>
              </li>
            </ul>
          </nav>
          <nav aria-labelledby="footer-projects">
            <ul className={styles.footerColumn}>
              <li>
                <h2 id="footer-projects" className={styles.footerHead}>
                  PROJECTS
                </h2>
              </li>
              <li>
                <a href="/contact?topic=project">Start a Project</a>
              </li>
              {GOALS.slice(0, 4).map((goal) => (
                <li key={goal.label}>
                  <a href={goal.href}>{goal.label}</a>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-labelledby="footer-company">
            <ul className={styles.footerColumn}>
              <li>
                <h2 id="footer-company" className={styles.footerHead}>
                  COMPANY
                </h2>
              </li>
              <li>
                <a href="/#how-it-works">How it works</a>
              </li>
              <li>
                <a href="/#how-its-made">How it&apos;s made</a>
              </li>
              <li>
                <a href="/contact">Contact</a>
              </li>
            </ul>
          </nav>
          <nav aria-labelledby="footer-help">
            <ul className={styles.footerColumn}>
              <li>
                <h2 id="footer-help" className={styles.footerHead}>
                  HELP
                </h2>
              </li>
              <li>
                <a href="/contact?topic=order">Track an order</a>
              </li>
              <li>
                <a href="/contact?topic=artwork">Artwork & proofs</a>
              </li>
              <li>
                <a href="/contact?topic=delivery">Delivery</a>
              </li>
              <li>
                <a href="/sign-in">Workspace sign in</a>
              </li>
            </ul>
          </nav>
        </div>
        <p className={styles.coverage}>
          <strong>Delivery.</strong> {DELIVERY_COVERAGE}
        </p>
        <div className={styles.footerBottom}>
          <p className={styles.legal}>© {year} HOLYPEARLS</p>
        </div>
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
      <SiteFooter categories={navigation.categories} />
    </div>
  );
}
