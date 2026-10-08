"use client";

import { signUpRequestSchema, signInResultSchema, toFieldErrors } from "@holypearls/contracts";
import { Button, ButtonLink, ErrorSummary, FormField, IconBadge, Notice, PasswordInput, TextField } from "@holypearls/ui";
import { api, errorCode, errorReason } from "@holypearls/web-kit/api";
import styles from "@holypearls/web-kit/auth.module.css";
import { type FormEvent, useState } from "react";
import { ResendVerification } from "../../components/account/ResendVerification";

const FIELD_IDS = { name: "sign-up-name", email: "sign-up-email", password: "sign-up-password" } as const;

const MailIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M3 6h18v12H3zM3 7l9 6 9-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
  </svg>
);

/** Sign-up, then "verify your email" (Pen frame 88: gxYdT, fybRd, states cBzxc). */
export function SignUpCard() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [view, setView] = useState<"form" | "pending" | "taken">("form");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setErrors({});
    setFailure(null);
    const parsed = signUpRequestSchema.safeParse({ name, email, password, callbackURL: "/sign-up/verified" });
    if (!parsed.success) return setErrors(toFieldErrors(parsed.error));
    setBusy(true);
    try {
      await api("/v1/auth/sign-up/email", { method: "POST", body: parsed.data, response: signInResultSchema });
      setView("pending");
    } catch (error) {
      if (errorReason(error)?.startsWith("USER_ALREADY_EXISTS")) setView("taken");
      else if (errorCode(error) === "RATE_LIMITED") setFailure("Too many attempts. Try again in a few minutes.");
      else if (errorReason(error) === "PASSWORD_TOO_SHORT") setErrors({ password: "Use at least 12 characters" });
      else setFailure("Something went wrong on our side. Try again shortly.");
    } finally {
      setBusy(false);
    }
  };

  if (view === "pending") {
    return (
      <section className={`${styles.card} ${styles.stateCard}`} aria-labelledby="sign-up-state">
        <IconBadge tone="neutral">
          <MailIcon />
        </IconBadge>
        <h1 id="sign-up-state" className={styles.stateTitle} tabIndex={-1} ref={(element) => element?.focus()}>
          Verify your email
        </h1>
        <p className={styles.intro}>We sent a link to {email}. Until you verify, no earlier guest orders are linked.</p>
        <ResendVerification email={email} fullWidth />
      </section>
    );
  }

  if (view === "taken") {
    return (
      <section className={styles.card} aria-labelledby="sign-up-title">
        <h1 id="sign-up-title" className={styles.title}>
          Create an account
        </h1>
        <Notice tone="warning" live>
          <p>An account already uses this email. Sign in, or reset your password.</p>
        </Notice>
        <FormField label="Email" id={FIELD_IDS.email}>
          <TextField type="email" value={email} readOnly />
        </FormField>
        <ButtonLink fullWidth className={styles.primary} href="/sign-in?next=/account">
          Sign in instead
        </ButtonLink>
        <p className={styles.signUp}>
          Forgot your password?
          <a className={styles.link} href="/forgot-password">
            Reset it
          </a>
        </p>
      </section>
    );
  }

  const summary = Object.entries(errors).map(([field, message]) => ({ fieldId: FIELD_IDS[field as keyof typeof FIELD_IDS] ?? FIELD_IDS.email, message }));
  return (
    <section className={styles.card} aria-labelledby="sign-up-title">
      <h1 id="sign-up-title" className={styles.title}>
        Create an account
      </h1>
      <p className={styles.intro}>Keep your orders, quotes and drafts in one place. Earlier guest orders link after you verify this email.</p>
      {summary.length ? <ErrorSummary title="We couldn't create your account" errors={summary} /> : null}
      {failure ? (
        <Notice tone="error" title="We couldn't create your account" live>
          <p>{failure}</p>
        </Notice>
      ) : null}
      <form className={styles.form} noValidate onSubmit={submit}>
        <FormField label="Full name" id={FIELD_IDS.name} error={errors.name}>
          <TextField name="name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} />
        </FormField>
        <FormField label="Email" id={FIELD_IDS.email} error={errors.email}>
          <TextField type="email" name="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </FormField>
        <FormField label="Password" id={FIELD_IDS.password} hint="At least 12 characters." error={errors.password}>
          <PasswordInput name="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </FormField>
        <Button type="submit" fullWidth loading={busy}>
          {busy ? "Creating account…" : "Create account"}
        </Button>
        <p className={styles.signUp}>
          Have an account?
          <a className={styles.link} href="/sign-in">
            Sign in
          </a>
        </p>
      </form>
    </section>
  );
}
