"use client";

import { type AdminProduct, adminProductPageSchema, adminProductSchema, type AdminProductSummary } from "@holypearls/contracts";
import { Button, FormField, StatusChip, TextField } from "@holypearls/ui";
import { useState, type FormEvent } from "react";
import { api } from "@holypearls/web-kit/api";
import styles from "../../admin-list.module.css";
import css from "../catalogue.module.css";
import { STATUS_TONE } from "../labels";

interface PanelProps {
  product: AdminProduct;
  disabled: boolean;
  onSaved: (product: AdminProduct) => void;
  onError: (error: unknown) => void;
}

const MAX_RELATED = 12;

/** Related products shown on the product page, in order (up to 12). */
export function RelatedPanel({ product, disabled, onSaved, onError }: PanelProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AdminProductSummary[] | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (ids: string[]) => {
    setBusy(true);
    try {
      onSaved(await api(`/v1/admin/catalogue/products/${product.id}/related`, { method: "PUT", body: { productIds: ids }, response: adminProductSchema }));
    } catch (failure) {
      onError(failure);
    } finally {
      setBusy(false);
    }
  };

  const search = async (event: FormEvent) => {
    event.preventDefault();
    const params = new URLSearchParams({ limit: "10", q: query.trim() });
    try {
      const page = await api(`/v1/admin/catalogue/products?${params}`, { response: adminProductPageSchema });
      setResults(page.entries.filter((entry) => entry.id !== product.id && entry.status !== "ARCHIVED"));
    } catch (failure) {
      onError(failure);
    }
  };

  const ids = product.related.map((item) => item.id);
  const move = (index: number, step: number) => {
    const next = [...ids];
    const [moved] = next.splice(index, 1);
    next.splice(index + step, 0, moved!);
    void save(next);
  };

  return (
    <>
      <h2 className={styles.panelTitle}>Related products</h2>
      <p className={styles.hint}>Shown under &ldquo;You may also need&rdquo; on the product page, in this order. Up to {MAX_RELATED}.</p>
      {product.related.length === 0 ? <p className={styles.hint}>None yet.</p> : null}
      <ol className={css.searchResults}>
        {product.related.map((item, index) => (
          <li key={item.id}>
            <span>
              {item.name} <StatusChip tone={STATUS_TONE[item.status]}>{item.status}</StatusChip>
            </span>
            <span className={css.rowActions}>
              <Button variant="tertiary" disabled={disabled || busy || index === 0} onClick={() => move(index, -1)}>
                Move up
              </Button>
              <Button variant="tertiary" disabled={disabled || busy || index === ids.length - 1} onClick={() => move(index, 1)}>
                Move down
              </Button>
              <Button variant="tertiary" disabled={disabled || busy} onClick={() => void save(ids.filter((id) => id !== item.id))}>
                Remove
              </Button>
            </span>
          </li>
        ))}
      </ol>
      {!disabled && ids.length < MAX_RELATED ? (
        <form className={css.fieldset} role="search" aria-label="Find products to relate" onSubmit={search}>
          <FormField label="Find a product" id="related-search">
            <TextField value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or SKU" />
          </FormField>
          <div className={css.rowActions}>
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </div>
          {results ? (
            results.length === 0 ? (
              <p className={styles.hint}>No products match.</p>
            ) : (
              <ul className={css.searchResults} aria-label="Search results">
                {results.map((entry) => (
                  <li key={entry.id}>
                    <span>
                      {entry.name} <span className={css.count}>{entry.sku}</span>
                    </span>
                    <Button variant="tertiary" disabled={busy || ids.includes(entry.id)} onClick={() => void save([...ids, entry.id])}>
                      {ids.includes(entry.id) ? "Added" : `Add ${entry.name}`}
                    </Button>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </form>
      ) : null}
    </>
  );
}
