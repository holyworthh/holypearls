"use client";

import {
  enableTotpResultSchema,
  meSchema,
  okResultSchema,
  signInEmailRequestSchema,
  signInResultSchema,
  toFieldErrors,
  totpCodeSchema,
} from "@holypearls/contracts";
import { Button, ErrorSummary, FormField, Notice, OtpInput, PasswordInput, TextField } from "@holypearls/ui";
import QRCode from "qrcode";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import styles from "@holypearls/web-kit/auth.module.css";
import { api, errorCode } from "@holypearls/web-kit/api";

export type StaffStep = "credentials" | "code" | "enrol" | "expired" | "mfa-required";

function AdminLogo() {
  return (
    <p className={styles.adminLogo}>
      <span className={styles.adminBrand}>HolyPearls</span>
      <span className={styles.adminTicket}>STAFF ADMIN</span>
    </p>
  );
}

function StaffCard({ children, wide = false, label }: { children: ReactNode; wide?: boolean; label: string }) {
  return (
    <section className={`${styles.card} ${wide ? styles.enrolCard : styles.staffCard}`} aria-label={label}>
      <AdminLogo />
      {children}
    </section>
  );
}

/** Groups the base32 key in fours so it can be typed into an authenticator app. */
const formatKey = (key: string) => key.replace(/=+$/, "").match(/.{1,4}/g)?.join(" ") ?? key;

const FIELD_IDS = { email: "staff-email", password: "staff-password", code: "staff-code" } as const;

/**
 * Staff sign-in and MFA (Pen frame 93 · iFub2): sign-in, MFA challenge on
 * every sign-in, enrolment on first sign-in, and the 12-hour expiry state.
 */
export function StaffSignIn({ initialStep, resetBy }: { initialStep: StaffStep; resetBy?: string }) {
  const [step, setStep] = useState<StaffStep>(initialStep);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [enrolment, setEnrolment] = useState<{ key: string; qr: string } | null>(null);

  useEffect(() => {
    if (step !== "code") return;
    // Show whose authenticator to open when the session already knows it.
    void api("/v1/me", { response: meSchema })
      .then((me) => setEmail(me.email))
      .catch(() => undefined);
  }, [step]);

  const reset = () => {
    setFieldErrors({});
    setFailure(null);
  };

  const startEnrolment = async (currentPassword: string) => {
    const result = await api("/v1/auth/two-factor/enable", {
      method: "POST",
      body: { password: currentPassword },
      response: enableTotpResultSchema,
    });
    const key = new URL(result.totpURI).searchParams.get("secret") ?? "";
    const qr = await QRCode.toString(result.totpURI, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
    setEnrolment({ key, qr });
    setCode("");
    setStep("enrol");
  };

  const onCredentials = async (event: FormEvent) => {
    event.preventDefault();
    reset();
    const parsed = signInEmailRequestSchema.safeParse({ email, password });
    if (!parsed.success) {
      setFieldErrors(toFieldErrors(parsed.error));
      return;
    }
    setBusy(true);
    try {
      const result = await api("/v1/auth/sign-in/email", { method: "POST", body: parsed.data, response: signInResultSchema });
      if (result.twoFactorRedirect) {
        setCode("");
        setStep("code");
      } else {
        const me = await api("/v1/me", { response: meSchema });
        // A customer account can't use the admin (ADR-017): sign it out here and say where to go.
        if (!me.isStaff) {
          await api("/v1/auth/sign-out", { method: "POST", body: {}, response: okResultSchema }).catch(() => undefined);
          setFailure("Check your work email and password, then try again.");
        } else await startEnrolment(parsed.data.password);
      }
    } catch (error) {
      const failed = errorCode(error);
      setFailure(
        failed === "RATE_LIMITED"
          ? "Too many attempts. Wait a minute and try again."
          : failed === "NOT_SIGNED_IN"
            ? "Check your work email and password, then try again."
            : "Something went wrong on our side. Try again shortly.",
      );
    } finally {
      setBusy(false);
    }
  };

  const onEnrolPassword = async (event: FormEvent) => {
    event.preventDefault();
    reset();
    if (!password) {
      setFieldErrors({ password: "Enter your password" });
      return;
    }
    setBusy(true);
    try {
      await startEnrolment(password);
    } catch (error) {
      setFailure(errorCode(error) === "NOT_SIGNED_IN" ? "That password didn't work." : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const onCode = async (event: FormEvent) => {
    event.preventDefault();
    reset();
    const parsed = totpCodeSchema.safeParse({ code });
    if (!parsed.success) {
      setFieldErrors({ code: "Enter the 6-digit code from your authenticator app" });
      return;
    }
    setBusy(true);
    try {
      await api("/v1/auth/two-factor/verify-totp", { method: "POST", body: parsed.data, response: okResultSchema });
      window.location.assign("/");
    } catch (error) {
      const failed = errorCode(error);
      if (failed === "RATE_LIMITED") setFailure("Too many attempts. Wait a minute and try again.");
      else if (failed === "NOT_SIGNED_IN" && step === "code") {
        setFieldErrors({ code: "That code didn't work. Check your app and try again." });
      } else {
        setFieldErrors({ code: "That code didn't work. Check your app and try again." });
      }
      setCode("");
      setBusy(false);
    }
  };

  const summary = Object.entries(fieldErrors).map(([field, message]) => ({
    fieldId: FIELD_IDS[field as keyof typeof FIELD_IDS] ?? FIELD_IDS.email,
    message,
  }));
  const failureNotice = failure ? (
    <Notice tone="error" title="We couldn't sign you in" live>
      <p>{failure}</p>
    </Notice>
  ) : null;

  if (step === "expired") {
    return (
      <StaffCard label="Session ended">
        <Notice tone="neutral" title="Session ended">
          <p>Staff sessions end after 12 hours. Sign in again.</p>
        </Notice>
        <Button fullWidth className={styles.primary} onClick={() => setStep("credentials")}>
          Sign in
        </Button>
      </StaffCard>
    );
  }

  if (step === "mfa-required") {
    return (
      <StaffCard label="MFA required">
        {resetBy ? (
          <Notice tone="info" title="Set up MFA again">
            <p>Your MFA was reset by {resetBy}. Set it up again to continue.</p>
          </Notice>
        ) : (
          <Notice tone="warning" title="MFA required">
            <p>Admin is locked until you set up MFA.</p>
          </Notice>
        )}
        <form className={styles.form} noValidate onSubmit={onEnrolPassword}>
          {summary.length ? <ErrorSummary errors={summary} /> : null}
          {failureNotice}
          <FormField label="Password" id={FIELD_IDS.password} hint="Confirm it's you before adding an authenticator." error={fieldErrors.password}>
            <PasswordInput autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </FormField>
          <Button type="submit" fullWidth loading={busy}>
            Set up authenticator
          </Button>
        </form>
      </StaffCard>
    );
  }

  if (step === "enrol" && enrolment) {
    return (
      <StaffCard wide label="Set up your authenticator">
        <h1 className={styles.title}>Set up your authenticator</h1>
        <p className={styles.intro}>You can&apos;t use admin until MFA is set up.</p>
        <p className={styles.step}>
          <span className={styles.stepNumber} aria-hidden="true">
            1
          </span>
          Scan this code with your authenticator app
        </p>
        <div className={styles.qrRow}>
          <div className={styles.qr} role="img" aria-label="QR code for your authenticator app" dangerouslySetInnerHTML={{ __html: enrolment.qr }} />
          <div className={styles.key}>
            <span className={styles.support}>Can&apos;t scan? Enter this key:</span>
            <span className={styles.keyValue}>{formatKey(enrolment.key)}</span>
          </div>
        </div>
        <p className={styles.step}>
          <span className={styles.stepNumber} aria-hidden="true">
            2
          </span>
          Enter the 6-digit code it shows
        </p>
        <form className={styles.form} noValidate onSubmit={onCode}>
          {failureNotice}
          <OtpInput id={FIELD_IDS.code} value={code} onChange={setCode} error={fieldErrors.code} />
          <Button type="submit" fullWidth loading={busy}>
            Turn on MFA and continue
          </Button>
        </form>
      </StaffCard>
    );
  }

  if (step === "code") {
    return (
      <StaffCard label="Enter your code">
        <h1 className={styles.title}>Enter your code</h1>
        <p className={styles.intro}>Open your authenticator app{email ? ` for ${email}` : ""}.</p>
        <form className={styles.form} noValidate onSubmit={onCode}>
          {failureNotice}
          <OtpInput
            id={FIELD_IDS.code}
            value={code}
            onChange={setCode}
            autoFocus
            error={fieldErrors.code}
            hint="Codes change every 30 seconds. 5 attempts."
          />
          <Button type="submit" fullWidth loading={busy}>
            Verify
          </Button>
        </form>
        <p className={styles.support}>
          Lost your authenticator? Another STAFF_ADMIN can reset MFA after confirming who you are by phone.
        </p>
      </StaffCard>
    );
  }

  return (
    <StaffCard label="Staff sign-in">
      <h1 className={styles.title}>Staff sign-in</h1>
      <p className={styles.intro}>For HolyPearls staff only. Every staff account needs an authenticator app.</p>
      {summary.length ? <ErrorSummary title="We couldn't sign you in" errors={summary} /> : null}
      {failureNotice}
      <form className={styles.form} noValidate onSubmit={onCredentials}>
        <FormField label="Work email" id={FIELD_IDS.email} error={fieldErrors.email}>
          <TextField type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        </FormField>
        <FormField label="Password" id={FIELD_IDS.password} error={fieldErrors.password}>
          <PasswordInput autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </FormField>
        <Button type="submit" fullWidth loading={busy}>
          {busy ? "Signing in…" : "Continue"}
        </Button>
      </form>
      <p className={styles.support}>Staff sessions end after 12 hours.</p>
    </StaffCard>
  );
}
