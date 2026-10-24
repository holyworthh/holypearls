"use client";

import { Select } from "@holypearls/ui";
import { MapPin } from "lucide-react";
import styles from "./workspace.module.css";

/**
 * The compact location switcher (Pen 28 top bar "Lekki ▾"; Stage 3.1F W03).
 * Only shown to people with more than one location. Choosing one narrows
 * every list on the page; the API checks the location again.
 */
export function LocationSwitcher({ locations, current, allLocations }: { locations: readonly { id: string; name: string }[]; current: string | null; allLocations: boolean }) {
  return (
    <label className={styles.scope}>
      <MapPin aria-hidden className={styles.scopeIcon} />
      <span className="hp-visually-hidden">Location</span>
      <Select
        className={styles.scopeSelect}
        value={current ?? ""}
        options={[{ value: "", label: allLocations ? "All locations" : "All my locations" }, ...locations.map((location) => ({ value: location.id, label: location.name }))]}
        onValueChange={(value) => {
          const url = new URL(window.location.href);
          if (value) url.searchParams.set("location", value);
          else url.searchParams.delete("location");
          window.location.assign(url.toString());
        }}
      />
    </label>
  );
}
