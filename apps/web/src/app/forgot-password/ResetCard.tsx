"use client";

import { newPasswordRequestSchema, okResultSchema, passwordResetRequestSchema, toFieldErrors } from "@holypearls/contracts";
import { Button, ButtonLink, FormField, IconBadge, Notice, PasswordInput, TextField } from "@holypearls/ui";
import { api, errorCode } from "@holypearls/web-kit/api";
import styles from "@holypearls/web-kit/auth.module.css";
import { type FormEvent, useState } from "react";

type View = "request" | "sent" | "new" | "expired" | "done";

const CheckIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M4 12.5l5 5L20 6.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);

/** Ask for a link, then choose a new password; saving it ends every other session (TECH-03 §4). */
export function ResetCard({ token, expired }: { token: string | null; expired: boolean }) {
  const [view, setView] = useState<View>(expired ? "expired" : token ? "new" : "request");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fail = (error: unknown) => setFailure(errorCode(error) === "RATE_LIMITED" ? "Too many attempts. Try again in a few minutes." : "Something went wrong on our side. Try again shortly.");

  const request = async (event: FormEvent) => {
    event.preventDefault();
    setErrors({});
    setFailure(null);
    const parsed = passwordResetRequestSchema.safeParse({ email, redirectTo: "/forgot-password" });
    if (!parsed.success) return setErrors(toFieldErrors(parsed.error));
    setBusy(true);
    try {
      await api("/v1/auth/request-password-reset", { method: "POST", body: parsed.data, response: okResultSchema });
      setView("sent");
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setErrors({});
    setFailure(null);
    const parsed = newPasswordRequestSchema.safeParse({ token, newPassword: password });
    if (!parsed.success) return setErrors(toFieldErrors(parsed.error));
    setBusy(true);
    try {
      await api("/v1/auth/reset-password", { method: "POST", body: parsed.data, response: okResultSchema });
      setView("done");
    } catch (error) {
      if (errorCode(error) === "VALIDATION_FAILED") setView("expired");
      else fail(error);
    } finally {
      setBusy(false);
    }
  };

  const failureNotice = failure ? (
    <Notice tone="error" live>
      <p>{failure}</p>
    </Notice>
  ) : null;

  if (view === "sent") {
    return (
      <section className={`${styles.card} ${styles.stateCard}`} aria-labelledby="reset-state">
        <IconBadge tone="success">
          <CheckIcon />
        </IconBadge>
        <h1 id="reset-state" className={styles.stateTitle} tabIndex={-1} ref={(element) => element?.focus()}>
          Check your email
        </h1>
        <p className={styles.intro}>If an account uses {email}, a reset link is on its way.</p>
      </section>
    );
  }

  if (view === "expired") {
    return (
      <section className={`${styles.card} ${styles.stateCard}`} aria-labelledby="reset-state">
        <h1 id="reset-state" className={styles.stateTitle}>
          This reset link has expired
        </h1>
        <p className={styles.intro}>Reset links expire. Request a new one.</p>
        <ButtonLink fullWidth className={styles.primary} href="/forgot-password">
          Request a new link
        </ButtonLink>
      </section>
    );
  }

  if (view === "done") {
    return (
      <section className={`${styles.card} ${styles.stateCard}`} aria-labelledby="reset-state">
        <IconBadge tone="success">
          <CheckIcon />
        </IconBadge>
        <h1 id="reset-state" className={styles.stateTitle} tabIndex={-1} ref={(element) => element?.focus()}>
          Password changed
        </h1>
        <p className={styles.intro}>All your other sessions were signed out. Sign in with your new password.</p>
        <ButtonLink fullWidth className={styles.primary} href="/sign-in?next=/account">
          Sign in
        </ButtonLink>
      </section>
    );
  }

  if (view === "new") {
    return (
      <section className={styles.card} aria-labelledby="reset-title">
        <h1 id="reset-title" className={styles.title}>
          Choose a new password
        </h1>
        {failureNotice}
        <form className={styles.form} noValidate onSubmit={save}>
          <FormField label="New password" id="reset-password" hint="At least 12 characters." error={errors.newPassword}>
            <PasswordInput name="newPassword" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </FormField>
          <p className={styles.support}>Saving signs you out on every other device.</p>
          <Button type="submit" fullWidth loading={busy}>
            Save new password
          </Button>
        </form>
      </section>
    );
  }

  return (
    <section className={styles.card} aria-labelledby="reset-title">
      <h1 id="reset-title" className={styles.title}>
        Reset your password
      </h1>
      <p className={styles.intro}>Enter your account email. We&apos;ll send a reset link.</p>
      {failureNotice}
      <form className={styles.form} noValidate onSubmit={request}>
        <FormField label="Email" id="reset-email" error={errors.email}>
          <TextField type="email" name="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </FormField>
        <Button type="submit" fullWidth loading={busy}>
          Send reset link
        </Button>
      </form>
    </section>
  );
}
