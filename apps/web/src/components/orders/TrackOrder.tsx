"use client";

import { ApiError, findOrderResultSchema, findOrderSchema } from "@holypearls/contracts";
import { Button, ErrorSummary, FormField, Notice, TextField } from "@holypearls/ui";
import { useState } from "react";
import { api } from "@holypearls/web-kit/api";
import s from "./forms.module.css";

type Fields = { number?: string; email?: string };

/**
 * Track an order (Pen 53 · A, B, E): the order number and the email used at
 * checkout. A match emails a secure link (shown only as a masked address);
 * no match says so without saying which detail was wrong.
 */
export function TrackOrder() {
  const [number, setNumber] = useState("");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<Fields>({});
  const [notFound, setNotFound] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const find = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const parsed = findOrderSchema.safeParse({ number, email });
    if (!parsed.success) {
      const next: Fields = {};
      for (const issue of parsed.error.issues) next[issue.path[0] as keyof Fields] ??= issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    setNotFound(false);
    setFailure(null);
    setBusy(true);
    try {
      const result = await api("/v1/orders/find", { method: "POST", body: parsed.data, response: findOrderResultSchema });
      setSentTo(result.sentTo);
    } catch (problem) {
      if (problem instanceof ApiError && problem.code === "NOT_FOUND") setNotFound(true);
      else if (problem instanceof ApiError && problem.code === "RATE_LIMITED") setFailure("Too many tries. Wait a few minutes and try again.");
      else setFailure("Something went wrong on our side. Try again.");
    } finally {
      setBusy(false);
    }
  };

  if (sentTo) {
    return (
      <div className={s.page}>
        <div className={`${s.card} ${s.narrow}`}>
          <h1 className={s.title}>Check your email</h1>
          <p className={s.lead}>We sent a secure link to {sentTo}. Open it on this device or any other to see your order.</p>
          <div className={s.actions}>
            <Button type="button" variant="secondary" loading={busy} onClick={() => void find()}>
              Send it again
            </Button>
          </div>
          <p className={s.hint}>Didn&apos;t get it? Check spam, or contact us with your receipt.</p>
        </div>
      </div>
    );
  }

  const summary = [errors.number ? { fieldId: "track-number", message: errors.number } : null, errors.email ? { fieldId: "track-email", message: errors.email } : null].filter((item): item is { fieldId: string; message: string } => item !== null);
  return (
    <div className={s.page}>
      <form className={`${s.card} ${s.narrow}`} onSubmit={(event) => void find(event)} noValidate>
        <h1 className={s.title}>Track an order</h1>
        <p className={s.lead}>Enter your order number and the email you used. We&apos;ll email you a secure link to your order.</p>
        {summary.length ? <ErrorSummary errors={summary} /> : null}
        {notFound ? (
          <Notice tone="error" live>
            We couldn&apos;t find an order with those details. Check the order number and the email used at checkout.
          </Notice>
        ) : null}
        {failure ? (
          <Notice tone="error" live>
            {failure}
          </Notice>
        ) : null}
        <div className={s.form}>
          <FormField id="track-number" label="Order number" hint="On your receipt, e.g. HP-2026-0151" error={errors.number}>
            <TextField autoComplete="off" spellCheck={false} value={number} onChange={(event) => setNumber(event.target.value)} />
          </FormField>
          <FormField id="track-email" label="Email" error={errors.email}>
            <TextField type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </FormField>
          <div>
            <Button type="submit" loading={busy}>
              {notFound ? "Try again" : "Find my order"}
            </Button>
          </div>
        </div>
        <p className={s.hint}>
          Have an account? <a className={s.link} href="/sign-in">Sign in instead</a>.{notFound ? " Still stuck? Contact us with your receipt." : ""}
        </p>
      </form>
    </div>
  );
}
