"use client";

import { type DemoSlice, demoSliceCreateSchema, demoSliceSchema, toFieldErrors } from "@holypearls/contracts";
import { Button, Card, FormField, Notice, StatusChip, TextField } from "@holypearls/ui";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "../../../lib/api";

const TONE = { PENDING: "info", DONE: "success", FAILED: "error" } as const;

export function SliceDemo() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState<DemoSlice | null>(null);

  useEffect(() => {
    if (!demo || demo.status !== "PENDING") return;
    const timer = setTimeout(async () => {
      setDemo(await api(`/v1/demo/slice/${demo.id}`, { response: demoSliceSchema }));
    }, 1000);
    return () => clearTimeout(timer);
  }, [demo]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = demoSliceCreateSchema.safeParse({ message });
    if (!parsed.success) {
      setError(toFieldErrors(parsed.error).message);
      return;
    }
    setError(undefined);
    setBusy(true);
    try {
      setDemo(await api("/v1/demo/slice", { method: "POST", body: parsed.data, response: demoSliceSchema }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <h1>End-to-end slice</h1>
      <p>Your message is saved, a background job turns it into capitals, and the result appears here. Include “fail” to see retries and the dead-letter queue.</p>
      <form noValidate onSubmit={onSubmit}>
        <FormField label="Message" id="slice-message" error={error}>
          <TextField value={message} onChange={(event) => setMessage(event.target.value)} />
        </FormField>
        <Button type="submit" loading={busy}>
          Send
        </Button>
      </form>
      {demo ? (
        <div aria-live="polite">
          <StatusChip tone={TONE[demo.status]}>{demo.status}</StatusChip>
          {demo.result ? <p data-testid="slice-result">{demo.result}</p> : null}
          {demo.status === "FAILED" ? (
            <Notice tone="error" title="The job failed">
              <p>It was retried and then moved to the dead-letter queue after {demo.attempts} attempts.</p>
            </Notice>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
