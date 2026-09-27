import type { ReactNode } from "react";
import { cx } from "../cx";
import styles from "./Shell.module.css";

export interface NavItem {
  href: string;
  label: string;
  current?: boolean;
}

const MAIN_ID = "main-content";

export function SkipLink() {
  return (
    <a className={styles.skipLink} href={`#${MAIN_ID}`}>
      Skip to main content
    </a>
  );
}

function Nav({ label, items }: { label: string; items: readonly NavItem[] }) {
  return (
    <nav aria-label={label}>
      <ul className={styles.nav}>
        {items.map((item) => (
          <li key={item.href}>
            <a className={styles.navLink} href={item.href} aria-current={item.current ? "page" : undefined}>
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export interface PublicShellProps {
  children: ReactNode;
  nav?: readonly NavItem[];
  /** Extra header content, such as search or the cart. */
  actions?: ReactNode;
  footer?: ReactNode;
}

/** Public site: header, main content and dark footer. */
export function PublicShell({ children, nav = [], actions, footer }: PublicShellProps) {
  return (
    <div className={styles.page}>
      <SkipLink />
      <header className={styles.header}>
        <div className={cx(styles.container, styles.headerInner)}>
          <a className={styles.brand} href="/">
            HolyPearls
          </a>
          {nav.length ? <Nav label="Main" items={nav} /> : null}
          {actions}
        </div>
      </header>
      <main id={MAIN_ID} tabIndex={-1} className={cx(styles.container, styles.main)}>
        {children}
      </main>
      <footer className={cx(styles.footer, "hp-surface-dark")}>
        <div className={styles.container}>{footer ?? "HolyPearls"}</div>
      </footer>
    </div>
  );
}

export interface AccountShellProps {
  children: ReactNode;
  title: string;
  nav: readonly NavItem[];
}

/** Signed-in customer pages: public header with an account section menu. */
export function AccountShell({ children, title, nav }: AccountShellProps) {
  return (
    <PublicShell>
      <h1 className={styles.pageTitle}>{title}</h1>
      <Nav label="Account" items={nav} />
      <div className={styles.accountBody}>{children}</div>
    </PublicShell>
  );
}

export interface AppShellProps {
  children: ReactNode;
  /** Organization name for the workspace, or "Admin". */
  context: string;
  nav: readonly NavItem[];
  title: string;
}

function AppShell({ children, context, nav, title, navLabel }: AppShellProps & { navLabel: string }) {
  return (
    <div className={styles.app}>
      <SkipLink />
      <aside className={cx(styles.sidebar, "hp-surface-dark")}>
        <span className={styles.sidebarTitle}>{context}</span>
        <Nav label={navLabel} items={nav} />
      </aside>
      <main id={MAIN_ID} tabIndex={-1} className={styles.appMain}>
        <h1 className={styles.pageTitle}>{title}</h1>
        {children}
      </main>
    </div>
  );
}

/** Brand Workspace: organization sidebar and content area. */
export function WorkspaceShell(props: AppShellProps) {
  return <AppShell {...props} navLabel="Workspace" />;
}

/** Staff admin. Access control is added in T00-06; this is layout only. */
export function AdminShell(props: AppShellProps) {
  return <AppShell {...props} navLabel="Admin" />;
}
