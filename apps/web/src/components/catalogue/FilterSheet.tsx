"use client";

import { SlidersHorizontal, X } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./directory.module.css";

const DESKTOP = "(min-width: 1024px)";

/**
 * The filter rail (Pen 17). Below 1024px it becomes a sheet behind one sticky
 * Filter / Sort bar (Pen 06 "Screen C · FILTER SHEET OPEN"): a full-height
 * modal <dialog> over a scrim, with a close button, its own scroll, and
 * "Clear all" / "Show N products" fixed at the bottom. Ticks count results
 * as you go and apply only on "Show"; closing discards them.
 *
 * The filter form (`children`, with id `formId`) lives in the rail, and moves
 * into the sheet while it's open, so it's never in the page twice.
 */
export function FilterSheet({
  count,
  total,
  formId,
  clearHref,
  sort,
  children,
}: {
  count: string;
  total: number;
  formId: string;
  clearHref: string;
  sort: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(total);
  const [body, setBody] = useState<HTMLDivElement | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const counting = useRef<AbortController | null>(null);
  const titleId = useId();

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  // Widening to the desktop layout puts the form back in the rail.
  useEffect(() => {
    const query = window.matchMedia(DESKTOP);
    const onChange = () => query.matches && setOpen(false);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const close = () => {
    counting.current?.abort();
    setOpen(false);
    setShown(total);
    opener.current?.focus();
  };

  /** "Show N products": the count for the ticks so far, without applying them. */
  const recount = () => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form)) if (typeof value === "string" && value) params.append(key, value);
    params.set("limit", "1");
    counting.current?.abort();
    const controller = new AbortController();
    counting.current = controller;
    fetch(`/api/v1/catalogue/products?${params}`, { signal: controller.signal, headers: { accept: "application/json" } })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { total?: number } | null) => typeof data?.total === "number" && setShown(data.total))
      .catch(() => undefined);
  };

  return (
    <>
      <div className={styles.mobileBar}>
        <span>{count}</span>
        <div className={styles.barActions}>
          <button ref={opener} type="button" className={styles.filterButton} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
            <SlidersHorizontal size={16} aria-hidden="true" />
            Filter
          </button>
          {sort}
        </div>
      </div>
      <aside
        className={styles.rail}
        aria-label="Filters"
        onChange={(event) => {
          // The desktop rail applies each change at once (Pen 17 has no apply button).
          if (window.matchMedia(DESKTOP).matches) (event.target as HTMLInputElement).form?.requestSubmit();
        }}
      >
        {open ? null : children}
      </aside>
      <dialog
        ref={dialog}
        className={styles.sheet}
        aria-labelledby={titleId}
        onClose={() => open && close()}
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClick={(event) => {
          // The scrim (the backdrop, above the sheet) closes it.
          if (event.target === event.currentTarget) close();
        }}
      >
        <div className={styles.sheetHead}>
          <h2 id={titleId} className={styles.sheetTitle}>
            Filter
          </h2>
          <button type="button" className={styles.sheetClose} onClick={close} aria-label="Close filters">
            <X size={22} aria-hidden="true" />
          </button>
        </div>
        <div ref={setBody} className={styles.sheetBody} />
        <div className={styles.sheetActions}>
          <a className={styles.sheetClear} href={clearHref}>
            Clear all
          </a>
          <button type="submit" form={formId} className={styles.sheetShow}>
            Show {shown.toLocaleString("en-NG")} {shown === 1 ? "product" : "products"}
          </button>
        </div>
      </dialog>
      {open && body ? createPortal(<div onChange={recount}>{children}</div>, body) : null}
    </>
  );
}
