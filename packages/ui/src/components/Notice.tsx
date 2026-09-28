import type { ReactNode } from "react";
import { cx } from "../cx";
import styles from "./Notice.module.css";

export type NoticeTone = "error" | "warning" | "success" | "info" | "neutral";

export interface NoticeProps {
  tone: NoticeTone;
  title?: ReactNode;
  children?: ReactNode;
  /** Errors and warnings interrupt; other tones are announced politely. */
  live?: boolean;
  className?: string;
}

/** A tinted banner inside a card (Pen: sign-in, security and staff identity states). */
export function Notice({ tone, title, children, live = false, className }: NoticeProps) {
  const role = live ? (tone === "error" || tone === "warning" ? "alert" : "status") : undefined;
  return (
    <div className={cx(styles.notice, styles[tone], className)} role={role}>
      {title ? <p className={styles.title}>{title}</p> : null}
      {children ? <div className={styles.body}>{children}</div> : null}
    </div>
  );
}

export interface IconBadgeProps {
  tone: "success" | "error" | "neutral";
  children: ReactNode;
}

/** 52 px round icon holder above a card title (Pen: link sent, link expired). */
export function IconBadge({ tone, children }: IconBadgeProps) {
  return (
    <span className={cx(styles.badge, styles[`badge_${tone}`])} aria-hidden="true">
      {children}
    </span>
  );
}
