"use client";

import { ApiError, type PaymentStart, paymentStartSchema } from "@holypearls/contracts";
import { api, newIdempotencyKey } from "./api";

/*
 * Paystack's hosted checkout (TECH-05 §5, §15). Card details are typed into
 * Paystack's own popup, never this site. When the popup can't open (script
 * blocked, old browser), the customer goes to Paystack's page instead. Either
 * way they come back to the processing page, which waits for the server: a
 * popup "success" is not proof of payment (TECH-05 §6).
 */

const SCRIPT = "https://js.paystack.co/v2/inline.js";

interface PaystackPopup {
  resumeTransaction(accessCode: string, callbacks: { onSuccess?: () => void; onCancel?: () => void; onError?: (error: unknown) => void }): void;
}
declare global {
  interface Window {
    PaystackPop?: new () => PaystackPopup;
  }
}

let loading: Promise<boolean> | null = null;

function loadScript(): Promise<boolean> {
  if (window.PaystackPop) return Promise.resolve(true);
  loading ??= new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = SCRIPT;
    script.async = true;
    script.onload = () => resolve(Boolean(window.PaystackPop));
    script.onerror = () => {
      loading = null;
      resolve(false);
    };
    document.head.appendChild(script);
  });
  return loading;
}

/** Opens Paystack for a started attempt; calls `done` when the popup closes for any reason. */
export async function openPaystack(start: PaymentStart, done: () => void) {
  const ready = await loadScript().catch(() => false);
  if (!ready || !window.PaystackPop) {
    window.location.assign(start.authorizationUrl);
    return;
  }
  try {
    new window.PaystackPop().resumeTransaction(start.accessCode, {
      onSuccess: done,
      onCancel: done,
      onError: () => window.location.assign(start.authorizationUrl),
    });
  } catch {
    window.location.assign(start.authorizationUrl);
  }
}

export type PayOutcome = { ok: true; start: PaymentStart } | { ok: false; reason: string | null; message: string; newAttemptFrom: string | null };

/** "Pay": starts an attempt on the server. `key` is one press; reuse it to retry the same press (TECH-02 §4). */
export async function startCheckoutPayment(checkoutId: string, key: string = newIdempotencyKey()): Promise<PayOutcome> {
  try {
    const start = await api(`/v1/checkouts/${checkoutId}/payments`, { method: "POST", response: paymentStartSchema, headers: { "idempotency-key": key } });
    return { ok: true, start };
  } catch (error) {
    if (error instanceof ApiError) {
      const context = error.body.context ?? {};
      return { ok: false, reason: (context.reason as string | undefined) ?? null, message: error.body.message, newAttemptFrom: (context.newAttemptFrom as string | undefined) ?? null };
    }
    return { ok: false, reason: null, message: "We couldn't start the payment. Check your connection and try again.", newAttemptFrom: null };
  }
}
