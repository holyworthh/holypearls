import styles from "./logo.module.css";

/*
 * Holypearls logo (Pen Stage 4.3 · HP/Brand/*): two swooshes, Pearl Brick and
 * Holy Blue, crossing like thread. A vector redraw of the supplied logo until
 * the master file arrives. Colours come from tokens, so a reversed or
 * one-colour logo only changes the tone class.
 */
const BRICK = "M101 72 C 112 220 175 420 295 560 C 355 628 420 662 475 656 C 560 648 610 580 630 488 C 590 530 520 552 450 548 C 335 541 245 445 195 335 C 152 245 116 160 101 72 Z";
const BLUE = "M136 540 C 100 440 105 350 175 285 C 270 195 470 150 735 180 C 520 185 340 225 250 290 C 185 340 150 420 136 540 Z";
const ARC = "M246 414 C 360 318 520 262 700 238";

type Tone = "colour" | "reversed" | "ink";

const toneClass = (tone: Tone) => (tone === "reversed" ? styles.reversed : tone === "ink" ? styles.ink : undefined);

/** The mark alone (favicon, chest embroidery, tight spaces). */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg className={`${styles.mark} ${className ?? ""}`} viewBox="90 64 650 600" aria-hidden="true" focusable="false">
      <path className={styles.brick} d={BRICK} />
      <path className={styles.blue} d={BLUE} />
    </svg>
  );
}

/** Header lockup: mark + tracked wordmark, linked home. */
export function LogoLockup({ tone = "colour", className }: { tone?: Tone; className?: string }) {
  return (
    <a className={`${styles.lockup} ${toneClass(tone) ?? ""} ${className ?? ""}`} href="/" aria-label="Holypearls home">
      <LogoMark />
      <span className={styles.wordmark} aria-hidden="true">
        Holypearls
      </span>
    </a>
  );
}

/** Full logo: the wordmark runs along the blue swoosh. `id` keeps the text path unique on the page. */
export function LogoFull({ id, tone = "colour", className }: { id: string; tone?: Tone; className?: string }) {
  return (
    <svg className={`${styles.full} ${toneClass(tone) ?? ""} ${className ?? ""}`} viewBox="0 0 760 690" role="img" aria-label="Holypearls">
      <path className={styles.brick} d={BRICK} />
      <path className={styles.blue} d={BLUE} />
      <path id={id} d={ARC} fill="none" />
      <text className={styles.arcText}>
        <textPath href={`#${id}`}>Holypearls</textPath>
      </text>
    </svg>
  );
}
