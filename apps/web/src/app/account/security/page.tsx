import { meSchema, sessionListSchema } from "@holypearls/contracts";
import { PublicShell } from "@holypearls/ui";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { serverApi } from "../../../lib/server-api";
import styles from "./security.module.css";
import { SessionsCard } from "./SessionsCard";

export const metadata: Metadata = { title: "Security", robots: { index: false } };
export const dynamic = "force-dynamic";

const ACCOUNT_NAV = [
  ["Overview", "/account"],
  ["Orders", "/account/orders"],
  ["Quotes", "/account/quotes"],
  ["Projects", "/account/projects"],
  ["Drafts", "/account/drafts"],
  ["Receipts", "/account/receipts"],
  ["Profile", "/account/profile"],
  ["Security", "/account/security"],
] as const;

/** Signed-in account security (Pen frame 90 · KReiI): a server-rendered signed-in page. */
export default async function SecurityPage() {
  const me = await serverApi("/v1/me", meSchema);
  if (!me.ok) {
    if (me.status === 401) redirect("/sign-in?next=/account/security");
    throw new Error(me.error.message);
  }
  const sessions = await serverApi("/v1/me/sessions", sessionListSchema);

  return (
    <PublicShell bleed>
      <div className={styles.body}>
        <nav className={styles.nav} aria-label="Account">
          <p className={styles.navLabel}>ACCOUNT</p>
          <ul className={styles.navList}>
            {ACCOUNT_NAV.map(([label, href]) => (
              <li key={href}>
                <a
                  className={styles.navItem}
                  href={href}
                  aria-current={href === "/account/security" ? "page" : undefined}
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className={styles.main}>
          <div>
            <h1 className={styles.title}>Security</h1>
            <p className={styles.subtitle}>Signed in as {me.data.email}</p>
          </div>
          <section className={styles.card} aria-labelledby="password-title">
            <h2 id="password-title" className={styles.cardTitle}>
              Password
            </h2>
            <p className={styles.support}>Changing your password signs you out everywhere else.</p>
          </section>
          <SessionsCard initial={sessions.ok ? sessions.data.sessions : null} total={sessions.ok ? sessions.data.total : 0} />
          <p className={styles.note}>Sessions last 30 days and extend while you use them.</p>
        </div>
      </div>
    </PublicShell>
  );
}
