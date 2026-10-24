import type { InputHTMLAttributes, ReactNode } from "react";
import styles from "./Choice.module.css";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: ReactNode;
  hint?: ReactNode;
  /** Marks the box invalid and links the message to it (needs an `id`). */
  error?: ReactNode;
}

export function Checkbox({ label, hint, error, id, ...rest }: CheckboxProps) {
  const errorId = error && id ? `${id}-error` : undefined;
  return (
    <label className={styles.checkbox} htmlFor={id}>
      <input {...rest} id={id} type="checkbox" className={styles.box} aria-invalid={errorId ? true : rest["aria-invalid"]} aria-describedby={errorId ?? rest["aria-describedby"]} />
      <span>
        {label}
        {hint ? <span className={styles.checkboxHint}>{hint}</span> : null}
        {errorId ? (
          <span id={errorId} className={styles.checkboxError}>
            <span className="hp-visually-hidden">Error: </span>
            {error}
          </span>
        ) : null}
      </span>
    </label>
  );
}
