"use client";

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
      <select
        value={current ?? ""}
        onChange={(event) => {
          const url = new URL(window.location.href);
          if (event.target.value) url.searchParams.set("location", event.target.value);
          else url.searchParams.delete("location");
          window.location.assign(url.toString());
        }}
      >
        <option value="">{allLocations ? "All locations" : "All my locations"}</option>
        {locations.map((location) => (
          <option key={location.id} value={location.id}>
            {location.name}
          </option>
        ))}
      </select>
    </label>
  );
}
