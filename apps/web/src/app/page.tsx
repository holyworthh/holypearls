import type { Metadata } from "next";
import { BigSearch } from "../components/catalogue/BigSearch";
import styles from "../components/catalogue/catalogue.module.css";
import { ProductCard } from "../components/catalogue/ProductCard";
import { categoryHref, GOALS } from "../components/site/nav";
import { DELIVERY_COVERAGE, SiteShell } from "../components/site/SiteShell";
import { getNavigation } from "../lib/storefront";

// Rendered per request so a build without the API never freezes empty menus; the API data itself is cached under tags.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "HolyPearls · Branded uniforms, print and merch" },
  description: "Order staff uniforms, event materials, business cards and signage in one place. See the price upfront and approve your design before we make anything.",
  alternates: { canonical: "/" },
};

const STEPS = [
  ["Plan", "Choose a product, or tell us what you need."],
  ["Configure", "Pick colours, quantities, artwork and your deadline."],
  ["Quote or pay", "See the price right away, or get a quote."],
  ["Proof", "Approve your design before anything is made."],
  ["Make and check", "Every item is checked before it leaves us."],
  ["Deliver", "To one address or several."],
] as const;

const MADE = [
  ["Source", "We find the right shirts, fabric or paper for your budget and deadline."],
  ["Make", "We cut and sew garments and print large-format graphics in our own production."],
  ["Brand", "Embroidery, screen printing, transfers or print, done exactly to the design you approved."],
  ["Deliver", "Packed, labelled and delivered to one address or split across your branches."],
] as const;

const pad = (index: number) => String(index + 1).padStart(2, "0");

/**
 * Homepage (Pen 15 · FYNoI desktop, 16 · kZf2b mobile; PUB-FR-001, 002, 014).
 * The "Most ordered" list and the mega-menu's popular products are managed in
 * admin. Pen's concept stories (event project, company accounts) wait for
 * those features (T05, T10) so the page promises nothing that isn't built.
 */
export default async function HomePage() {
  const navigation = await getNavigation();
  const hero = navigation.mostOrdered.find((product) => product.image)?.image ?? null;
  return (
    <SiteShell>
      <section className={styles.container} aria-labelledby="hero-title">
        <div className={styles.hero}>
          <div className={styles.heroText}>
            <h1 id="hero-title" className={styles.h1}>
              Branded uniforms, print and merch
            </h1>
            <p className={styles.lead}>
              Order staff uniforms, event materials, business cards and signage in one place. See the price upfront and approve your design before we make
              anything.
            </p>
            <div className={styles.actions}>
              <a className={styles.primary} href="/contact?topic=project">
                Start a project
              </a>
              <a className={styles.secondary} href="#how-it-works">
                How it works
              </a>
            </div>
            <p className={styles.eyebrow}>WHAT DO YOU NEED MADE?</p>
            <BigSearch id="home-search" placeholder="Try “50 embroidered polos” or “event backdrop”" label="What do you need made?" />
            {navigation.popular.length ? (
              <div className={styles.popular}>
                <span className={styles.eyebrow}>POPULAR</span>
                {navigation.popular.slice(0, 3).map((product) => (
                  <a key={product.slug} className={styles.chip} href={`/products/${product.slug}`}>
                    {product.name}
                  </a>
                ))}
              </div>
            ) : null}
          </div>
          <div className={styles.heroMedia}>{hero ? <img src={hero.url} alt={hero.alt} width={2000} height={1500} /> : null}</div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.bone}`} aria-labelledby="needs-title">
        <div className={styles.container}>
          <div className={styles.sectionHead}>
            <h2 id="needs-title" className={styles.sectionTitle}>
              What do you need?
            </h2>
            <a className={styles.headLink} href="/contact?topic=project">
              Plan a project →
            </a>
          </div>
          <ol className={styles.numbered}>
            {GOALS.map((goal, index) => (
              <li key={goal.label} className={styles.tile}>
                <span className={styles.tileNumber}>{pad(index)}</span>
                <h3 className={styles.tileTitle}>
                  <a href={goal.href}>{goal.label}</a>
                </h3>
                <p className={styles.tileBody}>{goal.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="categories-title">
        <div className={styles.container}>
          <div className={styles.sectionHead}>
            <h2 id="categories-title" className={styles.sectionTitle}>
              Shop by category
            </h2>
            <a className={styles.headLink} href="/products">
              Browse all {navigation.totalProducts} products →
            </a>
          </div>
          <ol className={styles.numbered}>
            {navigation.categories.map((category, index) => (
              <li key={category.slug} className={styles.tile}>
                <span className={styles.tileNumber}>{pad(index)}</span>
                <h3 className={styles.tileTitle}>
                  <a href={categoryHref(category.slug)}>{category.name}</a>
                </h3>
                {category.description ? <p className={styles.tileBody}>{category.description}</p> : null}
                <span className={styles.tileMeta}>
                  {category.productCount} {category.productCount === 1 ? "product" : "products"}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {navigation.mostOrdered.length ? (
        <section className={`${styles.section} ${styles.bone}`} aria-labelledby="popular-title">
          <div className={styles.container}>
            <div className={styles.sectionHead}>
              <h2 id="popular-title" className={styles.sectionTitle}>
                Most ordered
              </h2>
              <a className={styles.headLink} href="/products">
                See all →
              </a>
            </div>
            <ul className={styles.grid}>
              {navigation.mostOrdered.map((product) => (
                <li key={product.slug}>
                  <ProductCard product={product} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <section id="how-its-made" className={`${styles.section} ${styles.dark}`} aria-labelledby="made-title">
        <div className={styles.container}>
          <div className={styles.sectionHead}>
            <h2 id="made-title" className={styles.sectionTitle}>
              You brief us once. We handle the rest.
            </h2>
          </div>
          <ol className={styles.numbered}>
            {MADE.map(([title, body], index) => (
              <li key={title} className={styles.tile}>
                <span className={styles.tileNumber}>
                  {pad(index)} · {title.toUpperCase()}
                </span>
                <h3 className={styles.tileTitle}>{title}</h3>
                <p className={styles.tileBody}>{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="how-it-works" className={styles.section} aria-labelledby="steps-title">
        <div className={styles.container}>
          <div className={styles.sectionHead}>
            <h2 id="steps-title" className={styles.sectionTitle}>
              How ordering works
            </h2>
          </div>
          <ol className={styles.numbered}>
            {STEPS.map(([title, body], index) => (
              <li key={title} className={styles.tile}>
                <span className={styles.tileNumber}>{pad(index)}</span>
                <h3 className={styles.tileTitle}>{title}</h3>
                <p className={styles.tileBody}>{body}</p>
              </li>
            ))}
          </ol>
          <p className={`${styles.note}`}>{DELIVERY_COVERAGE}</p>
        </div>
      </section>

      <section className={styles.band} aria-labelledby="final-title">
        <div className={styles.container}>
          <div className={styles.heroText}>
            <h2 id="final-title" className={styles.sectionTitle}>
              What do you need made?
            </h2>
            <BigSearch id="final-search" placeholder="Search products, materials or ideas" />
            <a className={styles.secondary} href="/contact?topic=project">
              Not sure yet? Start a project and we&apos;ll help →
            </a>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
