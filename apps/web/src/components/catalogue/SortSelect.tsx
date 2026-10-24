"use client";

import { Select } from "@holypearls/ui";
import { useRef } from "react";
import { flushSync } from "react-dom";
import styles from "./directory.module.css";

const SORTS: Record<string, string> = { popular: "Most ordered", name: "Name (A–Z)", newest: "Newest" };

/** "Sort: Most ordered" (Pen 17). Changing it reloads the list with the new order, keeping the other filters. */
export function SortSelect({ id, value, keep, compact = false }: { id: string; value: string; keep: [string, string][]; compact?: boolean }) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action="/products" className={styles.sort}>
      {keep.map(([key, v]) => (
        <input key={key} type="hidden" name={key} value={v} />
      ))}
      <label className="hp-visually-hidden" htmlFor={id}>
        Sort by
      </label>
      <Select
        id={id}
        name="sort"
        className={styles.sortSelect}
        defaultValue={value}
        options={Object.entries(SORTS).map(([key, label]) => ({ value: key, label: compact ? label : `Sort: ${label}` }))}
        onValueChange={() => {
          // The hidden select updates after render, so flush before submitting.
          flushSync(() => undefined);
          form.current?.requestSubmit();
        }}
      />
    </form>
  );
}
