"use client";

import { notificationEntrySchema } from "@holypearls/contracts";
import { Button, Notice } from "@holypearls/ui";
import { useRef, useState } from "react";
import { api, errorCode, newIdempotencyKey } from "@holypearls/web-kit/api";

export function ResendButton({ id }: { id: string }) {
  const key = useRef(newIdempotencyKey());
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const resend = async () => {
    setBusy(true);
    setFailure(null);
    try {
      const created = await api(`/v1/admin/notifications/${id}/resend`, {
        method: "POST",
        response: notificationEntrySchema,
        headers: { "idempotency-key": key.current },
      });
      window.location.assign(`/notifications?id=${created.id}&resent=1`);
    } catch (error) {
      setFailure(errorCode(error) === "RULE_FAILED" ? "This email can't be resent." : "We couldn't resend it. Try again.");
      setBusy(false);
    }
  };

  return (
    <>
      {failure ? (
        <Notice tone="error" title="Not resent" live>
          <p>{failure}</p>
        </Notice>
      ) : null}
      <Button fullWidth loading={busy} onClick={() => void resend()}>
        Resend email
      </Button>
    </>
  );
}
