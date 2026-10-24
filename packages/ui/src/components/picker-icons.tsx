import styles from "./Picker.module.css";
import { cx } from "../cx";

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export const ChevronDown = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={cx(styles.icon, className)} {...stroke}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export const ChevronUp = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.icon} {...stroke}>
    <path d="m18 15-6-6-6 6" />
  </svg>
);

export const Check = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.check} {...stroke}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export const CalendarIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.icon} {...stroke}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </svg>
);
