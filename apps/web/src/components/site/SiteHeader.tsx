"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, CloseIcon, MenuIcon, PackageIcon, SearchIcon, UserIcon } from "./icons";
import type { TopItem } from "./nav";
import styles from "./site.module.css";

function SearchForm({ id, placeholder, large = false }: { id: string; placeholder: string; large?: boolean }) {
  return (
    <form className={styles.search} action="/products" role="search" aria-label="Search products">
      <SearchIcon className={styles.icon} />
      <label htmlFor={id} className="hp-visually-hidden">
        Search products
      </label>
      <input id={id} name="q" type="search" placeholder={placeholder} autoComplete="off" enterKeyHint="search" autoFocus={large} />
    </form>
  );
}

export function Logo() {
  return (
    <a className={styles.logo} href="/" aria-label="HolyPearls home">
      <span className={styles.pearl} aria-hidden="true" />
      HolyPearls
    </a>
  );
}

/**
 * Site header (Pen HP/Nav/Header) with keyboard-friendly mega-menus (Pen
 * HP/Nav/MegaMenu, PUB-FR-004) and the mobile drill-down menu (Pen
 * HP/Nav/MobileMenu, PUB-FR-005). Mega-menus follow the disclosure pattern:
 * a button with aria-expanded, Escape closes and returns focus.
 */
export function SiteHeader({ items }: { items: TopItem[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState<number | null>(null);
  const [mobile, setMobile] = useState(false);
  const [drill, setDrill] = useState<number | null>(null);
  const triggers = useRef<(HTMLButtonElement | null)[]>([]);
  const header = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const panelId = useId();

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
    <header className={styles.header} ref={header} onKeyDown={onKeyDown}>
      <div className={`${styles.container} ${styles.headerInner}`}>
        <Logo />
        <nav className={styles.primaryNav} aria-label="Main">
          <ul className={styles.primaryList}>
            {items.map((item, index) =>
              item.menu ? (
                <li key={item.label}>
                  <button
                    ref={(element) => {
                      triggers.current[index] = element;
                    }}
                    type="button"
                    className={styles.navItem}
                    aria-expanded={open === index}
                    aria-controls={`${panelId}-${index}`}
                    onClick={() => setOpen(open === index ? null : index)}
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
          <SearchForm id={`${panelId}-search`} placeholder="Search" />
          <a className={styles.iconLink} href="/contact?topic=order" aria-label="Track an order">
            <PackageIcon className={styles.icon} />
          </a>
          <a className={styles.iconLink} href="/account/security" aria-label="Your account">
            <UserIcon className={styles.icon} />
          </a>
          <a className={styles.cta} href="/contact?topic=project">
            Start a Project
          </a>
          <a className={styles.mobileSearch} href="/products#directory-search" aria-label="Search products">
            <SearchIcon className={styles.icon} />
          </a>
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
      </div>

      {items.map((item, index) =>
        item.menu ? (
          <div key={item.label} id={`${panelId}-${index}`} className={styles.mega} hidden={open !== index}>
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
            <a className={styles.cta} href="/contact?topic=project">
              Start a Project
            </a>
            <div className={styles.quietLinks}>
              <a href="/contact?topic=order">
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
    </header>
  );
}
