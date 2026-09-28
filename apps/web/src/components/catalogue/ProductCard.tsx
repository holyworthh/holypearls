import type { PriceState, PublicProductCard } from "@holypearls/contracts";
import styles from "./catalogue.module.css";

const FAMILY_TICKET: Record<string, string> = {
  GARMENT: "APPAREL",
  APPAREL_PRINT: "APPAREL PRINT",
  EMBROIDERY: "EMBROIDERY",
  PAPER_PRINT: "PRINT",
  LARGE_FORMAT: "LARGE FORMAT",
  PACKAGING: "PACKAGING",
  STICKER_LABEL: "LABELS",
  PROMOTIONAL_ITEM: "PROMOTIONAL",
  WALL_ART: "WALL ART",
  CUSTOM_PROJECT: "PROJECT",
};

/**
 * Card variants (PUB-FR-010, Pen HP/Commerce/ProductCard and price states):
 * A price on configuration, B quote required, C consultation, D unavailable.
 * Real "From ₦…" prices replace the A line when T03-01 adds price tables.
 */
const VARIANT: Record<PriceState, { ticket: string; line: string; action: string; tone: string }> = {
  PRICE_ON_CONFIGURATION: { ticket: "CONFIGURE", line: "See the price as you choose options", action: "Configure", tone: styles.dotInfo! },
  QUOTE_REQUIRED: { ticket: "QUOTE", line: "Priced by quote after we review it", action: "Get a quote", tone: styles.dotWarning! },
  CONSULTATION_REQUIRED: { ticket: "CONSULTATION", line: "Planned with our team", action: "Start a project", tone: styles.dotAccent! },
  UNAVAILABLE: { ticket: "UNAVAILABLE", line: "Can't be ordered right now", action: "View", tone: styles.dotMuted! },
};

export function ProductCard({ product, headingLevel = 3 }: { product: PublicProductCard; headingLevel?: 2 | 3 }) {
  const variant = VARIANT[product.priceState];
  const Heading = `h${headingLevel}` as "h2" | "h3";
  return (
    <article className={styles.card}>
      <div className={styles.cardMedia}>
        {product.image ? (
          // Stable, cacheable URL from the API's public media route.
          <img src={product.image.thumbnailUrl} alt={product.image.alt} loading="lazy" width={400} height={300} />
        ) : (
          <span className={styles.noImage} aria-hidden="true" />
        )}
        <span className={styles.ticket}>
          {FAMILY_TICKET[product.family]} · {variant.ticket}
        </span>
      </div>
      <div className={styles.cardText}>
        <Heading className={styles.cardTitle}>
          <a className={styles.cardLink} href={`/products/${product.slug}`}>
            {product.name}
          </a>
        </Heading>
        {product.summary ? <p className={styles.qualifier}>{product.summary}</p> : null}
      </div>
      <p className={styles.priceRow}>
        <span className={`${styles.dot} ${variant.tone}`} aria-hidden="true" />
        {variant.line}
      </p>
      <span className={styles.cardAction} aria-hidden="true">
        {variant.action} →
      </span>
    </article>
  );
}
