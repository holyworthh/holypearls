"use client";

import { type DemoSlice, type FileView, demoSliceCreateSchema, demoSliceSchema, toFieldErrors } from "@holypearls/contracts";
import { Button, Card, FormField, Notice, StatusChip, TextField } from "@holypearls/ui";
import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import { useEmailCode } from "../../../components/EmailCode";
import { FileUpload } from "../../../components/FileUpload";
import { NeedHelp } from "../../../components/NeedHelp";
import { api, errorCode } from "@holypearls/web-kit/api";

const TONE = { PENDING: "info", DONE: "success", FAILED: "error" } as const;

export function SliceDemo() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState<DemoSlice | null>(null);
  const [file, setFile] = useState<FileView | null>(null);
  const emailCode = useEmailCode("VERIFY_ACTION");
  const [important, setImportant] = useState<"done" | "signed-out" | null>(null);

  const tryImportant = async () => {
    setImportant(null);
    try {
      const result = await emailCode.run(() => api("/v1/demo/slice/important-action", { method: "POST", body: {}, response: z.object({ done: z.literal(true) }) }).then(() => setImportant("done")));
      return result;
    } catch (failure) {
      if (errorCode(failure) === "NOT_SIGNED_IN") setImportant("signed-out");
      else throw failure;
    }
  };

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
      <h2>Important action</h2>
      <p>Accepting a quote or approving a proof asks for a code from your email, at most once a day on each device.</p>
      <Button variant="secondary" onClick={() => void tryImportant()}>
        Try an important action
      </Button>
      {important === "done" ? (
        <Notice tone="success" title="Done" live>
          <p>The important action went through.</p>
        </Notice>
      ) : null}
      {important === "signed-out" ? (
        <Notice tone="info" title="Sign in first" live>
          <p>Important actions need you to be signed in, or to have opened a link we emailed you.</p>
        </Notice>
      ) : null}
      {emailCode.dialog}
      <h2>Attach a file</h2>
      <p>Uploads go straight to storage; the worker checks the real type and makes a preview.</p>
      <FileUpload purpose="ARTWORK" onChange={setFile} />
      <NeedHelp
        context={{
          ...(file ? { files: [{ id: file.id, label: file.name, status: file.status }] } : {}),
          page: { path: "/dev/slice", title: "End-to-end slice (demo)" },
          step: "Send a message",
          ...(demo ? { project: { id: demo.id, label: `Demo request ${demo.status}` } } : {}),
        }}
      />
    </Card>
  );
}
