"use client";

import type { PlacementInput } from "@holypearls/contracts";
import styles from "./configurator.module.css";

export type Position = PlacementInput["position"];

export const POSITION_LABEL: Record<Position, string> = {
  LEFT_CHEST: "Left chest",
  RIGHT_CHEST: "Right chest",
  CENTRE_CHEST: "Centre chest",
  FULL_FRONT: "Full front",
  UPPER_BACK: "Upper back",
  FULL_BACK: "Full back",
  LEFT_SLEEVE: "Left sleeve",
  RIGHT_SLEEVE: "Right sleeve",
  CUSTOM: "Custom position",
};

/** Zones on a 300 × 320 polo outline. The wearer's left chest is on the viewer's right. */
const ZONES: Record<"front" | "back", { position: Position; x: number; y: number; w: number; h: number }[]> = {
  front: [
    { position: "FULL_FRONT", x: 95, y: 110, w: 110, h: 150 },
    { position: "CENTRE_CHEST", x: 125, y: 115, w: 50, h: 40 },
    { position: "RIGHT_CHEST", x: 100, y: 105, w: 34, h: 30 },
    { position: "LEFT_CHEST", x: 166, y: 105, w: 34, h: 30 },
    { position: "RIGHT_SLEEVE", x: 30, y: 90, w: 40, h: 36 },
    { position: "LEFT_SLEEVE", x: 230, y: 90, w: 40, h: 36 },
  ],
  back: [
    { position: "FULL_BACK", x: 95, y: 110, w: 110, h: 150 },
    { position: "UPPER_BACK", x: 110, y: 80, w: 80, h: 34 },
    { position: "LEFT_SLEEVE", x: 30, y: 90, w: 40, h: 36 },
    { position: "RIGHT_SLEEVE", x: 230, y: 90, w: 40, h: 36 },
  ],
};

interface Props {
  view: "front" | "back";
  placements: PlacementInput[];
  conflicts: { positions: Position[] }[];
  onToggle: (position: Position) => void;
}

/**
 * The garment map (COM-FR-025): tap or use the keyboard on a zone to add or
 * remove a placement. Approximate, never a proof (COM-FR-053).
 */
export function GarmentPreview({ view, placements, conflicts, onToggle }: Props) {
  const on = (position: Position) => placements.some((placement) => placement.position === position);
  const clash = (position: Position) => conflicts.some((conflict) => conflict.positions.includes(position));
  return (
    <svg className={styles.garment} viewBox="0 0 300 320" role="group" aria-label={`Garment map, ${view}`}>
      <path
        className={styles.garmentBody}
        d="M100 40 L130 30 Q150 50 170 30 L200 40 L280 85 L255 140 L220 120 L220 300 L80 300 L80 120 L45 140 L20 85 Z"
      />
      {view === "front" ? <path className={styles.garmentBody} d="M130 30 L150 70 L170 30" fill="none" /> : null}
      {ZONES[view].map((zone) => (
        <rect
          key={zone.position}
          role="checkbox"
          tabIndex={0}
          aria-checked={on(zone.position)}
          aria-label={POSITION_LABEL[zone.position]}
          className={`${styles.zone} ${on(zone.position) ? styles.zoneOn : ""} ${on(zone.position) && clash(zone.position) ? styles.zoneConflict : ""}`}
          x={zone.x}
          y={zone.y}
          width={zone.w}
          height={zone.h}
          rx={4}
          onClick={() => onToggle(zone.position)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onToggle(zone.position);
            }
          }}
        />
      ))}
    </svg>
  );
}
