import type { InputHTMLAttributes, ReactNode } from "react";
import styles from "./Choice.module.css";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: ReactNode;
  hint?: ReactNode;
}

export function Checkbox({ label, hint, id, ...rest }: CheckboxProps) {
  return (
    <label className={styles.checkbox} htmlFor={id}>
      <input {...rest} id={id} type="checkbox" className={styles.box} />
      <span>
        {label}
        {hint ? <span className={styles.checkboxHint}>{hint}</span> : null}
      </span>
    </label>
  );
}
