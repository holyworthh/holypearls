"use client";

import { adminMerchandisingListsSchema, adminProductPageSchema, type AdminProductSummary, ApiError } from "@holypearls/contracts";
import { Button, FormField, Notice, StatusChip, TextField } from "@holypearls/ui";
import { useState, type FormEvent } from "react";
import type { z } from "zod";
import { api } from "@holypearls/web-kit/api";
import styles from "../admin-list.module.css";
import css from "../products/catalogue.module.css";
import { STATUS_TONE } from "../products/labels";

type List = z.infer<typeof adminMerchandisingListsSchema>["lists"][number];

/** One admin-managed product list (PUB-FR-004): search to add, reorder, remove, save. */
export function ListEditor({ initial }: { initial: List }) {
  const [list, setList] = useState(initial);
  const [items, setItems] = useState(initial.products);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AdminProductSummary[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error" | "warning"; body: string } | null>(null);
  const dirty = JSON.stringify(items.map((item) => item.id)) !== JSON.stringify(list.products.map((item) => item.id));
  const headingId = `list-${list.key.replace(".", "-")}`;

  const search = async (event: FormEvent) => {
    event.preventDefault();
    const page = await api(`/v1/admin/catalogue/products?${new URLSearchParams({ q: query.trim(), limit: "10" })}`, { response: adminProductPageSchema });
    setResults(page.entries.filter((entry) => entry.status !== "ARCHIVED"));
  };

  const move = (index: number, step: number) => {
    const next = [...items];
    const [moved] = next.splice(index, 1);
    next.splice(index + step, 0, moved!);
    setItems(next);
  };

  const save = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const saved = await api(`/v1/admin/catalogue/lists/${list.key}`, {
        method: "PUT",
        body: { productIds: items.map((item) => item.id), version: list.version },
        response: adminMerchandisingListsSchema,
      });
      const next = saved.lists.find((candidate) => candidate.key === list.key)!;
      setList(next);
      setItems(next.products);
      setNotice({ tone: "success", body: "Saved. The site's menus and homepage refresh now. Recorded in the audit log." });
    } catch (error) {
      setNotice(
        error instanceof ApiError && error.code === "VERSION_CONFLICT"
          ? { tone: "warning", body: "Someone else saved first. Reload to see their list." }
          : { tone: "error", body: "Not saved. Try again." },
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.panel} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.panelTitle}>
        {list.label}
      </h2>
      <p className={styles.hint}>
        Up to {list.max}, in order. Unpublished products are skipped on the site.
      </p>
      {notice ? (
        <Notice tone={notice.tone} title={notice.tone === "success" ? "Saved" : "Not saved"} live>
          <p>{notice.body}</p>
        </Notice>
      ) : null}
      {items.length === 0 ? <p className={styles.hint}>Empty. The site hides this list until it has products.</p> : null}
      <ol className={css.searchResults}>
        {items.map((item, index) => (
          <li key={item.id}>
            <span>
              {item.name} <StatusChip tone={STATUS_TONE[item.status as keyof typeof STATUS_TONE] ?? "neutral"}>{item.status}</StatusChip>
            </span>
            <span className={css.rowActions}>
              <Button variant="tertiary" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move ${item.name} up`}>
                Move up
              </Button>
              <Button variant="tertiary" disabled={index === items.length - 1} onClick={() => move(index, 1)} aria-label={`Move ${item.name} down`}>
                Move down
              </Button>
              <Button variant="tertiary" onClick={() => setItems(items.filter((other) => other.id !== item.id))} aria-label={`Remove ${item.name}`}>
                Remove
              </Button>
            </span>
          </li>
        ))}
      </ol>
      {items.length < list.max ? (
        <form className={css.fieldset} role="search" aria-label={`Find products for ${list.label}`} onSubmit={search}>
          <FormField label="Find a product" id={`${headingId}-search`}>
            <TextField value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or SKU" />
          </FormField>
          <div className={css.rowActions}>
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </div>
          {results ? (
            <ul className={css.searchResults} aria-label="Search results">
              {results.length === 0 ? <li>No products match.</li> : null}
              {results.map((entry) => {
                const added = items.some((item) => item.id === entry.id);
                return (
                  <li key={entry.id}>
                    <span>{entry.name}</span>
                    <Button variant="tertiary" disabled={added} onClick={() => setItems([...items, { id: entry.id, name: entry.name, status: entry.status }])}>
                      {added ? "Added" : `Add ${entry.name}`}
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </form>
      ) : null}
      <div className={css.rowActions}>
        <Button loading={busy} disabled={!dirty} onClick={() => void save()}>
          Save list
        </Button>
      </div>
    </section>
  );
}
