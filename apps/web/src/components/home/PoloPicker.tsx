"use client";

import { useId, useState, type CSSProperties } from "react";
import { Icon } from "../pen/Icon";
import s from "./home.module.css";

/*
 * "Pick a colour. See your polo." (Pen Stage 4.3 · Home · Try it). The colours
 * are the polo's catalogue colours (seed: polo-shirt swatches), not the
 * design's sample set, so the preview never shows a colour we can't make.
 */
const COLOURS = [
  { key: "navy", name: "Navy", hex: "#1F2A44", light: false },
  { key: "black", name: "Black", hex: "#0C0C0E", light: false },
  { key: "white", name: "White", hex: "#F4F4F5", light: true },
  { key: "olive", name: "Olive", hex: "#6B7A4E", light: false },
  { key: "wine", name: "Wine", hex: "#8C2F22", light: false },
  { key: "royal", name: "Royal", hex: "#2F5B8A", light: false },
] as const;

const DECORATIONS = [
  { key: "embroidery", name: "Embroidery", detail: "Embroidered left chest" },
  { key: "print", name: "Print", detail: "Printed left chest" },
] as const;

export function PoloPicker() {
  const id = useId();
  const [colour, setColour] = useState<(typeof COLOURS)[number]>(COLOURS[0]);
  const [decoration, setDecoration] = useState<(typeof DECORATIONS)[number]>(DECORATIONS[0]);
  const polo = { "--polo-fill": colour.hex } as CSSProperties;
  return (
    <div className={s.tryBand} data-reveal>
      <div className={s.tryCopy}>
        <p className={s.eyebrow}>Try it</p>
        <h2 id={`${id}-title`} className={s.tryTitle}>
          Pick a colour. See your polo.
        </h2>
        <p className={`${s.bodyPlus} ${s.deskOnly}`}>Embroidered staff polos from ₦8,500 each. Minimum 10.</p>
      </div>
      <div className={s.preview}>
        <span className={s.crops} aria-hidden="true" />
        <svg
          className={`${s.polo} ${colour.light ? s.poloLight : ""}`}
          style={polo}
          viewBox="0 0 120 126"
          role="img"
          aria-label={`Polo shirt preview in ${colour.name}, ${decoration.detail.toLowerCase()}`}
        >
          <path className={s.poloBody} d="M44 18 L30 24 L10 42 L20 62 L32 56 L32 116 L88 116 L88 56 L100 62 L110 42 L90 24 L76 18 Q68 28 60 28 Q52 28 44 18 Z" />
          <path className={s.poloBody} d="M44 18 L52 36 L60 28 L68 36 L76 18" />
          <path className={s.poloSeam} d="M60 28 L60 52" />
          <circle className={`${s.poloLogo} ${decoration.key === "embroidery" ? s.poloStitched : ""}`} cx="75" cy="46" r={decoration.key === "embroidery" ? 5 : 6} />
          <path className={s.poloLogoMark} d="M72 46h6M75 43v6" />
        </svg>
        <span className={s.estimate}>≈ Estimate</span>
        <span className={s.approx}>Approximate preview</span>
      </div>
      <div className={s.tryControls}>
        <div role="radiogroup" aria-label="Polo colour" className={s.colourRow}>
          {COLOURS.map((option) => (
            <button
              key={option.key}
              type="button"
              role="radio"
              aria-checked={option.key === colour.key}
              aria-label={option.name}
              className={s.swatch}
              style={{ background: option.hex }}
              onClick={() => setColour(option)}
            />
          ))}
        </div>
        <div role="radiogroup" aria-label="Decoration" className={s.segmented}>
          {DECORATIONS.map((option) => (
            <button key={option.key} type="button" role="radio" aria-checked={option.key === decoration.key} className={s.segment} onClick={() => setDecoration(option)}>
              {option.name}
            </button>
          ))}
        </div>
        <p className={`${s.priceLine} ${s.mobOnly}`}>
          From <b>₦8,500</b> each · Min 10 · {colour.name}
        </p>
        <div className={s.tryAction}>
          <a className={`${s.button} ${s.inkButton}`} href="/products/polo-shirt">
            Configure this polo
            <Icon name="arrow-right" size={18} className={s.arrow} />
          </a>
          <span className={`${s.selection} ${s.deskOnly}`}>
            {colour.name} · {decoration.detail}
          </span>
        </div>
      </div>
    </div>
  );
}
