"use client";

import { useId, type ReactNode } from "react";
import styles from "./Choice.module.css";

export interface RadioCardOption {
  value: string;
  title: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

export interface RadioCardGroupProps {
  name: string;
  legend: ReactNode;
  options: readonly RadioCardOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  error?: ReactNode;
  /** Id of the first radio, so an ErrorSummary can link to the group. */
  id?: string;
}

/** Radio buttons shown as cards, grouped in a fieldset. Arrow keys move between options. */
export function RadioCardGroup({ name, legend, options, value, defaultValue, onChange, error, id }: RadioCardGroupProps) {
  const generated = useId();
  const baseId = id ?? `radio-${generated}`;
  const errorId = error ? `${baseId}-error` : undefined;
  return (
    <fieldset className={styles.group} aria-describedby={errorId} aria-invalid={error ? true : undefined}>
      <legend className={styles.legend}>{legend}</legend>
      {error ? (
        <p className={styles.error} id={errorId}>
          <span className="hp-visually-hidden">Error: </span>
          {error}
        </p>
      ) : null}
      <div className={styles.cards}>
        {options.map((option, index) => {
          const optionId = index === 0 ? baseId : `${baseId}-${index}`;
          return (
            <label key={option.value} className={styles.card} htmlFor={optionId}>
              <input
                id={optionId}
                type="radio"
                name={name}
                value={option.value}
                disabled={option.disabled}
                className={styles.box}
                {...(value === undefined
                  ? { defaultChecked: defaultValue === option.value }
                  : { checked: value === option.value })}
                onChange={() => onChange?.(option.value)}
              />
              <span>
                <span className={styles.cardTitle}>{option.title}</span>
                {option.description ? <span className={styles.cardDescription}>{option.description}</span> : null}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
