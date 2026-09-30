import { customerPriceState, type PublicProductCard } from "@holypearls/contracts";
import styles from "./card.module.css";

const naira = (minor: string, currency: string) => {
  const whole = BigInt(minor) / 100n;
  return `${currency === "USD" ? "$" : "₦"}${whole.toLocaleString("en-NG")}`;
};

const PIECE_FAMILIES = new Set(["GARMENT", "APPAREL_PRINT", "EMBROIDERY", "PROMOTIONAL_ITEM", "PACKAGING"]);

/**
 * The card price line (Pen HP/Commerce/ProductCard): "From ₦8,500 / piece",
 * "₦15,000 / 100", "₦55,000 / unit". "From" marks an estimate; quoted and
 * consultation products say so instead of a price.
 */
export function priceLine(product: PublicProductCard): { text: string; amount?: string; unit?: string; tone: "ready" | "estimate" | "quote" | "muted" } {
  // One rule for cards and product pages (customerPriceState): no list price is a quote, never an estimate.
  const state = customerPriceState(product);
  if (state === "UNAVAILABLE") return { text: "Can't be ordered right now", tone: "muted" };
  if (state === "CONSULTATION_REQUIRED") return { text: "Planned with our team", tone: "quote" };
  const price = product.price;
  if (state === "QUOTE_REQUIRED" || !price) return { text: "Quote required", tone: "quote" };
  const amount = naira(price.amountMinor, price.currency);
  const unit = price.basis === "PER_PACK" ? ` / ${price.packSize.toLocaleString("en-NG")}` : price.basis === "PER_UNIT" ? (PIECE_FAMILIES.has(product.family) ? " / piece" : " / unit") : "";
  if (state === "ESTIMATE_READY") return { text: `From ${amount}${unit}`, amount: `From ${amount}`, unit, tone: "estimate" };
  return { text: `${amount}${unit}`, amount, unit, tone: "ready" };
}

const DOT = { ready: styles.dotReady, estimate: styles.dotEstimate, quote: styles.dotQuote, muted: styles.dotMuted };

/**
 * Standard card: tall image, title, qualifier, price row with state dot and minimum (Pen 15 "Most ordered").
 * `short` is the related-products card (Pen 19 "Complete the uniform"): the price alone, no unit or minimum.
 */
export function ProductCard({
  product,
  headingLevel = 3,
  variant = "standard",
  tight = false,
  short = false,
  square = false,
}: {
  product: PublicProductCard;
  headingLevel?: 2 | 3;
  variant?: "standard" | "compact";
  tight?: boolean;
  short?: boolean;
  /** Square image, as on the search results page (Pen 07: 300 × 302). */
  square?: boolean;
}) {
  const Heading = `h${headingLevel}` as "h2" | "h3";
  const full = priceLine(product);
  const line = short ? { ...full, text: full.tone === "quote" && !product.price ? "Priced in quote" : (full.amount ?? full.text), unit: undefined, amount: undefined } : full;
  const moq = short ? null : product.moq && product.moq > 1 ? `Min ${product.moq.toLocaleString("en-NG")}` : product.moq === 1 ? "Min 1" : null;
  if (variant === "compact") {
    return (
      <article className={styles.compact}>
        <div className={styles.compactMedia}>{product.image ? <img src={product.image.thumbnailUrl} alt={product.image.alt} loading="lazy" /> : null}</div>
        <Heading className={styles.compactTitle}>
          <a className={styles.cardLink} href={`/products/${product.slug}`}>
            {product.name}
          </a>
        </Heading>
        <p className={styles.compactPrice}>
          <span className={`${styles.dot} ${DOT[line.tone]}`} aria-hidden="true" />
          {line.text}
          {moq ? ` · ${moq}` : ""}
        </p>
      </article>
    );
  }
  return (
    <article className={`${styles.card} ${tight ? styles.tight : ""}`}>
      <div className={`${styles.media} ${square ? styles.square : ""}`}>{product.image ? <img src={product.image.thumbnailUrl} alt={product.image.alt} loading="lazy" /> : null}</div>
      <div className={styles.text}>
        <Heading className={styles.title}>
          <a className={styles.cardLink} href={`/products/${product.slug}`}>
            {product.name}
          </a>
        </Heading>
        {product.summary ? <p className={styles.qualifier}>{product.summary}</p> : null}
      </div>
      <p className={styles.priceRow}>
        <span className={`${styles.dot} ${DOT[line.tone]}`} aria-hidden="true" />
        <span className={styles.price}>
          {line.amount ?? line.text}
          {line.unit ? <span className={line.unit.startsWith(" / piece") || line.unit.startsWith(" / unit") ? styles.unit : undefined}>{line.unit}</span> : null}
        </span>
        {moq ? <span className={styles.moq}>· {moq}</span> : null}
      </p>
    </article>
  );
}
