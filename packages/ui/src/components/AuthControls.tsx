"use client";

import { useId, useRef, useState, type InputHTMLAttributes, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "../cx";
import fieldStyles from "./FormField.module.css";
import styles from "./AuthControls.module.css";

export interface SegmentedTab<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedTabsProps<T extends string> {
  label: string;
  tabs: readonly SegmentedTab<T>[];
  value: T;
  onChange(value: T): void;
  /** Prefix for tab and panel ids; the panel uses `${idPrefix}-panel-${value}`. */
  idPrefix: string;
}

/** Two-way switch on a bone track (Pen: sign-in Password / Email me a link). */
export function SegmentedTabs<T extends string>({ label, tabs, value, onChange, idPrefix }: SegmentedTabsProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + tabs.length) % tabs.length;
    onChange(tabs[next]!.value);
    refs.current[next]?.focus();
  };
  return (
    <div className={styles.tabs} role="tablist" aria-label={label}>
      {tabs.map((tab, index) => {
        const selected = tab.value === value;
        return (
          <button
            key={tab.value}
            ref={(element) => {
              refs.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${tab.value}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${tab.value}`}
            tabIndex={selected ? 0 : -1}
            className={cx(styles.tab, selected && styles.tabSelected)}
            onClick={() => onChange(tab.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

/** Password input with a Show / Hide button (Pen HP/Form/PasswordInput). Wrap in FormField. */
export function PasswordInput({ className, id, ...rest }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className={styles.passwordWrap}>
      <input
        {...rest}
        id={id}
        type={visible ? "text" : "password"}
        className={cx(fieldStyles.control, styles.passwordControl, className)}
      />
      <button
        type="button"
        className={styles.show}
        aria-controls={id}
        aria-pressed={visible}
        onClick={() => setVisible((current) => !current)}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 3C4.5 3 2 6 1 8c1 2 3.5 5 7 5s6-3 7-5c-1-2-3.5-5-7-5Zm0 8a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z" fill="currentColor" />
        </svg>
        {visible ? "Hide" : "Show"}
        <span className="hp-visually-hidden"> password</span>
      </button>
    </div>
  );
}

export interface OtpInputProps {
  label?: string;
  value: string;
  onChange(value: string): void;
  hint?: ReactNode;
  error?: ReactNode;
  id?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}

const DIGITS = 6;

/**
 * Six code boxes backed by one input, so paste, autofill (one-time-code) and
 * screen readers work as one field (Pen HP/Form/OTPInput).
 */
export function OtpInput({ label = "6-digit code", value, onChange, hint, error, id, autoFocus, disabled }: OtpInputProps) {
  const generated = useId();
  const inputId = id ?? `otp-${generated}`;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const [focused, setFocused] = useState(false);
  const digits = value.padEnd(DIGITS, " ").slice(0, DIGITS).split("");
  const active = Math.min(value.length, DIGITS - 1);

  return (
    <div className={fieldStyles.field}>
      <label className={fieldStyles.label} htmlFor={inputId}>
        {label}
      </label>
      <div className={styles.otp}>
        <input
          id={inputId}
          className={styles.otpInput}
          value={value}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={DIGITS}
          autoFocus={autoFocus}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={[hint ? hintId : "", error ? errorId : ""].filter(Boolean).join(" ") || undefined}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, DIGITS))}
        />
        {digits.map((digit, index) => (
          <span
            key={index}
            aria-hidden="true"
            className={cx(
              styles.box,
              Boolean(error) && styles.boxError,
              focused && index === active && styles.boxActive,
            )}
          >
            {digit.trim()}
          </span>
        ))}
      </div>
      {error ? (
        <p className={fieldStyles.error} id={errorId}>
          <span aria-hidden="true">!</span>
          <span>
            <span className="hp-visually-hidden">Error: </span>
            {error}
          </span>
        </p>
      ) : null}
      {hint ? (
        <p className={fieldStyles.hint} id={hintId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
