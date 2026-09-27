import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "../cx";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "tertiary" | "ink" | "destructive";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Shows a spinner, keeps the label for screen readers and blocks repeat clicks. */
  loading?: boolean;
  fullWidth?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = "primary",
  loading = false,
  fullWidth = false,
  icon,
  className,
  children,
  disabled,
  type = "button",
  onClick,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      // aria-disabled keeps a loading button focusable so focus is not lost.
      disabled={disabled}
      aria-disabled={loading || undefined}
      aria-busy={loading || undefined}
      onClick={loading ? (event) => event.preventDefault() : onClick}
      className={cx(styles.button, styles[variant], fullWidth && styles.fullWidth, className)}
    >
      {loading ? <span className={styles.spinner} aria-hidden="true" /> : icon}
      {children}
    </button>
  );
}

export interface ButtonLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  variant?: ButtonVariant;
  fullWidth?: boolean;
}

/** A link that looks like a button, for navigation rather than actions. */
export function ButtonLink({ variant = "primary", fullWidth = false, className, ...rest }: ButtonLinkProps) {
  return <a {...rest} className={cx(styles.button, styles[variant], fullWidth && styles.fullWidth, className)} />;
}
