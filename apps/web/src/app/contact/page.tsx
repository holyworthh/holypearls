import type { Metadata } from "next";
import styles from "../../components/catalogue/catalogue.module.css";
import { NeedHelp } from "../../components/NeedHelp";
import { DELIVERY_COVERAGE, SiteShell } from "../../components/site/SiteShell";

export const metadata: Metadata = {
  title: "Tell us what you need",
  description: "Can't find it? If it can be made or sourced, tell us what you need and HolyPearls will reply.",
  alternates: { canonical: "/contact" },
};

const TOPICS: Record<string, { title: string; body: string }> = {
  "custom-request": { title: "Can't find it? Tell us what you need.", body: "If it can be made or sourced, we'll tell you how, how long it takes and roughly what it costs." },
  project: { title: "Tell us about your project", body: "Several products, one brief. We'll reply with questions or a plan, then one quote." },
  quote: { title: "Ask for a quote", body: "Tell us quantities, sizes and your deadline. We reply with a quote after reviewing it." },
  product: { title: "Ask about a product", body: "Ask anything about materials, sizes, minimums or timing." },
  order: { title: "Ask about an order", body: "Order tracking in your account is coming. Until then, send us your order reference and we'll reply with its status." },
  artwork: { title: "Artwork and proofs", body: "Ask about file types, colours or a proof. PDF works best; we also take AI, SVG, PNG and JPEG." },
  delivery: { title: "Delivery", body: DELIVERY_COVERAGE },
};

/**
 * The "Can't find it? Tell us what you need" route (PUB-FR-004) and the
 * contact page. Messages become help requests with the page's context
 * (PRD-00 §18); the project builder replaces the project topic in T05-01.
 */
export default async function ContactPage({ searchParams }: { searchParams: Promise<{ topic?: string; product?: string }> }) {
  const { topic = "custom-request", product } = await searchParams;
  const copy = TOPICS[topic] ?? TOPICS["custom-request"]!;
  const productSlug = product && /^[a-z0-9-]{1,80}$/.test(product) ? product : undefined;
  return (
    <SiteShell>
      <div className={styles.container}>
        <header className={styles.pageHead}>
          <nav className={styles.breadcrumb} aria-label="Breadcrumb">
            <ol>
              <li>
                <a href="/">Home</a>
              </li>
              <li aria-current="page">Contact</li>
            </ol>
          </nav>
          <div className={styles.heroText}>
            <h1 className={styles.h1} data-enter>{copy.title}</h1>
            <p className={styles.lead}>{copy.body}</p>
            <div className={styles.actions}>
              <NeedHelp
                label="Write to us"
                context={{
                  page: { path: "/contact", title: copy.title },
                  step: topic,
                  ...(productSlug ? { product: { id: productSlug, label: productSlug } } : {}),
                }}
              />
            </div>
          </div>
        </header>
      </div>
    </SiteShell>
  );
}
