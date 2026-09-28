"use client";

import { createHelpRequestSchema, type HelpContext, helpRequestSchema, toFieldErrors } from "@holypearls/contracts";
import { Button, ButtonLink, Dialog, ErrorSummary, FormField, Notice, TextArea, TextField } from "@holypearls/ui";
import { useState, type FormEvent } from "react";
import { api } from "../lib/api";
import styles from "./auth.module.css";

export interface NeedHelpProps {
  /** Everything staff need, so the customer never explains from scratch (PRD-00 §18). IDs and labels only. */
  context: HelpContext;
  /** Signed-in customers reply to their account's email; guests give one. */
  signedIn?: boolean;
  label?: string;
  variant?: "secondary" | "tertiary";
}

const FIELDS = { message: "help-message", email: "help-email", name: "help-name" } as const;

/**
 * "Need help" / "Ask HolyPearls" (PUB-FR-015, PROJ-FR-008). Sends the
 * message with the page's context attached; the customer sees their request
 * and replies at /help/:id.
 */
export function NeedHelp({ context, signedIn = false, label = "Need help?", variant = "secondary" }: NeedHelpProps) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ id: string; reference: string } | null>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFailure(false);
    const parsed = createHelpRequestSchema.safeParse({
      message,
      context,
      ...(signedIn ? {} : { email: email || undefined, name: name || undefined }),
    });
    const fieldErrors = parsed.success ? {} : toFieldErrors(parsed.error);
    if (!signedIn && !email) fieldErrors.email ??= "Enter your email so we can reply";
    if (!parsed.success || Object.keys(fieldErrors).length) {
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const created = await api("/v1/help-requests", { method: "POST", body: parsed.data, response: helpRequestSchema });
      setSent({ id: created.id, reference: created.reference });
    } catch {
      setFailure(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={sent ? "We got your question" : "Ask HolyPearls"}>
        {sent ? (
          <>
            <Notice tone="success" title={`Request ${sent.reference} sent`}>
              <p>We attached the page you were on, so you won&apos;t need to explain again. We&apos;ll reply by email.</p>
            </Notice>
            <ButtonLink href={`/help/${sent.id}`} variant="secondary">
              See your request
            </ButtonLink>
          </>
        ) : (
          <form className={styles.form} noValidate onSubmit={onSubmit}>
            <p className={styles.support}>
              We&apos;ll see this page with your question: {context.product?.label ?? context.page.title}
              {context.step ? `, step ${context.step}` : ""}.
            </p>
            {Object.keys(errors).length ? (
              <ErrorSummary
                errors={Object.entries(errors).map(([field, text]) => ({ fieldId: FIELDS[field as keyof typeof FIELDS] ?? FIELDS.message, message: text }))}
              />
            ) : null}
            {failure ? (
              <Notice tone="error" title="We couldn't send it" live>
                <p>Try again in a moment.</p>
              </Notice>
            ) : null}
            <FormField label="Your question" id={FIELDS.message} error={errors.message}>
              <TextArea value={message} onChange={(event) => setMessage(event.target.value)} />
            </FormField>
            {signedIn ? null : (
              <>
                <FormField label="Email" id={FIELDS.email} hint="We'll reply here." error={errors.email}>
                  <TextField type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
                </FormField>
                <FormField label="Name" id={FIELDS.name} optional>
                  <TextField autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} />
                </FormField>
              </>
            )}
            <Button type="submit" loading={busy}>
              Send to HolyPearls
            </Button>
          </form>
        )}
      </Dialog>
    </>
  );
}
