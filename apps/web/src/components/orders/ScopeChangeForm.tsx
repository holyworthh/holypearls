"use client";

import { ApiError } from "@holypearls/contracts";
import { Button, ButtonLink, FormField, Notice, StatusChip, TextArea } from "@holypearls/ui";
import { useState } from "react";
import { z } from "zod";
import { api } from "../../lib/api";
import s from "./forms.module.css";

/** Send a scope change (Pen 127 BKgfl → "Scope change sent" B8zjd). */
export function ScopeChangeForm({ orderId }: { orderId: string }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const send = async () => {
    if (!text.trim()) {
      setError("Describe the change");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/v1/orders/${orderId}/change-requests`, { method: "POST", body: { description: text.trim() }, response: z.object({ items: z.array(z.unknown()) }) });
      setSent(true);
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.body.message : "We couldn't send that. Try again.");
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <>
        <Notice tone="success" title="Change request sent" live>
          <StatusChip tone="warning">OPEN</StatusChip> We&apos;ll reply with a new quote version if the price changes.
        </Notice>
        <ButtonLink href={`/orders/${orderId}`} variant="secondary">
          Back to order
        </ButtonLink>
      </>
    );
  }
  return (
    <div className={s.form}>
      <FormField id="scope-change" label="What do you want to change?" error={error ?? undefined}>
        <TextArea rows={4} maxLength={4000} value={text} onChange={(event) => setText(event.target.value)} />
      </FormField>
      <div className={s.actions}>
        <Button type="button" loading={busy} onClick={() => void send()}>
          Send change request
        </Button>
        <ButtonLink href={`/orders/${orderId}`} variant="secondary">
          Back to order
        </ButtonLink>
      </div>
    </div>
  );
}
