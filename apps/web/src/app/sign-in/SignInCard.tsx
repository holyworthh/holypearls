"use client";

import {
  magicLinkRequestSchema,
  okResultSchema,
  signInEmailRequestSchema,
  signInResultSchema,
  toFieldErrors,
} from "@holypearls/contracts";
import {
  Button,
  ErrorSummary,
  FormField,
  IconBadge,
  Notice,
  PasswordInput,
  SegmentedTabs,
  TextField,
} from "@holypearls/ui";
import { useState, type FormEvent } from "react";
import styles from "@holypearls/web-kit/auth.module.css";
import { api, errorCode, safeNext } from "@holypearls/web-kit/api";

type Tab = "password" | "link";
type View = "form" | "rate-limited" | "link-sent" | "link-expired";

const TABS = [
  { value: "password", label: "Password" },
  { value: "link", label: "Email me a link" },
] as const;

const FIELD_IDS = { email: "sign-in-email", password: "sign-in-password" } as const;

const CheckIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M4 12.5l5 5L20 6.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);
const LinkOffIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);

export interface SignInCardProps {
  next?: string;
  /** Set when a magic link was expired or already used. */
  linkExpired?: boolean;
}

/** Customer sign-in (Pen frame 87 · PJmAF). An account is never required to order. */
export function SignInCard({ next, linkExpired = false }: SignInCardProps) {
  const destination = safeNext(next, "/account");
  const [tab, setTab] = useState<Tab>(linkExpired ? "link" : "password");
  const [view, setView] = useState<View>(linkExpired ? "link-expired" : "form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const summary = Object.entries(fieldErrors).map(([field, message]) => ({
    fieldId: FIELD_IDS[field as keyof typeof FIELD_IDS] ?? FIELD_IDS.email,
    message,
  }));

  const handleError = (error: unknown) => {
    const code = errorCode(error);
    if (code === "RATE_LIMITED") setView("rate-limited");
    else if (code === "NOT_SIGNED_IN") setFailure("Check your email and password, then try again.");
    else setFailure("Something went wrong on our side. Try again shortly.");
  };

  const sendLink = async () => {
    const parsed = magicLinkRequestSchema.safeParse({
      email,
      callbackURL: destination,
      errorCallbackURL: `/sign-in?link=expired&next=${encodeURIComponent(destination)}`,
    });
    if (!parsed.success) {
      setFieldErrors(toFieldErrors(parsed.error));
      return;
    }
    setBusy(true);
    try {
      await api("/v1/auth/sign-in/magic-link", { method: "POST", body: parsed.data, response: okResultSchema });
      setView("link-sent");
    } catch (error) {
      handleError(error);
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFailure(null);
    setFieldErrors({});
    if (tab === "link") return sendLink();

    const parsed = signInEmailRequestSchema.safeParse({ email, password });
    if (!parsed.success) {
      setFieldErrors(toFieldErrors(parsed.error));
      return;
    }
    setBusy(true);
    try {
      await api("/v1/auth/sign-in/email", { method: "POST", body: parsed.data, response: signInResultSchema });
      // Staff accounts sign in on the admin site only (ADR-017); the API refuses them here.
      window.location.assign(destination);
    } catch (error) {
      handleError(error);
      setBusy(false);
    }
  };

  if (view === "rate-limited") {
    return (
      <section className={`${styles.card} ${styles.stateCard}`} aria-labelledby="sign-in-state">
        <h1 id="sign-in-state" className={styles.stateTitle}>
          Too many attempts
        </h1>
        <p className={styles.intro}>
          For your security, sign-in is paused for this email. Try again later, or use a sign-in link.
        </p>
        <Notice tone="warning" live>
          <p>Attempts are limited to protect your account.</p>
        </Notice>
        <Button
          variant="secondary"
          fullWidth
          className={styles.primary}
          onClick={() => {
            setTab("link");
            setView("form");
          }}
        >
          Email me a sign-in link
        </Button>
      </section>
    );
  }

  if (view === "link-sent") {
    return (
      <section className={`${styles.card} ${styles.stateCard}`} aria-labelledby="sign-in-state">
        <IconBadge tone="success">
          <CheckIcon />
        </IconBadge>
        <h1 id="sign-in-state" className={styles.stateTitle} tabIndex={-1} ref={(element) => element?.focus()}>
          Check your email
        </h1>
        <p className={styles.intro}>We sent a sign-in link to {email}. It works once and expires soon.</p>
        <Button variant="secondary" fullWidth className={styles.primary} loading={busy} onClick={() => void sendLink()}>
          Resend link
        </Button>
        <p className={styles.signUp}>
          Wrong email?
          <button type="button" className={styles.link} onClick={() => setView("form")}>
            Go back
          </button>
        </p>
      </section>
    );
  }

  if (view === "link-expired") {
    return (
      <section className={`${styles.card} ${styles.stateCard}`} aria-labelledby="sign-in-state">
        <IconBadge tone="error">
          <LinkOffIcon />
        </IconBadge>
        <h1 id="sign-in-state" className={styles.stateTitle}>
          This sign-in link no longer works
        </h1>
        <p className={styles.intro}>Links work once and expire. Request a new one.</p>
        <Button
          fullWidth
          className={styles.primary}
          onClick={() => {
            setTab("link");
            setView("form");
          }}
        >
          Send a new link
        </Button>
      </section>
    );
  }

  const problemCount = summary.length;
  return (
    <section className={styles.card} aria-labelledby="sign-in-title">
      <h1 id="sign-in-title" className={styles.title}>
        Sign in
      </h1>
      <p className={styles.intro}>See your orders, quotes and saved drafts. You never need an account to order.</p>
      <SegmentedTabs
        label="How to sign in"
        idPrefix="sign-in"
        tabs={TABS}
        value={tab}
        onChange={(value) => {
          setTab(value);
          setFieldErrors({});
          setFailure(null);
        }}
      />
      {problemCount > 0 ? (
        <ErrorSummary
          title="We couldn't sign you in"
          errors={summary.map((item) => ({ ...item, message: item.message }))}
        />
      ) : null}
      {failure ? (
        <Notice tone="error" title="We couldn't sign you in" live>
          <p>{failure}</p>
        </Notice>
      ) : null}
      <form
        className={styles.form}
        id={`sign-in-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`sign-in-tab-${tab}`}
        noValidate
        onSubmit={onSubmit}
      >
        <FormField label="Email" id={FIELD_IDS.email} error={fieldErrors.email}>
          <TextField
            type="email"
            name="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </FormField>
        {tab === "password" ? (
          <>
            <FormField label="Password" id={FIELD_IDS.password} error={fieldErrors.password}>
              <PasswordInput
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </FormField>
            <a className={styles.link} href="/forgot-password">
              Forgot password?
            </a>
            <Button type="submit" fullWidth loading={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </Button>
            <p className={styles.signUp}>
              New here?
              <a className={styles.link} href="/sign-up">
                Create an account
              </a>
            </p>
          </>
        ) : (
          <>
            <p className={styles.support}>We&apos;ll email you a link that signs you in once. It expires in 10 minutes.</p>
            <Button type="submit" fullWidth loading={busy}>
              Email me a sign-in link
            </Button>
          </>
        )}
      </form>
    </section>
  );
}
