import type { ReactNode } from "react";
import { cx } from "../cx";
import styles from "./StatusChip.module.css";

export type StatusTone = "neutral" | "success" | "warning" | "error" | "info" | "action";

export interface StatusChipProps {
  tone: StatusTone;
  /** Always a visible text label: status is never shown by colour alone (PRD-00 §12). */
  children: ReactNode;
}

export function StatusChip({ tone, children }: StatusChipProps) {
  return (
    <span className={cx(styles.chip, styles[tone])}>
      <span className={styles.dot} aria-hidden="true" />
      {children}
    </span>
  );
}
