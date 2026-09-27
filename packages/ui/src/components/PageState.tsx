import type { ReactNode } from "react";
import styles from "./PageState.module.css";

export interface PageStateProps {
  /** Short code shown in mono, for example "404" or "Error". */
  eyebrow?: string;
  title: string;
  body?: ReactNode;
  actions?: ReactNode;
}

/** Full-page message for not-found and error pages. */
export function PageState({ eyebrow, title, body, actions }: PageStateProps) {
  return (
    <section className={styles.state}>
      {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
      <h1 className={styles.title}>{title}</h1>
      {body ? <p className={styles.body}>{body}</p> : null}
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </section>
  );
}

/** Loading placeholder. It does not shimmer, so it is safe with reduced motion. */
export function PageLoading({ label = "Loading" }: { label?: string }) {
  return (
    <div className={styles.state} role="status" aria-live="polite">
      <span className="hp-visually-hidden">{label}</span>
      <div className={styles.skeleton} aria-hidden="true">
        <div className={styles.bar} />
        <div className={styles.bar} />
        <div className={styles.bar} />
      </div>
    </div>
  );
}
