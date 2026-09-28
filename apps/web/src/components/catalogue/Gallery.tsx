"use client";

import type { PublicImage } from "@holypearls/contracts";
import { useState } from "react";
import styles from "./configurator.module.css";

/** Product gallery (COM-FR-003): main image with thumbnails. */
export function Gallery({ images, name }: { images: PublicImage[]; name: string }) {
  const [index, setIndex] = useState(0);
  const main = images[index];
  return (
    <div className={styles.gallery}>
      <div className={styles.mainImage}>{main ? <img src={main.url} alt={main.alt} width={main.width ?? 2000} height={main.height ?? 1500} /> : null}</div>
      <p className={styles.caption}>Stock, finish and size are confirmed in your proof.</p>
      {images.length > 1 ? (
        <ul className={styles.thumbs} aria-label={`${name} images`}>
          {images.map((image, position) => (
            <li key={image.url}>
              <button type="button" className={styles.thumb} aria-pressed={position === index} aria-label={`Show image ${position + 1}: ${image.alt}`} onClick={() => setIndex(position)}>
                <img src={image.thumbnailUrl} alt="" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
