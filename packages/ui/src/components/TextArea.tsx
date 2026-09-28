import type { TextareaHTMLAttributes } from "react";
import { cx } from "../cx";
import styles from "./FormField.module.css";

export type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

/** A multi-line input. Wrap it in FormField for its label, hint and error. */
export function TextArea({ className, rows = 4, ...rest }: TextAreaProps) {
  return <textarea {...rest} rows={rows} className={cx(styles.control, styles.textarea, className)} />;
}
