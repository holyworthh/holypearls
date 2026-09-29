"use client";

import { type PublicProductCard, publicProductPageSchema } from "@holypearls/contracts";
import { type ReactNode, useRef, useState } from "react";
import s from "./directory.module.css";
import { ProductCard } from "./ProductCard";

/**
 * "Load N more" (Pen 17): adds the next page of results below the ones shown,
 * so nothing already on screen is replaced. The numbered pages stay for
 * jumping ahead. Without JavaScript the button is a plain link to the next page.
 */
export function LoadMore({
  query,
  page,
  pages,
  total,
  shown: initial,
  pageSize,
  nextHref,
  children,
}: {
  /** The directory query without `page` and `limit`. */
  query: string;
  page: number;
  pages: number;
  total: number;
  shown: number;
  pageSize: number;
  nextHref: string;
  /** The numbered pages. */
  children?: ReactNode;
}) {
  const [extra, setExtra] = useState<PublicProductCard[]>([]);
  const [next, setNext] = useState(page + 1);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const added = useRef<HTMLDivElement>(null);
  const shown = initial + extra.length;
  const coming = Math.min(pageSize, total - (next - 1) * pageSize);

  const load = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const params = new URLSearchParams(query);
      params.set("page", String(next));
      params.set("limit", String(pageSize));
      const response = await fetch(`/api/v1/catalogue/products?${params}`, { headers: { accept: "application/json" } });
      if (!response.ok) throw new Error(String(response.status));
      const data = publicProductPageSchema.parse(await response.json());
      const before = extra.length;
      setExtra((current) => [...current, ...data.entries]);
      setNext(next + 1);
      // Keyboard users continue from the first new product.
      requestAnimationFrame(() => {
        const links = added.current?.querySelectorAll<HTMLAnchorElement>(`li[data-index="${before}"] a`) ?? [];
        [...links].find((link) => link.offsetParent !== null)?.focus();
      });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const cards = (variant: "compact" | "standard") =>
    extra.map((product, index) => (
      <li key={product.slug} data-index={index}>
        <ProductCard product={product} variant={variant} />
      </li>
    ));

  return (
    <>
      {extra.length ? (
        <div ref={added} className={s.added}>
          <div className={s.desktopBlock}>
            <ul className={`${s.list} ${s.compactRow}`}>{cards("compact")}</ul>
          </div>
          <ul className={`${s.list} ${s.mobileGrid}`}>{cards("standard")}</ul>
        </div>
      ) : null}
      <nav className={s.pagination} aria-label="Pages">
        <p className={s.showing} aria-live="polite">
          Showing {shown} of {total}
        </p>
        {next <= pages ? (
          <a
            className={s.outlineButton}
            href={nextHref}
            aria-disabled={busy || undefined}
            onClick={(event) => {
              event.preventDefault();
              if (!busy) void load();
            }}
          >
            {busy ? "Loading…" : `Load ${coming} more`}
          </a>
        ) : null}
        {failed ? (
          <p className={s.showing} role="alert">
            We couldn&apos;t load more products. Try again, or use the page numbers.
          </p>
        ) : null}
        {children}
      </nav>
    </>
  );
}
