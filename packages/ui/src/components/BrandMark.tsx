import { cx } from "../cx";
import styles from "./BrandMark.module.css";

/*
 * The Holypearls mark (Pen Stage 4.3 · HP/Brand/Mark): two swooshes, Pearl
 * Brick and Holy Blue. The same paths as the site logo (apps/web Logo.tsx),
 * here for shells that live in this package.
 */
export const BRAND_BRICK = "M101 72 C 112 220 175 420 295 560 C 355 628 420 662 475 656 C 560 648 610 580 630 488 C 590 530 520 552 450 548 C 335 541 245 445 195 335 C 152 245 116 160 101 72 Z";
export const BRAND_BLUE = "M136 540 C 100 440 105 350 175 285 C 270 195 470 150 735 180 C 520 185 340 225 250 290 C 185 340 150 420 136 540 Z";

export interface BrandLockupProps {
  /** "reversed" for dark surfaces (Blue Deep sidebar). */
  tone?: "colour" | "reversed";
  /** A small tag after the wordmark, such as ADMIN. */
  tag?: string;
  href?: string;
  className?: string;
}

/** Mark + tracked Open Sans wordmark, linked home (the header lockup). */
export function BrandLockup({ tone = "colour", tag, href = "/", className }: BrandLockupProps) {
  return (
    <a className={cx(styles.lockup, tone === "reversed" && styles.reversed, className)} href={href} aria-label="Holypearls home">
      <svg className={styles.mark} viewBox="90 64 650 600" aria-hidden="true" focusable="false">
        <path className={styles.brick} d={BRAND_BRICK} />
        <path className={styles.blue} d={BRAND_BLUE} />
      </svg>
      <span className={styles.wordmark} aria-hidden="true">
        Holypearls
      </span>
      {tag ? <span className={styles.tag}>{tag}</span> : null}
    </a>
  );
}
