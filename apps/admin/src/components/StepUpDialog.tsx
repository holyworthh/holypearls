"use client";

import { okResultSchema, totpCodeSchema } from "@holypearls/contracts";
import { Button, Dialog, OtpInput } from "@holypearls/ui";
import { api, errorCode } from "@holypearls/web-kit/api";
import { useState } from "react";

/**
 * Step-up for high-risk actions (TECH-03 §9; Pen HP/Admin/StepUpMFA, frame
 * 100 didZV). Opens when the API answers RECENT_MFA_REQUIRED; a correct code
 * refreshes the session's check, then the action runs again.
 */
export function StepUpDialog({ open, action, confirmLabel, onClose, onVerified }: { open: boolean; action: string; confirmLabel: string; onClose: () => void; onVerified: () => void | Promise<void> }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    const parsed = totpCodeSchema.safeParse({ code });
    if (!parsed.success) {
      setError("Enter the 6-digit code from your authenticator app");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await api("/v1/auth/two-factor/verify-totp", { method: "POST", body: parsed.data, response: okResultSchema });
      setCode("");
      await onVerified();
    } catch (failure) {
      setError(errorCode(failure) === "RATE_LIMITED" ? "Too many attempts. Wait a minute and try again." : "That code didn't work. Check your app and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Confirm with your authenticator"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={confirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p>This is a high-risk action. Enter the 6-digit code from your authenticator app. Your last check was more than 15 minutes ago.</p>
      <p>
        <strong>Action:</strong> {action}
      </p>
      <OtpInput value={code} onChange={setCode} error={error} autoFocus />
    </Dialog>
  );
}
