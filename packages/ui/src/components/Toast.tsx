"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "../cx";
import styles from "./Toast.module.css";

export type ToastTone = "info" | "success" | "error";

export interface ToastInput {
  message: string;
  tone?: ToastTone;
}

interface ToastItem extends Required<ToastInput> {
  id: number;
}

const TONE_LABEL: Record<ToastTone, string> = { info: "Notice", success: "Done", error: "Problem" };
// Matches --hp-toast-duration (INFERRED). Error toasts stay until dismissed.
const TOAST_DURATION_MS = 6000;

const ToastContext = createContext<((toast: ToastInput) => void) | null>(null);

/** Shows short confirmations in a polite live region. Never the only place an error appears. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((toast) => toast.id !== id)), []);
  const show = useCallback((input: ToastInput) => {
    const id = nextId.current++;
    setToasts((all) => [...all, { id, message: input.message, tone: input.tone ?? "info" }]);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <ol className={styles.region} aria-live="polite" aria-label="Notifications">
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </ol>
    </ToastContext.Provider>
  );
}

function Toast({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (toast.tone === "error" || paused) return;
    const timer = setTimeout(() => onDismiss(toast.id), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [toast, paused, onDismiss]);

  return (
    <li
      className={cx(styles.toast, styles[toast.tone])}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <p className={styles.message}>
        <span className={styles.label}>{TONE_LABEL[toast.tone]}</span>
        {toast.message}
      </p>
      <button type="button" className={styles.dismiss} onClick={() => onDismiss(toast.id)} aria-label="Dismiss">
        <span aria-hidden="true">×</span>
      </button>
    </li>
  );
}

export function useToast(): (toast: ToastInput) => void {
  const show = useContext(ToastContext);
  if (!show) throw new Error("useToast must be used inside ToastProvider");
  return show;
}
