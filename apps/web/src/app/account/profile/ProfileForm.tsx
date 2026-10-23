"use client";

import { okResultSchema, profileInputSchema, profileSchema, toFieldErrors } from "@holypearls/contracts";
import { Button, Checkbox, FormField, Notice, TextField } from "@holypearls/ui";
import { api, errorCode, errorReason } from "@holypearls/web-kit/api";
import { z } from "zod";
import { type FormEvent, useState } from "react";
import styles from "../account.module.css";

interface Initial {
  name: string;
  email: string;
  phone: string | null;
  emailVerified: boolean;
  pendingEmail: string | null;
  marketingConsent: boolean;
}

const CALLBACK = "/account/profile?email=changed";

/**
 * Name, email and phone (Pen 91). The phone needs a verified email, because it
 * lives on the account's own customer record. A new email is checked first:
 * the account keeps the old one until the link is opened, and opening it
 * signs the account out on other devices (TECH-03 §4).
 */
export function ProfileForm({ initial }: { initial: Initial }) {
  const [name, setName] = useState(initial.name);
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [email, setEmail] = useState(initial.email);
  const [news, setNews] = useState(initial.marketingConsent);
  const [pending, setPending] = useState(initial.pendingEmail);
  const [resend, setResend] = useState<"idle" | "busy" | "sent" | "failed">("idle");

  /** Asks for the check link; the library never says whether the address already has an account. */
  const requestChange = (newEmail: string) => api("/v1/auth/change-email", { method: "POST", body: { newEmail, callbackURL: CALLBACK }, response: okResultSchema });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<"idle" | "saving" | "saved" | "failed">("idle");

  const save = async (event?: FormEvent) => {
    event?.preventDefault();
    setErrors({});
    const parsed = profileInputSchema.safeParse({ name, phone });
    const newEmail = email.trim().toLowerCase();
    const emailChanged = newEmail !== initial.email.toLowerCase();
    const emailError = emailChanged && !z.email().safeParse(newEmail).success ? "Enter an email address like name@example.com" : undefined;
    if (!parsed.success || emailError) {
      setErrors({ ...(parsed.success ? {} : toFieldErrors(parsed.error)), ...(emailError ? { email: emailError } : {}) });
      setState("idle");
      return;
    }
    setState("saving");
    try {
      const saved = await api("/v1/me/profile", { method: "PATCH", body: { name, phone, marketingConsent: news }, response: profileSchema });
      setName(saved.name);
      setPhone(saved.phone ?? "");
      setNews(saved.marketingConsent);
      if (emailChanged && newEmail !== pending) {
        await requestChange(newEmail).catch((error: unknown) => {
          throw Object.assign(new Error("email"), { field: errorCode(error) === "RATE_LIMITED" ? "Too many requests. Try again in a few minutes." : "We couldn't send the check to that address. Try again." });
        });
        setPending(newEmail);
      }
      setEmail(initial.email);
      setState("saved");
    } catch (error) {
      if (error instanceof Error && "field" in error) {
        setErrors({ email: String(error.field) });
        setState("idle");
      } else if (errorReason(error) === "VERIFY_EMAIL_FIRST") {
        setErrors({ phone: "Verify your email first, then add a phone number or turn on product news." });
        setState("idle");
      } else setState("failed");
    }
  };

  return (
    <section className={styles.card} aria-labelledby="profile-details">
      <h2 id="profile-details" className={styles.cardTitle}>
        Your details
      </h2>
      {pending ? (
        <Notice tone="info" title="Verify your new email" live>
          <p>
            We sent a link to {pending}. Your email stays {initial.email} until you verify.
          </p>
          <Button
            variant="secondary"
            loading={resend === "busy"}
            onClick={() => {
              setResend("busy");
              requestChange(pending).then(
                () => setResend("sent"),
                () => setResend("failed"),
              );
            }}
          >
            Resend link
          </Button>
          <p role="status" aria-live="polite">
            {resend === "sent" ? `Sent again to ${pending}.` : resend === "failed" ? "We couldn't send it. Try again." : ""}
          </p>
        </Notice>
      ) : null}
      {state === "failed" ? (
        <Notice tone="error" title="Not saved" live>
          <p>We couldn&apos;t save your changes. Your edits are still here.</p>
          <Button variant="secondary" onClick={() => void save()}>
            Try again
          </Button>
        </Notice>
      ) : null}
      <form className={styles.form} noValidate onSubmit={save}>
        <FormField label="Full name" id="profile-name" error={errors.name}>
          <TextField name="name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} />
        </FormField>
        <FormField label="Email" id="profile-email" hint="Changing your email needs verification and signs you out on other devices." error={errors.email}>
          <TextField name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </FormField>
        <FormField label="Phone" optional id="profile-phone" hint={initial.emailVerified ? "Used only for delivery questions." : "Verify your email to add a phone number. Used only for delivery questions."} error={errors.phone}>
          <TextField name="phone" type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} />
        </FormField>
        <Checkbox id="profile-news" checked={news} onChange={(event) => setNews(event.target.checked)} label="Send me product news and offers (optional)" hint={initial.emailVerified ? undefined : "Verify your address to turn this on."} />
        {state === "saved" && news ? (
          <Notice tone="success" live>
            <p>You&apos;ll get product news. Turn this off any time in Profile.</p>
          </Notice>
        ) : null}
        <div className={styles.formActions}>
          <Button type="submit" loading={state === "saving"}>
            {state === "saving" ? "Saving…" : "Save changes"}
          </Button>
          <span className={styles.saveState} role="status" aria-live="polite">
            {state === "saved" ? "Saved just now" : ""}
          </span>
        </div>
      </form>
    </section>
  );
}
