import type { ReactNode } from "react";
import { cx } from "../cx";
import styles from "./StateCard.module.css";

export interface EmptyStateProps {
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}

const DefaultIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 6h16v12H4zM4 10h16" fill="none" stroke="currentColor" strokeWidth="2" />
  </svg>
);

/** Nothing to show yet (Pen HP/State/EmptyState). */
export function EmptyState({ title, body, action, icon }: EmptyStateProps) {
  return (
    <section className={cx(styles.card, styles.empty)} aria-label={title}>
      <span className={styles.icon}>{icon ?? <DefaultIcon />}</span>
      <h2 className={styles.title}>{title}</h2>
      {body ? <p className={styles.body}>{body}</p> : null}
      {action}
    </section>
  );
}

export interface ErrorStateProps {
  title: string;
  body?: ReactNode;
  /** Shown so support can match the report to the logs (TECH-07 §10). */
  requestId?: string | null;
  action?: ReactNode;
}

/** Something failed to load (Pen HP/State/ErrorState). */
export function ErrorState({ title, body, requestId, action }: ErrorStateProps) {
  return (
    <section className={styles.card} role="alert">
      <span className={cx(styles.icon, styles.iconError)}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 7v6M12 16.5v.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      </span>
      <h2 className={styles.title}>{title}</h2>
      {body ? <p className={styles.body}>{body}</p> : null}
      {requestId ? <p className={styles.code}>REQUEST ID {requestId}</p> : null}
      {action}
    </section>
  );
}
