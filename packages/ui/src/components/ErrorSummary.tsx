"use client";

import { useEffect, useRef } from "react";
import styles from "./ErrorSummary.module.css";

export interface ErrorSummaryItem {
  /** Id of the control to focus when the link is followed. */
  fieldId: string;
  message: string;
}

export interface ErrorSummaryProps {
  errors: readonly ErrorSummaryItem[];
  title?: string;
}

/**
 * Lists every error at the top of a form and takes focus when it appears, so
 * keyboard and screen-reader users hear the problem first (PRD-00 §12).
 */
export function ErrorSummary({ errors, title = "There is a problem" }: ErrorSummaryProps) {
  const ref = useRef<HTMLDivElement>(null);
  const hasErrors = errors.length > 0;

  useEffect(() => {
    if (hasErrors) ref.current?.focus();
  }, [hasErrors, errors]);

  if (!hasErrors) return null;

  return (
    <div ref={ref} className={styles.summary} role="alert" aria-labelledby="hp-error-summary-title" tabIndex={-1}>
      <h2 id="hp-error-summary-title" className={styles.title}>
        {title}
      </h2>
      <ul className={styles.list}>
        {errors.map((error) => (
          <li key={error.fieldId}>
            <a
              className={styles.link}
              href={`#${error.fieldId}`}
              onClick={(event) => {
                const target = document.getElementById(error.fieldId);
                if (target) {
                  event.preventDefault();
                  target.focus();
                  target.scrollIntoView({ block: "center" });
                }
              }}
            >
              {error.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
