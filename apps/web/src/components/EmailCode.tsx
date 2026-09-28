"use client";

import { ApiError, type EmailCodePurpose, emailCodeSentSchema, emailCodeVerifiedSchema } from "@holypearls/contracts";
import { Button, Dialog, Notice, OtpInput } from "@holypearls/ui";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { api, errorCode, errorReason } from "../lib/api";

type Step = "sending" | "enter" | "locked" | "error";

/**
 * Important actions (accepting a quote, approving a proof…) need an email code
 * within 24 hours in this session (TECH-03 §5). `run(action)` tries the action;
 * if the API answers RECENT_EMAIL_CODE_REQUIRED it sends a code, asks for it,
 * and runs the action again once the code is right.
 */
export function useEmailCode(purpose: EmailCodePurpose) {
  const [open, setOpen] = useState(false);
  const pending = useRef<(() => Promise<unknown>) | null>(null);

  const run = useCallback(async <T,>(action: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await action();
    } catch (error) {
      if (errorCode(error) !== "RECENT_EMAIL_CODE_REQUIRED") throw error;
      pending.current = action;
      setOpen(true);
      return undefined;
    }
  }, []);

  const dialog = (
    <EmailCodeDialog
      open={open}
      purpose={purpose}
      onClose={() => {
        pending.current = null;
        setOpen(false);
      }}
      onVerified={async () => {
        setOpen(false);
        const action = pending.current;
        pending.current = null;
        await action?.();
      }}
    />
  );
  return { run, dialog };
}

interface EmailCodeDialogProps {
  open: boolean;
  purpose: EmailCodePurpose;
  onClose: () => void;
  onVerified: () => Promise<void>;
}

function EmailCodeDialog({ open, purpose, onClose, onVerified }: EmailCodeDialogProps) {
  const [step, setStep] = useState<Step>("sending");
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<ReactNode>(null);
  const [busy, setBusy] = useState(false);

  const send = useCallback(async () => {
    setStep("sending");
    setCode("");
    setError(undefined);
    try {
      const sent = await api("/v1/email-codes", { method: "POST", body: { purpose }, response: emailCodeSentSchema });
      setSentTo(sent.sentTo);
      setStep("enter");
    } catch (failure) {
      setStep("error");
      setNotice(errorCode(failure) === "RATE_LIMITED" ? "Too many codes asked for. Wait a minute, then try again." : "We couldn't send the code. Try again.");
    }
  }, [purpose]);

  // A fresh code each time the dialog opens.
  useEffect(() => {
    if (open) void send();
  }, [open, send]);

  const verify = async (event: FormEvent) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await api("/v1/email-codes/verify", { method: "POST", body: { purpose, code }, response: emailCodeVerifiedSchema });
      await onVerified();
    } catch (failure) {
      const reason = errorReason(failure);
      if (reason === "CODE_LOCKED") setStep("locked");
      else if (reason === "CODE_EXPIRED" || reason === "NO_CODE") {
        setError("This code has expired. Send a new one.");
      } else if (failure instanceof ApiError && failure.body.fieldErrors?.code) setError(failure.body.fieldErrors.code);
      else setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const footer =
    step === "enter" ? (
      <>
        <Button variant="secondary" onClick={() => void send()}>
          Send a new code
        </Button>
        <Button type="submit" form="email-code-form" loading={busy}>
          Continue
        </Button>
      </>
    ) : step === "sending" ? null : (
      <Button onClick={() => void send()}>Send a new code</Button>
    );

  return (
    <Dialog open={open} onClose={onClose} title="Check your email" footer={footer}>
      {step === "sending" ? <p aria-live="polite">Sending a code…</p> : null}
      {step === "enter" ? (
        <form id="email-code-form" noValidate onSubmit={verify}>
          <p>
            We sent a 6-digit code to <strong>{sentTo}</strong>. It works for 10 minutes. After that, this device won’t ask again for 24 hours.
          </p>
          <OtpInput id="email-code" value={code} onChange={setCode} error={error} autoFocus />
        </form>
      ) : null}
      {step === "locked" ? (
        <Notice tone="error" title="Too many tries" live>
          <p>Send a new code to try again.</p>
        </Notice>
      ) : null}
      {step === "error" ? (
        <Notice tone="error" title="Code not sent" live>
          <p>{notice}</p>
        </Notice>
      ) : null}
    </Dialog>
  );
}
