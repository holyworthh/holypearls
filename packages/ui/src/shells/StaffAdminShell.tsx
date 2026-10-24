"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { BrandLockup } from "../components/BrandMark";
import { cx } from "../cx";
import { SkipLink, type NavItem } from "./shells";
import styles from "./StaffAdminShell.module.css";

export interface AdminNavGroup {
  /** Mono group label, for example "ORDERS". The first group has none. */
  label?: string;
  items: readonly NavItem[];
}

export interface StaffAdminShellProps {
  children: ReactNode;
  groups: readonly AdminNavGroup[];
  /** Mono breadcrumb in the top bar, for example "ADMIN / OPERATIONS HOME". */
  breadcrumb: string;
  staffName: string;
  /** Short role line under the name, for example "Owner · Finance". */
  staffRoles: string;
  /** For example "MFA verified · 4 min ago". */
  mfaLabel: string;
}

const initials = (name: string) =>
  name
    .replace(/\(.*?\)/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");

function Brand() {
  return (
    <BrandLockup tone="reversed" tag="ADMIN" href="/" className={styles.brand} />
  );
}

function AdminNav({ groups, id }: { groups: readonly AdminNavGroup[]; id?: string }) {
  return (
    <nav aria-label="Admin" id={id}>
      {groups.map((group, index) => (
        <div key={group.label ?? index} className={styles.group}>
          {group.label ? <p className={styles.groupLabel}>{group.label}</p> : null}
          <ul className={styles.list}>
            {group.items.map((item) => (
              <li key={item.href}>
                <a className={styles.item} href={item.href} aria-current={item.current ? "page" : undefined}>
                  <span className={styles.itemIcon} aria-hidden="true" />
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/**
 * Staff admin (Pen frame 94: HP/Admin/Sidebar, HP/Admin/TopBar and the 375 px
 * menu). Sections only appear when the staff member's permissions allow them;
 * the server still checks every request.
 */
export function StaffAdminShell({ children, groups, breadcrumb, staffName, staffRoles, mfaLabel }: StaffAdminShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <div className={styles.app}>
      <SkipLink />
      <aside className={cx(styles.sidebar, "hp-surface-dark")}>
        <Brand />
        <AdminNav groups={groups} />
      </aside>

      <div className={cx(styles.mobileBar, "hp-surface-dark", menuOpen && styles.mobileOpen)}>
        <div className={styles.mobileTop}>
          <Brand />
          <button
            type="button"
            className={styles.menuButton}
            aria-expanded={menuOpen}
            aria-controls={menuId}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="hp-visually-hidden">{menuOpen ? "Close menu" : "Open menu"}</span>
            <svg viewBox="0 0 22 22" aria-hidden="true">
              {menuOpen ? (
                <path d="M5 5l12 12M17 5L5 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              ) : (
                <path d="M3 6h16M3 11h16M3 16h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
        {menuOpen ? (
          <div className={styles.mobileMenu}>
            <AdminNav groups={groups} id={menuId} />
            <p className={styles.mobileMfa}>
              {staffName} · {mfaLabel}
            </p>
          </div>
        ) : null}
      </div>

      <div className={styles.main} inert={menuOpen || undefined}>
        <header className={styles.topBar}>
          <p className={styles.breadcrumb}>{breadcrumb}</p>
          <span className={styles.mfaBadge}>
            <svg viewBox="0 0 14 14" aria-hidden="true">
              <path d="M7 1l5 2v4c0 3-2.2 5.2-5 6-2.8-.8-5-3-5-6V3l5-2Z" fill="currentColor" />
            </svg>
            {mfaLabel}
          </span>
          <span className={styles.staff}>
            <span className={styles.avatar} aria-hidden="true">
              {initials(staffName)}
            </span>
            <span className={styles.staffText}>
              <span className={styles.staffName}>{staffName}</span>
              <span className={styles.staffRoles}>{staffRoles}</span>
            </span>
          </span>
        </header>
        <main id="main-content" tabIndex={-1} className={styles.content}>
          {children}
        </main>
      </div>
    </div>
  );
}

export interface PermissionDeniedProps {
  permission: string;
}

/** 403 inside the admin shell (Pen HP/State/PermissionDenied). */
export function PermissionDenied({ permission }: PermissionDeniedProps) {
  return (
    <div className={styles.deniedWrap}>
      <section className={styles.denied} aria-labelledby="permission-denied-title">
        <span className={styles.deniedIcon} aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path
              d="M7 10V7a5 5 0 0 1 10 0v3h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h1Zm2 0h6V7a3 3 0 0 0-6 0v3Z"
              fill="currentColor"
            />
          </svg>
        </span>
        <h1 id="permission-denied-title" className={styles.deniedTitle}>
          You don&apos;t have access to this
        </h1>
        <p className={styles.deniedBody}>
          Your staff permissions don&apos;t include {permission}. Ask a STAFF_ADMIN if you need it.
        </p>
        <p className={styles.deniedCode}>403 · PERMISSION REQUIRED</p>
      </section>
    </div>
  );
}
