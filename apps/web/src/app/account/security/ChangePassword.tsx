"use client";

import { changePasswordRequestSchema, okResultSchema, toFieldErrors } from "@holypearls/contracts";
import { Button, FormField, Notice, PasswordInput } from "@holypearls/ui";
import { api, errorCode, errorReason } from "@holypearls/web-kit/api";
import { type FormEvent, useState } from "react";
import styles from "../account.module.css";

/** Change password (Pen frame 90): the API ends every other session when it saves (TECH-03 §4). */
export function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setErrors({});
    setFailure(null);
    const parsed = changePasswordRequestSchema.safeParse({ currentPassword, newPassword });
    if (!parsed.success) return setErrors(toFieldErrors(parsed.error));
    setBusy(true);
    try {
      await api("/v1/auth/change-password", { method: "POST", body: parsed.data, response: okResultSchema });
      setDone(true);
      setOpen(false);
      setCurrent("");
      setNew("");
    } catch (error) {
      if (errorReason(error) === "INVALID_PASSWORD") setErrors({ currentPassword: "That isn't your current password" });
      else if (errorCode(error) === "RATE_LIMITED") setFailure("Too many attempts. Try again in a few minutes.");
      else setFailure("We couldn't change your password. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.card} aria-labelledby="password-title">
      <h2 id="password-title" className={styles.cardTitle}>
        Password
      </h2>
      <p className={styles.support}>Changing your password signs you out everywhere else.</p>
      {done ? (
        <Notice tone="success" title="Password changed" live>
          <p>You&apos;re still signed in here. Every other session was signed out.</p>
        </Notice>
      ) : null}
      {failure ? (
        <Notice tone="error" live>
          <p>{failure}</p>
        </Notice>
      ) : null}
      {open ? (
        <form className={styles.form} noValidate onSubmit={submit}>
          <FormField label="Current password" id="current-password" error={errors.currentPassword}>
            <PasswordInput name="currentPassword" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrent(event.target.value)} />
          </FormField>
          <FormField label="New password" id="new-password" hint="At least 12 characters." error={errors.newPassword}>
            <PasswordInput name="newPassword" autoComplete="new-password" value={newPassword} onChange={(event) => setNew(event.target.value)} />
          </FormField>
          <div className={styles.formActions}>
            <Button type="submit" loading={busy}>
              Save new password
            </Button>
            <Button variant="tertiary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div>
          <Button variant="secondary" onClick={() => setOpen(true)}>
            Change password
          </Button>
        </div>
      )}
    </section>
  );
}
