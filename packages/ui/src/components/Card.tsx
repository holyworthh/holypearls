import type { HTMLAttributes } from "react";
import { cx } from "../cx";
import styles from "./Card.module.css";

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: "div" | "section" | "article" | "li";
  tone?: "paper" | "bone";
  /** Panels use the larger 18 px radius. */
  panel?: boolean;
}

export function Card({ as: Tag = "div", tone = "paper", panel = false, className, ...rest }: CardProps) {
  return <Tag {...rest} className={cx(styles.card, tone === "bone" && styles.bone, panel && styles.panel, className)} />;
}
