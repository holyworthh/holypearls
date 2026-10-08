import type { Metadata } from "next";
import styles from "@holypearls/web-kit/auth.module.css";
import { SiteShell } from "../../components/site/SiteShell";
import { ResetCard } from "./ResetCard";

export const metadata: Metadata = { title: "Reset your password", robots: { index: false }, referrer: "no-referrer" };

/**
 * Password reset (Pen frame 89 · KSASd, states YXtvJ). The email's link goes
 * through the sign-in library, which comes back here with `token`, or with
 * `error` when the link is expired or already used.
 */
export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token, error } = await searchParams;
  return (
    <SiteShell>
      <div className={styles.page}>
        <ResetCard token={error ? null : (token ?? null)} expired={Boolean(error)} />
      </div>
    </SiteShell>
  );
}
