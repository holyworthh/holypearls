"use client";

import { type SearchSuggestions, searchSuggestionsSchema } from "@holypearls/contracts";
import { ArrowRight, BookOpen, Folder, Search, X } from "lucide-react";
import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import { priceLine } from "../catalogue/ProductCard";
import styles from "./search.module.css";

/*
 * Search autocomplete (Pen 09 · R8Aqc, PUB-FR-006/007): everyday searches and
 * categories on the left, products and guides on the right, "See all results"
 * below. A WAI-ARIA combobox: ↑↓ move, Enter opens, Esc closes.
 */

type Status = "idle" | "loading" | "ready" | "error";
const cache = new Map<string, SearchSuggestions>();

function useSuggestions(q: string) {
  const term = q.trim();
  const [state, setState] = useState<{ term: string; data: SearchSuggestions | null; status: Status }>({ term: "", data: null, status: "idle" });
  useEffect(() => {
    if (!term) {
      setState({ term: "", data: null, status: "idle" });
      return;
    }
    const hit = cache.get(term.toLowerCase());
    if (hit) {
      setState({ term, data: hit, status: "ready" });
      return;
    }
    setState((previous) => ({ ...previous, status: "loading" }));
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/v1/catalogue/suggest?q=${encodeURIComponent(term)}`, { signal: controller.signal, headers: { accept: "application/json" } });
        if (!response.ok) throw new Error(String(response.status));
        const data = searchSuggestionsSchema.parse(await response.json());
        cache.set(term.toLowerCase(), data);
        setState({ term, data, status: "ready" });
      } catch (error) {
        if ((error as Error).name !== "AbortError") setState({ term, data: null, status: "error" });
      }
    }, 120);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term]);
  return state;
}

/** "emb" + "roidered polos": the typed part bold, as in the Pen suggestion rows. */
function Highlight({ text, q }: { text: string; q: string }) {
  const at = text.toLowerCase().indexOf(q.trim().toLowerCase());
  if (!q.trim() || at < 0) return <>{text}</>;
  const end = at + q.trim().length;
  return (
    <>
      {text.slice(0, at)}
      <strong className={styles.match}>{text.slice(at, end)}</strong>
      {text.slice(end)}
    </>
  );
}

type Item = { key: string; href: string; group: "searches" | "categories" | "products" | "guides"; label: string; body: ReactNode };

function itemsFor(data: SearchSuggestions, q: string): Item[] {
  return [
    ...data.searches.map((phrase) => ({
      key: `s-${phrase}`,
      href: `/products?q=${encodeURIComponent(phrase)}`,
      group: "searches" as const,
      label: phrase,
      body: (
        <>
          <Search className={styles.rowIcon} size={16} aria-hidden="true" />
          <span className={styles.rowText}>
            <Highlight text={phrase} q={q} />
          </span>
        </>
      ),
    })),
    ...data.categories.map((category) => ({
      key: `c-${category.slug}`,
      href: `/products?category=${encodeURIComponent(category.slug)}`,
      group: "categories" as const,
      label: `${category.name} · ${category.count}`,
      body: (
        <>
          <Folder className={styles.rowIcon} size={16} aria-hidden="true" />
          <span className={styles.rowText}>
            {category.name} · {category.count}
          </span>
        </>
      ),
    })),
    ...data.products.map((product) => {
      const line = priceLine(product);
      const meta = `${line.text}${product.moq ? ` · Min ${product.moq.toLocaleString("en-NG")}` : ""}`;
      return {
        key: `p-${product.slug}`,
        href: `/products/${product.slug}`,
        group: "products" as const,
        label: `${product.name}, ${meta}`,
        body: (
          <>
            <span className={styles.thumb} style={product.image ? { backgroundImage: `url("${product.image.thumbnailUrl}")` } : undefined} aria-hidden="true" />
            <span className={styles.hitText}>
              <span className={styles.hitName}>
                <Highlight text={product.name} q={q} />
              </span>
              <span className={styles.hitMeta}>{meta}</span>
            </span>
          </>
        ),
      };
    }),
    ...data.guides.map((guide) => ({
      key: `g-${guide.href}`,
      href: guide.href,
      group: "guides" as const,
      label: guide.title,
      body: (
        <>
          <BookOpen className={styles.rowIcon} size={16} aria-hidden="true" />
          <span className={styles.rowText}>{guide.title}</span>
        </>
      ),
    })),
  ];
}

const GROUPS = { searches: "Searches", categories: "Categories", products: "Products", guides: "Guides" } as const;

/**
 * The suggestion panel for a search input. `attached` is the header version
 * (Pen 09): it carries its own field, "Esc to close" and sits over a scrim.
 * `dropdown` hangs under an existing search box (directory, homepage, menu).
 */
export function SuggestInput({
  id,
  defaultValue = "",
  placeholder,
  className,
  autoFocus = false,
  variant = "dropdown",
  onClose,
  label = "Search products",
}: {
  id: string;
  defaultValue?: string;
  placeholder: string;
  className?: string;
  autoFocus?: boolean;
  variant?: "dropdown" | "attached";
  onClose?: () => void;
  label?: string;
}) {
  const [q, setQ] = useState(defaultValue);
  const [open, setOpen] = useState(variant === "attached");
  const [active, setActive] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const { data, status, term } = useSuggestions(q);
  const items = useMemo(() => (data ? itemsFor(data, term) : []), [data, term]);
  const shown = open && q.trim().length > 0 && (status !== "idle" || data !== null);
  const optionId = (index: number) => `${listId}-o${index}`;

  useEffect(() => setActive(-1), [data]);
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (variant === "dropdown" && root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open, variant]);

  const go = (href: string) => window.location.assign(href);
  const all = `/products?q=${encodeURIComponent(q.trim())}`;

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!items.length) return;
      event.preventDefault();
      setOpen(true);
      const step = event.key === "ArrowDown" ? 1 : -1;
      // Cycles through the options and back to the input (-1).
      setActive((current) => {
        const next = current + step;
        return next >= items.length ? -1 : next < -1 ? items.length - 1 : next;
      });
    } else if (event.key === "Enter" && shown && active >= 0 && items[active]) {
      event.preventDefault();
      go(items[active]!.href);
    } else if (event.key === "Escape") {
      if (variant === "attached") {
        event.preventDefault();
        onClose?.();
      } else if (shown) {
        event.preventDefault();
        setOpen(false);
        setActive(-1);
      }
    }
  };

  const groups = (["searches", "categories", "products", "guides"] as const).map((group) => ({
    group,
    entries: items.map((item, index) => ({ item, index })).filter(({ item }) => item.group === group),
  }));
  const left = groups.filter(({ group }) => group === "searches" || group === "categories");
  const right = groups.filter(({ group }) => group === "products" || group === "guides");
  const renderGroup = ({ group, entries }: (typeof groups)[number]) =>
    entries.length ? (
      <div key={group} role="group" aria-labelledby={`${listId}-${group}`} className={styles.group}>
        <span id={`${listId}-${group}`} className={styles.groupLabel}>
          {GROUPS[group]}
        </span>
        {entries.map(({ item, index }) => (
          <a
            key={item.key}
            id={optionId(index)}
            role="option"
            aria-selected={index === active}
            aria-label={item.label}
            href={item.href}
            tabIndex={-1}
            className={`${styles.option} ${group === "products" ? styles.hit : ""}`}
            onPointerEnter={() => setActive(index)}
            onPointerDown={(event) => event.preventDefault()}
          >
            {item.body}
          </a>
        ))}
      </div>
    ) : null;

  const field = (
    <input
      ref={input}
      id={id}
      name="q"
      type="search"
      role="combobox"
      aria-label={label}
      aria-autocomplete="list"
      aria-expanded={shown}
      aria-controls={items.length ? listId : undefined}
      aria-activedescendant={shown && active >= 0 ? optionId(active) : undefined}
      className={className}
      value={q}
      placeholder={placeholder}
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      enterKeyHint="search"
      autoFocus={autoFocus}
      onChange={(event) => {
        setQ(event.target.value);
        setOpen(true);
      }}
      onFocus={() => setOpen(true)}
      onKeyDown={onKeyDown}
    />
  );

  return (
    <div ref={root} className={variant === "attached" ? styles.attachedRoot : styles.dropdownRoot}>
      {variant === "attached" ? (
        <div className={styles.fieldRow}>
          <Search size={20} aria-hidden="true" className={styles.fieldIcon} />
          {field}
          {q ? (
            <button type="button" className={styles.clear} aria-label="Clear search" onClick={() => (setQ(""), input.current?.focus())}>
              <X size={16} aria-hidden="true" />
            </button>
          ) : null}
          <button type="button" className={styles.escHint} onClick={onClose}>
            Esc to close
          </button>
        </div>
      ) : (
        <>
          {field}
          {q ? (
            <button type="button" className={styles.clear} aria-label="Clear search" onClick={() => (setQ(""), input.current?.focus())}>
              <X size={18} aria-hidden="true" />
            </button>
          ) : null}
        </>
      )}
      <div className={`${styles.panel} ${variant === "attached" ? styles.panelAttached : styles.panelDropdown} ${shown ? styles.panelOpen : ""}`} hidden={!shown && variant === "dropdown"}>
        {items.length ? (
          <div id={listId} role="listbox" aria-label={`Suggestions for ${term}`} className={`${styles.cols} ${status === "loading" ? styles.busy : ""}`}>
            {left.some(({ entries }) => entries.length) ? <div className={styles.colLeft}>{left.map(renderGroup)}</div> : null}
            {right.some(({ entries }) => entries.length) ? <div className={styles.colRight}>{right.map(renderGroup)}</div> : null}
          </div>
        ) : status === "error" ? (
          <p className={styles.note}>Suggestions aren&apos;t available right now. Press Enter to search.</p>
        ) : status === "ready" && data ? (
          <p className={styles.note}>
            No suggestions for ‘{term}’. We may still be able to make or source it.{" "}
            <a className={styles.noteLink} href={`/contact?topic=custom-request&q=${encodeURIComponent(term)}`}>
              Tell us what you need
            </a>
          </p>
        ) : q.trim() ? (
          <div className={styles.skeleton} aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        ) : (
          <p className={styles.note}>Try “polo”, “roll-up” or “paper bag”.</p>
        )}
        {q.trim() ? (
          <div className={styles.footer}>
            <a className={styles.all} href={all}>
              See all results for ‘{q.trim()}’
              <ArrowRight size={16} aria-hidden="true" />
            </a>
            <span className={styles.keys} aria-hidden="true">
              ↑↓ to move · Enter to open
            </span>
          </div>
        ) : null}
        <span className="hp-visually-hidden" role="status" aria-live="polite">
          {status === "ready" && q.trim() ? (items.length ? `${items.length} suggestions` : "No suggestions") : ""}
        </span>
      </div>
    </div>
  );
}

/**
 * The header search (Pen 09): the field in the bar opens the suggestion panel
 * over a dimmed page. "/" opens it from anywhere; Esc or the scrim closes it.
 * A native modal <dialog>, as the image viewer is: the page behind is inert
 * (no focus, clicks or screen-reader access) and focus returns to the trigger.
 */
export function HeaderSearch({ id, fieldClassName, iconClassName }: { id: string; fieldClassName?: string; iconClassName?: string }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      element.showModal();
      element.querySelector<HTMLInputElement>("input[type='search']")?.focus();
    }
    if (!open && element.open) element.close();
  }, [open]);
  useEffect(() => {
    const slash = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.key === "/" && !open && !target.closest("input, textarea, select, [contenteditable='true']")) {
        event.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", slash);
    return () => document.removeEventListener("keydown", slash);
  }, [open]);
  return (
    <>
      <button ref={trigger} type="button" className={fieldClassName} onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} aria-label="Search products">
        <Search className={iconClassName} aria-hidden="true" />
        <span className={styles.triggerText}>Search</span>
        <kbd className={styles.slash} aria-hidden="true">
          /
        </kbd>
      </button>
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-label="Search"
        onClose={() => open && close()}
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClick={(event) => {
          // A click on the scrim (the dialog's backdrop, outside the panel) closes it.
          if (event.target === event.currentTarget) close();
        }}
      >
        {open ? (
          <form action="/products" role="search" aria-label="Search products">
            <SuggestInput id={id} placeholder="What do you need made?" variant="attached" onClose={close} className={styles.fieldInput} />
          </form>
        ) : null}
      </dialog>
    </>
  );
}
