"use client";

import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";
import styles from "./FormField.module.css";

export interface FormFieldProps {
  label: ReactNode;
  /** One control. FormField wires id, aria-describedby and aria-invalid onto it. */
  children: ReactElement<Record<string, unknown>>;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  /** Use a stable id so an ErrorSummary can link to the control. */
  id?: string;
}

/** A label, optional hint, the control, and an error beside the field (PRD-00 §12). */
export function FormField({ label, children, hint, error, optional, id }: FormFieldProps) {
  const generated = useId();
  const controlId = id ?? `field-${generated}`;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  const control = isValidElement(children)
    ? cloneElement(children, {
        id: controlId,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
      })
    : children;

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={controlId}>
        {label}
        {optional ? <span className={styles.optional}> (optional)</span> : null}
      </label>
      {hint ? (
        <p className={styles.hint} id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className={styles.error} id={errorId}>
          <span aria-hidden="true">!</span>
          <span>
            <span className="hp-visually-hidden">Error: </span>
            {error}
          </span>
        </p>
      ) : null}
      {control}
    </div>
  );
}
