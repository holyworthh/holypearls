"use client";

import { okResultSchema } from "@holypearls/contracts";
import { Button } from "@holypearls/ui";
import { api, errorCode } from "@holypearls/web-kit/api";
import { useState } from "react";

/** Sends the account's email check again (TECH-03 §6). The link brings the person back signed in. */
export function ResendVerification({ email, label = "Resend verification email", fullWidth = false }: { email: string; label?: string; fullWidth?: boolean }) {
  const [state, setState] = useState<"idle" | "busy" | "sent" | "limited" | "failed">("idle");
  const send = async () => {
    setState("busy");
    try {
      await api("/v1/auth/send-verification-email", { method: "POST", body: { email, callbackURL: "/sign-up/verified" }, response: okResultSchema });
      setState("sent");
    } catch (error) {
      setState(errorCode(error) === "RATE_LIMITED" ? "limited" : "failed");
    }
  };
  return (
    <div>
      <Button variant="secondary" fullWidth={fullWidth} loading={state === "busy"} onClick={() => void send()}>
        {label}
      </Button>
      <p role="status" aria-live="polite">
        {state === "sent" ? `Sent. Check ${email}.` : state === "limited" ? "Too many requests. Try again in a few minutes." : state === "failed" ? "We couldn't send it. Try again." : ""}
      </p>
    </div>
  );
}
