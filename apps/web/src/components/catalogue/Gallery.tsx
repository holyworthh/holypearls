"use client";

import type { PublicImage } from "@holypearls/contracts";
import { useState } from "react";
import { ImageViewer } from "./ImageViewer";
import { productTransition } from "./transition";
import styles from "./pdp.module.css";

/** Product gallery (COM-FR-003; Pen 21): a tall main image with the proof caption, and three thumbnails. */
export function Gallery({ images, name, slug }: { images: PublicImage[]; name: string; slug?: string }) {
  const [index, setIndex] = useState(0);
  const main = images[index];
  const [viewing, setViewing] = useState(false);
  return (
    <div className={styles.gallery}>
      <div className={styles.main}>
        {main ? (
          <button type="button" className={styles.mainButton} onClick={() => setViewing(true)} aria-label="View images full size" aria-haspopup="dialog">
            <img key={main.url} src={main.url} alt={main.alt} width={main.width ?? 2000} height={main.height ?? 1500} style={slug && index === 0 ? { viewTransitionName: productTransition(slug) } : undefined} />
          </button>
        ) : null}
        <p className={styles.cap}>Stock, finish and size are confirmed in your proof</p>
      </div>
      {images.length > 1 ? (
        <ul className={styles.thumbs} aria-label={`${name} images`}>
          {images.slice(0, 3).map((image, position) => (
            <li key={image.url}>
              <button type="button" className={styles.thumb} aria-pressed={position === index} aria-label={`Show image ${position + 1}: ${image.alt}`} onClick={() => setIndex(position)}>
                <img src={image.thumbnailUrl} alt="" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <ImageViewer
        images={images.map((image) => ({ url: image.url, thumb: image.thumbnailUrl, alt: image.alt }))}
        name={name}
        open={viewing}
        index={index}
        onIndex={setIndex}
        onClose={() => setViewing(false)}
      />
    </div>
  );
}
