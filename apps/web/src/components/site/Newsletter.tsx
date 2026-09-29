"use client";

import { useState } from "react";
import styles from "./footer.module.css";

/**
 * Newsletter field (Pen HP/Nav/Footer). There's no mailing list yet, so the
 * form says so honestly instead of pretending to subscribe anyone.
 */
export function Newsletter() {
  const [sent, setSent] = useState(false);
  return (
    <>
      <form
        className={styles.newsletter}
        onSubmit={(event) => {
          event.preventDefault();
          setSent(true);
        }}
      >
        <label className="hp-visually-hidden" htmlFor="newsletter-email">
          Your email
        </label>
        <input id="newsletter-email" className={styles.newsletterInput} type="email" autoComplete="email" placeholder="Your email" />
        <button type="submit" className={styles.newsletterButton}>
          Subscribe
        </button>
      </form>
      {sent ? (
        <p className={styles.note} role="status">
          Email updates start soon. We haven&apos;t saved your address.
        </p>
      ) : null}
    </>
  );
}
