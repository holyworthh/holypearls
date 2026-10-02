"use client";

import { ApiError, okResultSchema } from "@holypearls/contracts";
import { Button, ButtonLink, FormField, Notice, TextField } from "@holypearls/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, newIdempotencyKey } from "../../lib/api";
import s from "./forms.module.css";

/** Confirm the cancellation (Pen 127 AnFEQ), with an optional reason; "Cancel failed" leaves the order as it was. */
export function CancelForm({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [key] = useState(() => newIdempotencyKey());

  const cancel = async () => {
    setBusy(true);
    setFailed(null);
    try {
      await api(`/v1/orders/${orderId}/cancel`, { method: "POST", body: { reason: reason.trim() || undefined }, headers: { "idempotency-key": key }, response: okResultSchema });
      router.push(`/orders/${orderId}`);
      router.refresh();
    } catch (problem) {
      setFailed(problem instanceof ApiError && problem.body.code !== "INTERNAL" ? problem.body.message : "We couldn't cancel right now. Your order hasn't changed. Try again or contact support.");
      setBusy(false);
    }
  };

  return (
    <>
      {failed ? (
        <Notice tone="error" title="Not cancelled" live>
          {failed}
        </Notice>
      ) : null}
      <FormField id="cancel-reason" label="Reason" optional>
        <TextField maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
      </FormField>
      <div className={s.actions}>
        <Button type="button" variant="destructive" loading={busy} onClick={() => void cancel()}>
          Cancel order
        </Button>
        <ButtonLink href={`/orders/${orderId}`} variant="secondary">
          Keep my order
        </ButtonLink>
      </div>
    </>
  );
}
