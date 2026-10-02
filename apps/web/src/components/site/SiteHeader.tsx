"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { BagIcon, ChevronDown, ChevronLeft, ChevronRight, CloseIcon, MenuIcon, PackageIcon, SearchIcon, UserIcon } from "./icons";
import { HeaderSearch, SuggestInput } from "../search/SearchSuggest";
import { LogoLockup } from "./Logo";
import type { TopItem } from "./nav";
import styles from "./site.module.css";

/** The menu's search box, with suggestions underneath (Pen 09). */
function SearchForm({ id, placeholder, large = false }: { id: string; placeholder: string; large?: boolean }) {
  return (
    <form className={styles.search} action="/search" role="search" aria-label="Search">
      <SearchIcon className={styles.icon} />
      <SuggestInput id={id} placeholder={placeholder} autoFocus={large} label="Search" />
    </form>
  );
}

export function Logo() {
  return <LogoLockup className={styles.logo} />;
}

/**
 * Site header (Pen HP/Nav/Header, Ledger restyle in Stage 4.3) with keyboard-friendly mega-menus (Pen
 * HP/Nav/MegaMenu, PUB-FR-004) and the mobile drill-down menu (Pen
 * HP/Nav/MobileMenu, PUB-FR-005). Mega-menus follow the disclosure pattern:
 * a button with aria-expanded, Escape closes and returns focus.
 */
export function SiteHeader({ items }: { items: TopItem[] }) {
  const pathname = usePathname();
  // "Popular right now" in the empty search (Pen 08 A): the admin-managed popular products.
  const popular = (items[0]?.menu?.columns.find((column) => column.heading === "POPULAR PRODUCTS")?.links ?? []).slice(0, 4).map((link) => link.label);
  const [open, setOpen] = useState<number | null>(null);
  const [mobile, setMobile] = useState(false);
  const [drill, setDrill] = useState<number | null>(null);
  const triggers = useRef<(HTMLButtonElement | null)[]>([]);
  const header = useRef<HTMLDivElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  // Desktop mega-menus also open on hover, after a short pause so passing the pointer across doesn't flash them.
  const hoverTimer = useRef<number | undefined>(undefined);
  const openedByHover = useRef(0);
  const hoverOpen = (index: number, event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => {
      openedByHover.current = Date.now();
      setOpen(index);
    }, open === null ? 120 : 0);
  };
  const hoverClose = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => setOpen(null), 220);
  };
  const hoverStay = () => window.clearTimeout(hoverTimer.current);

  // The shell takes the open panel's height, so switching menus resizes smoothly.
  const panels = useRef<(HTMLDivElement | null)[]>([]);
  const [shellHeight, setShellHeight] = useState<number | undefined>(undefined);
  useEffect(() => {
    const panel = open === null ? null : panels.current[open];
    if (!panel || typeof ResizeObserver === "undefined") return;
    const measure = () => setShellHeight(panel.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [open]);
  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);

  const close = useCallback((returnFocus = false) => {
    setOpen((current) => {
      if (returnFocus && current !== null) triggers.current[current]?.focus();
      return null;
    });
  }, []);

  // Close menus on navigation, outside clicks and Escape.
  useEffect(() => {
    setOpen(null);
    setMobile(false);
  }, [pathname]);
  useEffect(() => {
    if (open === null) return;
    const onClick = (event: MouseEvent) => {
      if (!header.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open, close]);
  useEffect(() => {
    if (!mobile) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobile]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    if (mobile) {
      setMobile(false);
      menuButton.current?.focus();
    } else close(true);
  };

  const current = (href: string) => (href !== "/products" && pathname.startsWith(href.split("?")[0]!) ? "page" : undefined);

  return (
    <div className={styles.header} ref={header} onKeyDown={onKeyDown}>
      <div className={`${styles.container} ${styles.headerInner}`}>
        <Logo />
        <nav className={styles.primaryNav} aria-label="Main">
          <ul className={styles.primaryList}>
            {items.map((item, index) =>
              item.menu ? (
                <li key={item.label} onPointerEnter={(event) => hoverOpen(index, event.nativeEvent)} onPointerLeave={(event) => hoverClose(event.nativeEvent)}>
                  <button
                    ref={(element) => {
                      triggers.current[index] = element;
                    }}
                    type="button"
                    className={styles.navItem}
                    aria-expanded={open === index}
                    aria-controls={`${panelId}-${index}`}
                    onClick={() => {
                      // A click right after hover opened it keeps it open rather than closing it.
                      if (open === index && Date.now() - openedByHover.current < 600) return;
                      setOpen(open === index ? null : index);
                    }}
                  >
                    {item.label}
                    <ChevronDown className={styles.chevron} />
                  </button>
                </li>
              ) : (
                <li key={item.label}>
                  <a className={styles.navItem} href={item.href} aria-current={current(item.href)}>
                    {item.label}
                  </a>
                </li>
              ),
            )}
          </ul>
        </nav>
        <div className={styles.actions}>
          <HeaderSearch id={`${panelId}-search`} fieldClassName={`${styles.search} ${styles.searchTrigger}`} iconClassName={styles.icon} popular={popular} />
          <a className={styles.iconLink} href="/account/security" aria-label="Your account">
            <UserIcon className={styles.icon} />
          </a>
          <a className={`${styles.iconLink} ${styles.bagLink}`} href="/cart" aria-label="Your cart" aria-current={pathname === "/cart" ? "page" : undefined}>
            <BagIcon className={styles.icon} />
          </a>
          <a className={styles.cta} href="/start">
            Start a Project
          </a>
          <HeaderSearch id={`${panelId}-phone-search`} fieldClassName={styles.phoneSearch} iconClassName={styles.icon} popular={popular} iconOnly />
          <button
            ref={menuButton}
            type="button"
            className={styles.menuButton}
            aria-label="Open menu"
            aria-expanded={mobile}
            aria-controls={`${panelId}-mobile`}
            onClick={() => {
              setDrill(null);
              setMobile(true);
            }}
          >
            <MenuIcon className={styles.icon} />
          </button>
        </div>
        {/* Reading progress: a thin Sun line under the header (Motion board · scroll progress). */}
        <span className={styles.progress} aria-hidden="true" />
      </div>

      {/* One shell for every mega-menu: moving between them morphs its height and slides the content across. */}
      <div
        className={`${styles.mega} ${open !== null ? styles.megaOpen : ""}`}
        style={{ height: shellHeight }}
        onPointerEnter={hoverStay}
        onPointerLeave={(event) => hoverClose(event.nativeEvent)}
      >
      {items.map((item, index) =>
        item.menu ? (
          <div
            key={item.label}
            id={`${panelId}-${index}`}
            ref={(element) => {
              panels.current[index] = element;
            }}
            className={`${styles.megaPanel} ${open === index ? styles.megaPanelOn : index < (open ?? 0) ? styles.megaPanelBefore : styles.megaPanelAfter}`}
            aria-hidden={open !== index}
            inert={open !== index}
          >
            <div className={`${styles.container} ${styles.megaInner}`}>
              <div className={styles.megaColumns}>
                {item.menu.columns.map((column) => (
                  <div key={column.heading} className={styles.megaColumn}>
                    <h2 className={styles.columnHead}>{column.heading}</h2>
                    <ul className={styles.megaColumn}>
                      {column.links.map((link) => (
                        <li key={link.href + link.label}>
                          <a className={styles.megaLink} href={link.href}>
                            {link.label}
                          </a>
                        </li>
                      ))}
                    </ul>
                    {column.all ? (
                      <a className={styles.allLink} href={column.all.href}>
                        {column.all.label}
                      </a>
                    ) : null}
                  </div>
                ))}
              </div>
              <div className={styles.feature}>
                <p className={styles.columnHead}>{item.menu.feature.eyebrow}</p>
                <p className={styles.featureTitle}>{item.menu.feature.title}</p>
                <a className={styles.allLink} href={item.menu.feature.link.href}>
                  {item.menu.feature.link.label}
                </a>
              </div>
            </div>
          </div>
        ) : null,
      )}

      </div>

      {mobile ? (
        <div id={`${panelId}-mobile`} className={styles.mobile} role="dialog" aria-modal="true" aria-label="Menu">
          <div className={styles.mobileTop}>
            {drill === null ? (
              <p className={styles.mobileTitle}>Menu</p>
            ) : (
              <button type="button" className={styles.back} onClick={() => setDrill(null)}>
                <ChevronLeft className={styles.icon} />
                Back
              </button>
            )}
            <button
              type="button"
              className={styles.menuButton}
              aria-label="Close menu"
              onClick={() => {
                setMobile(false);
                menuButton.current?.focus();
              }}
            >
              <CloseIcon className={styles.icon} />
            </button>
          </div>
          {drill === null ? (
            <>
              <div className={styles.mobileSearch}>
                <SearchForm id={`${panelId}-mobile-search`} placeholder="What do you need made?" large />
              </div>
              <ul className={styles.mobileList}>
                {items.map((item, index) => (
                  <li key={item.label}>
                    {item.menu ? (
                      <button type="button" className={styles.mobileRow} onClick={() => setDrill(index)}>
                        {item.label}
                        <ChevronRight className={styles.icon} />
                      </button>
                    ) : (
                      <a className={styles.mobileRow} href={item.href}>
                        {item.label}
                        <ChevronRight className={styles.icon} />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className={styles.mobileList}>
              <p className={styles.mobileTitle}>{items[drill]!.label}</p>
              {items[drill]!.menu!.columns.map((column) =>
                column.links.length ? (
                  <section key={column.heading} aria-label={column.heading}>
                    <h2 className={styles.columnHead}>{column.heading}</h2>
                    <ul className={styles.mobileList}>
                      {column.links.map((link) => (
                        <li key={link.href + link.label}>
                          <a className={`${styles.mobileRow} ${styles.mobileSubRow}`} href={link.href}>
                            {link.label}
                            <ChevronRight className={styles.icon} />
                          </a>
                        </li>
                      ))}
                    </ul>
                    {column.all ? (
                      <a className={`${styles.mobileRow} ${styles.mobileSubRow}`} href={column.all.href}>
                        {column.all.label}
                      </a>
                    ) : null}
                  </section>
                ) : null,
              )}
            </div>
          )}
          <div className={styles.mobileBottom}>
            <a className={styles.cta} href="/start">
              Start a Project
            </a>
            <div className={styles.quietLinks}>
              <a href="/track">
                <PackageIcon className={styles.icon} />
                Track an order
              </a>
              <a href="/account/security">
                <UserIcon className={styles.icon} />
                Your account
              </a>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
