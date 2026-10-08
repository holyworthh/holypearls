"use client";

import { profileInputSchema, profileSchema, toFieldErrors } from "@holypearls/contracts";
import { Button, FormField, Notice, TextField } from "@holypearls/ui";
import { api, errorReason } from "@holypearls/web-kit/api";
import { type FormEvent, useState } from "react";
import styles from "../account.module.css";

interface Initial {
  name: string;
  email: string;
  phone: string | null;
  emailVerified: boolean;
}

/** Name and phone. The phone needs a verified email, because it lives on the account's own customer record. */
export function ProfileForm({ initial }: { initial: Initial }) {
  const [name, setName] = useState(initial.name);
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<"idle" | "saving" | "saved" | "failed">("idle");

  const save = async (event?: FormEvent) => {
    event?.preventDefault();
    setErrors({});
    const parsed = profileInputSchema.safeParse({ name, phone });
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error));
      setState("idle");
      return;
    }
    setState("saving");
    try {
      const saved = await api("/v1/me/profile", { method: "PATCH", body: { name, phone }, response: profileSchema });
      setName(saved.name);
      setPhone(saved.phone ?? "");
      setState("saved");
    } catch (error) {
      if (errorReason(error) === "VERIFY_EMAIL_FIRST") {
        setErrors({ phone: "Verify your email first, then add a phone number." });
        setState("idle");
      } else setState("failed");
    }
  };

  return (
    <section className={styles.card} aria-labelledby="profile-details">
      <h2 id="profile-details" className={styles.cardTitle}>
        Your details
      </h2>
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
        <FormField label="Email" id="profile-email" hint="To change the email on your account, contact us. Email changes need a check of the new address.">
          <TextField name="email" type="email" value={initial.email} readOnly />
        </FormField>
        <FormField label="Phone" optional id="profile-phone" hint={initial.emailVerified ? "Used only for delivery questions." : "Verify your email to add a phone number. Used only for delivery questions."} error={errors.phone}>
          <TextField name="phone" type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} />
        </FormField>
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
