"use client";

import { ChevronDown } from "lucide-react";
import styles from "./directory.module.css";

const SORTS: Record<string, string> = { popular: "Most ordered", name: "Name (A–Z)", newest: "Newest" };

/** "Sort: Most ordered" (Pen 17). Changing it reloads the list with the new order, keeping the other filters. */
export function SortSelect({ id, value, keep, compact = false }: { id: string; value: string; keep: [string, string][]; compact?: boolean }) {
  return (
    <form action="/products" className={styles.sort}>
      {keep.map(([key, v]) => (
        <input key={key} type="hidden" name={key} value={v} />
      ))}
      <label className="hp-visually-hidden" htmlFor={id}>
        Sort by
      </label>
      <span className={styles.sortBox}>
        <select id={id} name="sort" className={styles.sortSelect} defaultValue={value} onChange={(event) => event.currentTarget.form?.requestSubmit()}>
          {Object.entries(SORTS).map(([key, label]) => (
            <option key={key} value={key}>
              {compact ? label : `Sort: ${label}`}
            </option>
          ))}
        </select>
        <ChevronDown className={styles.sortCaret} size={16} aria-hidden="true" />
      </span>
    </form>
  );
}
