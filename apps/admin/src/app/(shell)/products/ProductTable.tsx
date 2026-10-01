"use client";

import { type AdminProductSummary, bulkProductStatusResultSchema } from "@holypearls/contracts";
import { Button, Dialog, Notice, StatusChip } from "@holypearls/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@holypearls/web-kit/api";
import styles from "../admin-list.module.css";
import { ago } from "../format";
import css from "./catalogue.module.css";
import { FAMILY_LABELS, MODE_LABELS, STATUS_TONE } from "./labels";

type BulkTarget = "TEMPORARILY_UNAVAILABLE" | "ARCHIVED" | "PUBLISHED";

const BULK: Record<BulkTarget, { label: string; confirm: (count: number) => string; body: string }> = {
  PUBLISHED: {
    label: "Publish",
    confirm: (count) => `Publish ${count} ${count === 1 ? "product" : "products"}?`,
    body: "Products without an image, SEO title or short description are skipped and listed.",
  },
  TEMPORARILY_UNAVAILABLE: {
    label: "Mark temporarily unavailable",
    confirm: (count) => `Mark ${count} ${count === 1 ? "product" : "products"} temporarily unavailable?`,
    body: "Their pages stay live but can't be ordered. Open carts keep their saved price.",
  },
  ARCHIVED: {
    label: "Archive",
    confirm: (count) => `Archive ${count} ${count === 1 ? "product" : "products"}?`,
    body: "They leave the public site and can't be published again. Past orders keep their details.",
  },
};

/** Products table with bulk select and bulk actions (Pen frame 96 · XQetq, success state H0PrF). */
export function ProductTable({ entries: initial }: { entries: AdminProductSummary[] }) {
  const router = useRouter();
  const [entries, setEntries] = useState(initial);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<BulkTarget | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: "success" | "warning" | "error"; title: string; body: string } | null>(null);

  const selectable = entries.filter((entry) => entry.status !== "ARCHIVED");
  const allSelected = selectable.length > 0 && selectable.every((entry) => selected.has(entry.id));
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const apply = async (to: BulkTarget) => {
    setBusy(true);
    try {
      const outcome = await api("/v1/admin/catalogue/products/bulk-status", {
        method: "POST",
        body: { ids: [...selected], to },
        response: bulkProductStatusResultSchema,
      });
      const changed = outcome.changed.length;
      const skipped = outcome.skipped.map((item) => `${item.name}: ${item.reason.toLowerCase()}`).join("; ");
      setResult({
        tone: outcome.skipped.length ? "warning" : "success",
        title: "Status changed",
        body:
          `${changed} ${changed === 1 ? "product" : "products"} marked ${to}. Public pages refresh now; open carts keep their saved price. Recorded in the audit log.` +
          (skipped ? ` Not changed: ${skipped}.` : ""),
      });
      const changedIds = new Set(outcome.changed);
      const now = new Date().toISOString();
      setEntries((rows) => rows.map((row) => (changedIds.has(row.id) ? { ...row, status: to, updatedAt: now } : row)));
      setSelected(new Set());
      router.refresh();
    } catch {
      setResult({ tone: "error", title: "Nothing changed", body: "Something went wrong. Try again." });
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  return (
    <div className={styles.tableCol}>
      {result ? (
        <Notice tone={result.tone} title={result.title} live>
          <p>{result.body}</p>
        </Notice>
      ) : null}
      {selected.size ? (
        <div className={css.bulkBar} role="region" aria-label="Bulk actions">
          <span aria-live="polite">{selected.size} selected</span>
          <span className={styles.spacer} />
          {(Object.keys(BULK) as BulkTarget[]).map((target) => (
            <button key={target} type="button" onClick={() => setConfirm(target)}>
              {BULK[target].label}
            </button>
          ))}
        </div>
      ) : null}
      <table className={styles.table}>
        <caption className="hp-visually-hidden">Products, most recently updated first</caption>
        <thead>
          <tr>
            <th scope="col" className={css.checkCell}>
              <input
                type="checkbox"
                className={css.check}
                aria-label="Select all products on this page"
                checked={allSelected}
                onChange={() => setSelected(allSelected ? new Set() : new Set(selectable.map((entry) => entry.id)))}
              />
            </th>
            <th scope="col">PRODUCT</th>
            <th scope="col">FAMILY / CATEGORY</th>
            <th scope="col">BUYING MODE</th>
            <th scope="col">STATUS</th>
            <th scope="col">UPDATED</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((product) => (
            <tr key={product.id} className={selected.has(product.id) ? styles.selected : undefined}>
              <td className={css.checkCell}>
                {product.status !== "ARCHIVED" ? (
                  <input
                    type="checkbox"
                    className={css.check}
                    aria-label={`Select ${product.name}`}
                    checked={selected.has(product.id)}
                    onChange={() => toggle(product.id)}
                  />
                ) : null}
              </td>
              <td>
                <a className={styles.action} href={`/products/${product.id}`}>
                  {product.name}
                </a>
              </td>
              <td>
                {FAMILY_LABELS[product.family]} / {product.categoryName}
              </td>
              <td>{MODE_LABELS[product.buyingMode]}</td>
              <td>
                <StatusChip tone={STATUS_TONE[product.status]}>{product.status}</StatusChip>
              </td>
              <td>{ago(product.updatedAt)} ago</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Dialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm ? BULK[confirm].confirm(selected.size) : ""}
        footer={
          confirm ? (
            <>
              <Button variant="secondary" onClick={() => setConfirm(null)}>
                Cancel
              </Button>
              <Button variant={confirm === "PUBLISHED" ? "primary" : "ink"} loading={busy} onClick={() => void apply(confirm)}>
                {BULK[confirm].label}
              </Button>
            </>
          ) : null
        }
      >
        <p className={styles.hint}>{confirm ? BULK[confirm].body : ""}</p>
      </Dialog>
    </div>
  );
}
