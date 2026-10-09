import { type MyOrganization, ROLE_LABELS } from "@holypearls/contracts";
import { BrandLockup, SkipLink } from "@holypearls/ui";
import { ChevronLeft, House, Image as ImageIcon, Layers, LifeBuoy, Package, Search, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { LocationSwitcher } from "./LocationSwitcher";
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

export type WorkspaceSection = "overview" | "orders" | "projects" | "assets" | "settings" | "search";

/** A workspace address, keeping the chosen location (B2B-FR-004). */
export const workspaceHref = (organizationId: string, path: string, location?: string | null) => `/workspace/${organizationId}${path}${location ? `?location=${location}` : ""}`;

/** Only people with more than one location get a switcher (B2B-FR-004; Stage 3.1F W03, W04). */
export const hasSwitcher = (me: MyOrganization["me"]) => me.locations.length > 1;

const NAV = [
  { section: "overview", label: "Overview", path: "", Icon: House },
  { section: "orders", label: "Orders", path: "/orders", Icon: Package },
  { section: "projects", label: "Projects", path: "/projects", Icon: Layers },
  { section: "assets", label: "Brand Assets", path: "/assets", Icon: ImageIcon },
] as const;

/**
 * The Brand Workspace shell (Pen HP/Nav/WorkspaceSidebar · Mmc8t; frame 28
 * top bar; frame 62's 390 px bottom tabs). Templates, Groups and Company
 * Store arrive with T11-01b and T12 and aren't shown until then.
 */
export function WorkspaceShell({
  organization,
  userName,
  section,
  location = null,
  children,
}: {
  organization: MyOrganization;
  userName: string;
  section: WorkspaceSection;
  location?: string | null;
  children: ReactNode;
}) {
  const id = organization.id;
  const settingsHref = workspaceHref(id, organization.me.permissions.includes("MANAGE_TEAM") ? "/team" : "/locations");
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
            {NAV.map(({ section: key, label, path, Icon }) => (
              <li key={key}>
                <a className={styles.navItem} href={workspaceHref(id, path, location)} aria-current={section === key ? "page" : undefined}>
                  <Icon aria-hidden className={styles.navIcon} />
                  {label}
                </a>
              </li>
            ))}
            <li>
              <a className={styles.navItem} href={settingsHref} aria-current={section === "settings" ? "page" : undefined}>
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
          <form className={styles.search} action={`/workspace/${id}/search`} role="search" aria-label="Search this workspace">
            <Search aria-hidden className={styles.searchIcon} />
            <label className="hp-visually-hidden" htmlFor="workspace-search">
              Search orders and projects
            </label>
            <input id="workspace-search" name="q" type="search" placeholder="Search orders and projects" autoComplete="off" />
            {location ? <input type="hidden" name="location" value={location} /> : null}
          </form>
          <span className={styles.spacer} />
          {hasSwitcher(organization.me) ? <LocationSwitcher locations={organization.me.locations} current={location} allLocations={organization.me.allLocations} /> : null}
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

      <nav className={`${styles.bottomTabs} hp-surface-dark`} aria-label="Workspace sections">
        {NAV.filter(({ section: key }) => key !== "assets").map(({ section: key, label, path, Icon }) => (
          <a key={key} className={styles.bottomTab} href={workspaceHref(id, path, location)} aria-current={section === key ? "page" : undefined}>
            <Icon aria-hidden className={styles.navIcon} />
            {label}
          </a>
        ))}
        <a className={styles.bottomTab} href={workspaceHref(id, "/more")} aria-current={section === "settings" || section === "search" || section === "assets" ? "page" : undefined}>
          <Settings aria-hidden className={styles.navIcon} />
          More
        </a>
      </nav>
    </div>
  );
}

/** Team, Locations and Billing sit under "Team & Settings" (frame 130: TEAM & SETTINGS · BILLING). */
export function SettingsTabs({ organizationId, current, me }: { organizationId: string; current: "team" | "locations" | "billing"; me: MyOrganization["me"] }) {
  const tabs = [
    ...(me.permissions.includes("MANAGE_TEAM") ? [["team", "Team"] as const] : []),
    ["locations", "Locations"] as const,
    ...(me.permissions.includes("VIEW_BILLING") ? [["billing", "Billing"] as const] : []),
  ];
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
