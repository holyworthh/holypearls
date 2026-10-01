"use client";

import type { PublicImage } from "@holypearls/contracts";
import { Info, ZoomIn } from "lucide-react";
import { type ReactNode, useState } from "react";
import { ImageViewer } from "./ImageViewer";
import s from "./ledger-pdp.module.css";
import { productTransition } from "./transition";

interface Preview {
  /** The thumbnail's label (Pen: "MAP"). */
  label: string;
  /** The live preview, drawn in the stage. */
  node: ReactNode;
  /** Says the preview isn't a proof (COM-FR-053). */
  note: string;
}

interface Props {
  images: PublicImage[];
  name: string;
  slug: string;
  /** Stage tint: Holy Blue for garments, Brick for print (Pen); white for photos. */
  tint?: "brand" | "print" | null;
  /** Fixed-price products use the shorter stage (Pen gb4rz). */
  fixed?: boolean;
  /** A live preview that reacts to choices, shown first when there is one. */
  preview?: Preview;
  /** Shown on the stage under photos (no preview). */
  caption?: string;
}

/**
 * The product gallery for every product page (Pen Stage 4.3; COM-FR-003): a
 * framed stage with corner marks and five thumbnails. Where the product has a
 * live preview it comes first; the product's photos follow and open full size.
 */
export function PdpGallery({ images, name, slug, tint = null, fixed = false, preview, caption }: Props) {
  // -1 is the preview; 0… are photos.
  const [index, setIndex] = useState(preview ? -1 : 0);
  const [viewing, setViewing] = useState(false);
  const photo = index >= 0 ? images[index] : undefined;
  const thumbs = images.slice(0, preview ? 4 : 5);
  const stageTint = index < 0 || !photo ? (tint === "brand" ? s.stageTint : tint === "print" ? s.stageTintPrint : "") : "";
  return (
    <div className={s.gallery}>
      <div className={`${s.stage} ${fixed ? s.stageFixed : ""} ${stageTint}`}>
        <span className={`${s.corner} ${s.cornerTl}`} aria-hidden="true" />
        <span className={`${s.corner} ${s.cornerTr}`} aria-hidden="true" />
        <span className={`${s.corner} ${s.cornerBl}`} aria-hidden="true" />
        <span className={`${s.corner} ${s.cornerBr}`} aria-hidden="true" />
        {index < 0 && preview ? (
          <>
            {preview.node}
            <span className={s.note}>
              <Info size={14} aria-hidden="true" />
              {preview.note}
            </span>
          </>
        ) : photo ? (
          <>
            <button type="button" className={s.stageButton} onClick={() => setViewing(true)} aria-label="View images full size" aria-haspopup="dialog">
              <img
                key={photo.url}
                className={s.stagePhoto}
                src={photo.url}
                alt={photo.alt || name}
                width={photo.width ?? 2000}
                height={photo.height ?? 1500}
                style={index === 0 ? { viewTransitionName: productTransition(slug) } : undefined}
              />
            </button>
            {caption ? (
              <span className={s.note}>
                <Info size={14} aria-hidden="true" />
                {caption}
              </span>
            ) : null}
            <span className={s.zoomHint} aria-hidden="true">
              <ZoomIn size={14} />
            </span>
            {images.length > 1 ? (
              <span className={s.count}>
                {index + 1} / {images.length}
              </span>
            ) : null}
          </>
        ) : null}
      </div>
      {thumbs.length + (preview ? 1 : 0) > 1 ? (
        <ul className={s.thumbs} aria-label={`${name} images`}>
          {preview ? (
            <li>
              <button type="button" className={`${s.thumb} ${s.thumbMap} ${fixed ? s.thumbFixed : ""}`} aria-pressed={index < 0} onClick={() => setIndex(-1)}>
                {preview.label}
              </button>
            </li>
          ) : null}
          {thumbs.map((image, position) => (
            <li key={image.url}>
              <button
                type="button"
                className={`${s.thumb} ${fixed ? s.thumbFixed : ""}`}
                style={{ backgroundImage: `url("${image.thumbnailUrl}")` }}
                aria-pressed={position === index}
                aria-label={`Show image ${position + 1}${image.alt ? `: ${image.alt}` : ""}`}
                onClick={() => setIndex(position)}
              />
            </li>
          ))}
        </ul>
      ) : null}
      <ImageViewer
        images={images.map((image) => ({ url: image.url, thumb: image.thumbnailUrl, alt: image.alt }))}
        name={name}
        open={viewing}
        index={Math.max(index, 0)}
        onIndex={setIndex}
        onClose={() => setViewing(false)}
      />
    </div>
  );
}
