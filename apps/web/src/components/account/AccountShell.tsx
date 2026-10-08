import type { ReactNode } from "react";
import styles from "../../app/account/account.module.css";
import { SiteShell } from "../site/SiteShell";

/** Orders, quotes, projects, drafts and receipts are sections of the overview (T09-01; list pages are T09-01b). */
const ACCOUNT_NAV = [
  ["Overview", "/account"],
  ["Orders", "/account#orders"],
  ["Quotes", "/account#quotes"],
  ["Projects", "/account#quotes"],
  ["Drafts", "/account#drafts"],
  ["Receipts", "/account#receipts"],
  ["Profile", "/account/profile"],
  ["Security", "/account/security"],
] as const;

/** The signed-in account area (Pen frames 90–92): navigation beside one column of cards. */
export function AccountShell({ current, children }: { current: "/account" | "/account/profile" | "/account/security"; children: ReactNode }) {
  return (
    <SiteShell>
      <div className={styles.body}>
        <nav className={styles.nav} aria-label="Account">
          <p className={styles.navLabel}>ACCOUNT</p>
          <ul className={styles.navList}>
            {ACCOUNT_NAV.map(([label, href]) => (
              <li key={label}>
                <a className={styles.navItem} href={href} aria-current={href === current ? "page" : undefined}>
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className={styles.main}>{children}</div>
      </div>
    </SiteShell>
  );
}
