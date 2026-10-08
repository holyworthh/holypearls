import { meSchema } from "@holypearls/contracts";
import { ButtonLink, IconBadge } from "@holypearls/ui";
import styles from "@holypearls/web-kit/auth.module.css";
import type { Metadata } from "next";
import { ResendVerification } from "../../../components/account/ResendVerification";
import { SiteShell } from "../../../components/site/SiteShell";
import { serverApi } from "../../../lib/server-api";

export const metadata: Metadata = { title: "Verify your email", robots: { index: false } };
export const dynamic = "force-dynamic";

const CheckIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M4 12.5l5 5L20 6.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);
const LinkOffIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);

/**
 * Where the email check lands (Pen frame 88 states: VERIFIED, VERIFY LINK EXPIRED).
 * The sign-in library adds `error` when the link is expired or already used.
 */
export default async function VerifiedPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const me = await serverApi("/v1/me", meSchema);
  const signedIn = me.ok ? me.data : null;
  return (
    <SiteShell>
      <div className={styles.page}>
        {error || !signedIn?.emailVerified ? (
          <section className={`${styles.card} ${styles.stateCard}`} aria-labelledby="verify-state">
            <IconBadge tone="error">
              <LinkOffIcon />
            </IconBadge>
            <h1 id="verify-state" className={styles.stateTitle}>
              This verification link has expired
            </h1>
            <p className={styles.intro}>Request a new link. Nothing is linked until you verify.</p>
            {signedIn ? (
              <ResendVerification email={signedIn.email} label="Send a new link" fullWidth />
            ) : (
              <ButtonLink fullWidth className={styles.primary} href="/sign-in?next=/account">
                Sign in to send a new link
              </ButtonLink>
            )}
          </section>
        ) : (
          <section className={`${styles.card} ${styles.stateCard}`} aria-labelledby="verify-state">
            <IconBadge tone="success">
              <CheckIcon />
            </IconBadge>
            <h1 id="verify-state" className={styles.stateTitle}>
              Email verified
            </h1>
            <p className={styles.intro}>Your account is ready. Orders you placed as a guest with this email are now in your account.</p>
            <ButtonLink fullWidth className={styles.primary} href="/account">
              Go to your account
            </ButtonLink>
          </section>
        )}
      </div>
    </SiteShell>
  );
}
