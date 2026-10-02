"use client";

import { redeemResultSchema } from "@holypearls/contracts";
import { ButtonLink, IconBadge, PageLoading } from "@holypearls/ui";
import { useEffect, useState } from "react";
import styles from "@holypearls/web-kit/auth.module.css";
import { api, errorCode, errorReason } from "../../lib/api";

type State = "opening" | "expired" | "revoked" | "invalid";

const COPY: Record<Exclude<State, "opening">, { title: string; body: string }> = {
  expired: { title: "This link has expired", body: "Links stop working after a while to keep your details safe. Your order is safe. Find it again with its number and your email, and we'll send a new link." },
  revoked: { title: "This link was turned off", body: "HolyPearls turned this link off. Ask us for a new one if you still need it." },
  invalid: { title: "This link doesn't work", body: "It may have been copied only in part. Open it again from your email." },
};

/** Exchanges the link's secret for a guest session, then replaces the address with a clean one. */
export function RedeemLink() {
  const [state, setState] = useState<State>("opening");

  useEffect(() => {
    const secret = window.location.hash.slice(1);
    // Remove the secret from the address bar and history straight away.
    window.history.replaceState(null, "", "/l");
    if (!secret) {
      setState("invalid");
      return;
    }
    api("/v1/guest-links/redeem", { method: "POST", body: { secret }, response: redeemResultSchema })
      .then((result) => window.location.replace(result.redirectTo))
      .catch((error: unknown) => {
        const reason = errorReason(error);
        setState(reason === "LINK_EXPIRED" ? "expired" : reason === "LINK_REVOKED" ? "revoked" : errorCode(error) ? "invalid" : "invalid");
      });
  }, []);

  if (state === "opening") return <PageLoading label="Opening your link" />;
  const copy = COPY[state];
  return (
    <section className={`${styles.card} ${styles.stateCard}`} aria-labelledby="link-state">
      <IconBadge tone="error">
        <svg viewBox="0 0 24 24">
          <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </IconBadge>
      <h1 id="link-state" className={styles.stateTitle}>
        {copy.title}
      </h1>
      <p className={styles.intro}>{copy.body}</p>
      {/* An expired order link recovers with Find my order (Pen 53 D; FUL-FR-033). */}
      <ButtonLink href="/track" fullWidth className={styles.primary}>
        Track with order number
      </ButtonLink>
      <ButtonLink href="/" variant="secondary" fullWidth>
        Go to the homepage
      </ButtonLink>
    </section>
  );
}
