"use client";

import { SlidersHorizontal } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import styles from "./directory.module.css";

/**
 * The filter rail (Pen 17). Below 1024px it becomes a sheet behind one sticky
 * Filter / Sort bar (Pen 06 notes: "Filters leave the rail and become a sheet").
 */
export function FilterSheet({ count, sort, children }: { count: string; sort: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <>
      <div className={styles.mobileBar}>
        <span>{count}</span>
        <div className={styles.barActions}>
          <button type="button" className={styles.filterButton} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
            <SlidersHorizontal size={16} aria-hidden="true" />
            Filter
          </button>
          {sort}
        </div>
      </div>
      <aside
        id={id}
        className={`${styles.rail} ${open ? styles.railOpen : ""}`}
        aria-label="Filters"
        onChange={(event) => {
          // The desktop rail applies each change at once; the phone sheet waits for "Show results".
          if (window.matchMedia("(min-width: 1024px)").matches) (event.target as HTMLInputElement).form?.requestSubmit();
        }}
      >
        {children}
      </aside>
    </>
  );
}
