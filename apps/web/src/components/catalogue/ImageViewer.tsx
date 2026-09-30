"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import styles from "./viewer.module.css";

export type ViewerImage = { url: string; thumb: string; alt: string };

/**
 * Full-size product images in place of a new tab: a modal dialog with the
 * image, previous / next, the image strip, ← → keys, swipe on touch and Esc
 * to close. Opening and moving between images cross-fade.
 */
export function ImageViewer({
  images,
  name,
  open,
  index,
  onIndex,
  onClose,
}: {
  images: ViewerImage[];
  name: string;
  open: boolean;
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [direction, setDirection] = useState<"next" | "previous">("next");
  const touch = useRef<number | null>(null);
  const count = images.length;
  const move = (step: number) => {
    setDirection(step > 0 ? "next" : "previous");
    onIndex((index + step + count) % count);
  };

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  // Preload the neighbours so moving feels instant.
  useEffect(() => {
    if (!open || count < 2) return;
    for (const step of [1, -1]) new Image().src = images[(index + step + count) % count]!.url;
  }, [open, index, count, images]);

  const image = images[index];
  return (
    <dialog
      ref={dialog}
      className={styles.viewer}
      aria-label={`${name} images`}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        if (count < 2) return;
        if (event.key === "ArrowRight") move(1);
        else if (event.key === "ArrowLeft") move(-1);
      }}
      onClick={(event) => {
        // A click on the backdrop (the dialog itself, outside the frame) closes it.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {open && image ? (
        <div className={styles.frame}>
          <div className={styles.top}>
            <span className={styles.title}>{name}</span>
            <span className={styles.counter} aria-live="polite">
              {index + 1} / {count}
            </span>
            <button type="button" className={styles.close} onClick={onClose} aria-label="Close images" autoFocus>
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          <div
            className={styles.stage}
            onTouchStart={(event) => (touch.current = event.touches[0]?.clientX ?? null)}
            onTouchEnd={(event) => {
              const start = touch.current;
              const end = event.changedTouches[0]?.clientX;
              touch.current = null;
              if (start === null || end === undefined || Math.abs(end - start) < 40 || count < 2) return;
              move(end < start ? 1 : -1);
            }}
          >
            <img key={image.url} className={`${styles.image} ${direction === "next" ? styles.fromRight : styles.fromLeft}`} src={image.url} alt={image.alt || name} />
            {count > 1 ? (
              <>
                <button type="button" className={`${styles.nav} ${styles.previous}`} onClick={() => move(-1)} aria-label="Previous image">
                  <ChevronLeft size={22} aria-hidden="true" />
                </button>
                <button type="button" className={`${styles.nav} ${styles.next}`} onClick={() => move(1)} aria-label="Next image">
                  <ChevronRight size={22} aria-hidden="true" />
                </button>
              </>
            ) : null}
          </div>
          {count > 1 ? (
            <ul className={styles.strip} aria-label="All images">
              {images.map((item, position) => (
                <li key={item.url}>
                  <button
                    type="button"
                    className={styles.thumb}
                    style={{ backgroundImage: `url("${item.thumb}")` }}
                    aria-label={`Show image ${position + 1}`}
                    aria-current={position === index ? "true" : undefined}
                    onClick={() => {
                      setDirection(position > index ? "next" : "previous");
                      onIndex(position);
                    }}
                  />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}
