"use client";

import type { PlacementInput } from "@holypearls/contracts";
import type { CSSProperties } from "react";
import s from "./ledger-pdp.module.css";

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

/** Zones on a 300 × 320 garment outline. The wearer's left chest is on the viewer's right. */
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

/** The Ledger polo outline (Pen mfOQO), drawn at 2.5 × on the 300 × 320 map. */
const BODY = "M110 45 L75 60 L25 105 L50 155 L80 140 L80 290 L220 290 L220 140 L250 155 L275 105 L225 60 L190 45 Q170 70 150 70 Q130 70 110 45 Z";
const COLLAR = "M110 45 L130 90 L150 70 L170 90 L190 45";
const BACK_COLLAR = "M110 45 Q150 62 190 45";
const PLACKET = "M150 70 L150 130";

/** Whether a swatch is light enough to need ink marks instead of white ones. */
const isLight = (hex: string | null | undefined) => {
  const match = hex?.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!match) return true;
  const [r, g, b] = match.slice(1).map((part) => parseInt(part, 16));
  return 0.299 * r! + 0.587 * g! + 0.114 * b! > 160;
};

interface Props {
  view: "front" | "back";
  placements: PlacementInput[];
  conflicts: { positions: Position[] }[];
  onToggle: (position: Position) => void;
  /** Swatch of the chosen colour, so the outline shows the garment's colour. */
  fill?: string | null;
}

/**
 * The garment map (COM-FR-025): tap or use the keyboard on a zone to add or
 * remove a placement. Approximate, never a proof (COM-FR-053).
 */
export function GarmentPreview({ view, placements, conflicts, onToggle, fill }: Props) {
  const on = (position: Position) => placements.some((placement) => placement.position === position);
  const clash = (position: Position) => conflicts.some((conflict) => conflict.positions.includes(position));
  const style = { "--garment": fill ?? "var(--hp-paper)" } as CSSProperties;
  return (
    <svg className={`${s.map} ${isLight(fill) ? s.mapLight : ""}`} style={style} viewBox="0 0 300 320" role="group" aria-label={`Garment map, ${view}`}>
      <path className={s.mapBody} d={BODY} />
      <path className={s.mapBody} d={view === "front" ? COLLAR : BACK_COLLAR} />
      {view === "front" ? <path className={s.mapSeam} d={PLACKET} /> : null}
      {ZONES[view].map((zone) => (
        <g key={zone.position}>
          <rect
            role="checkbox"
            tabIndex={0}
            aria-checked={on(zone.position)}
            aria-label={POSITION_LABEL[zone.position]}
            className={`${s.zone} ${on(zone.position) ? s.zoneOn : ""} ${on(zone.position) && clash(zone.position) ? s.zoneConflict : ""}`}
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
          {on(zone.position) && zone.w >= 34 && zone.position !== "FULL_FRONT" && zone.position !== "FULL_BACK" ? (
            <text className={s.zoneLabel} x={zone.x + zone.w / 2} y={zone.y + zone.h / 2} aria-hidden="true">
              LOGO
            </text>
          ) : null}
        </g>
      ))}
    </svg>
  );
}
