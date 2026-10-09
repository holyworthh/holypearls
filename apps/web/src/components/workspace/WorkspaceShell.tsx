import { type MyOrganization, ROLE_LABELS } from "@holypearls/contracts";
import { BrandLockup, SkipLink } from "@holypearls/ui";
import { ChevronLeft, LifeBuoy, Settings } from "lucide-react";
import type { ReactNode } from "react";
import styles from "./workspace.module.css";

export const initials = (name: string) =>
  name
    .replace(/\(.*?\)/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");

/** "Lekki · Location Manager", as the Pen's organization block reads. */
export const scopeLine = (me: MyOrganization["me"]) => `${me.allLocations ? "All locations" : me.locations.map((location) => location.name).join(", ")} · ${ROLE_LABELS[me.role]}`;

/**
 * The Brand Workspace shell (Pen HP/Nav/WorkspaceSidebar · Mmc8t, and the
 * 390 px workspace header in frame 70). T10-01 builds only what Team and
 * Locations need: the organization block, "Team & Settings", the producer
 * link and the top bar's person. T10-03 adds the other workspace sections,
 * search and the location switcher.
 */
export function WorkspaceShell({ organization, userName, children }: { organization: MyOrganization; userName: string; children: ReactNode }) {
  const base = `/workspace/${organization.id}`;
  return (
    <div className={styles.app}>
      <SkipLink />
      <aside className={`${styles.sidebar} hp-surface-dark`} aria-label="Workspace">
        <BrandLockup tone="reversed" href="/" className={styles.logo} />
        <div className={styles.org}>
          <span className={styles.orgMark} aria-hidden="true">
            {initials(organization.name)}
          </span>
          <span className={styles.orgText}>
            <span className={styles.orgName}>{organization.name}</span>
            <span className={styles.orgRole}>{scopeLine(organization.me)}</span>
          </span>
        </div>
        <nav aria-label="Workspace sections">
          <ul className={styles.navList}>
            <li>
              <a className={styles.navItem} href={`${base}/team`} aria-current="page">
                <Settings aria-hidden className={styles.navIcon} />
                Team &amp; Settings
              </a>
            </li>
          </ul>
        </nav>
        <span className={styles.spacer} />
        <a className={styles.help} href="/help">
          <LifeBuoy aria-hidden className={styles.navIcon} />
          Talk to your HolyPearls producer
        </a>
      </aside>

      <header className={`${styles.mobileHeader} hp-surface-dark`}>
        <a className={styles.back} href="/account">
          <ChevronLeft aria-hidden className={styles.backIcon} />
          Account
        </a>
        <span className={styles.mobileOrg}>{organization.name}</span>
      </header>

      <div className={styles.main}>
        <div className={styles.topbar}>
          <span className={styles.spacer} />
          <span className={styles.user}>
            <span className={styles.userAvatar} aria-hidden="true">
              {initials(userName)}
            </span>
            <span className={styles.userName}>{userName}</span>
          </span>
        </div>
        <main id="main-content" tabIndex={-1} className={styles.content}>
          {children}
        </main>
      </div>
    </div>
  );
}

/** Team and Locations sit under "Team & Settings". */
export function SettingsTabs({ organizationId, current, showTeam }: { organizationId: string; current: "team" | "locations"; showTeam: boolean }) {
  const tabs = [...(showTeam ? [["team", "Team"] as const] : []), ["locations", "Locations"] as const];
  return (
    <nav className={styles.tabs} aria-label="Team & Settings">
      {tabs.map(([key, label]) => (
        <a key={key} className={styles.tab} href={`/workspace/${organizationId}/${key}`} aria-current={current === key ? "page" : undefined}>
          {label}
        </a>
      ))}
    </nav>
  );
}
