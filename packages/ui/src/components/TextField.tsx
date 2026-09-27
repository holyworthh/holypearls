import type { InputHTMLAttributes } from "react";
import { cx } from "../cx";
import styles from "./FormField.module.css";

export type TextFieldProps = InputHTMLAttributes<HTMLInputElement>;

/** A text input. Wrap it in FormField for its label, hint and error. */
export function TextField({ className, type = "text", ...rest }: TextFieldProps) {
  return <input {...rest} type={type} className={cx(styles.control, className)} />;
}
