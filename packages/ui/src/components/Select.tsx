import type { SelectHTMLAttributes } from "react";
import { cx } from "../cx";
import styles from "./FormField.module.css";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: readonly SelectOption[];
  placeholder?: string;
}

/** A native select, so keyboard and screen-reader behavior come from the browser. */
export function Select({ options, placeholder, className, ...rest }: SelectProps) {
  return (
    <select {...rest} className={cx(styles.control, styles.select, className)}>
      {placeholder ? (
        <option value="" disabled>
          {placeholder}
        </option>
      ) : null}
      {options.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
