"use client";

import { adminHelpRequestSchema } from "@holypearls/contracts";
import { Button, FormField, Notice, TextArea } from "@holypearls/ui";
import { useRef, useState, type FormEvent } from "react";
import styles from "../admin-list.module.css";
import { api, newIdempotencyKey } from "../../../../lib/api";

/** Reply by email (marks ANSWERED) and close (Pen frame 103: reply panel and mobile decision). */
export function HelpActions({ id, status, backTo }: { id: string; status: "OPEN" | "ANSWERED" | "CLOSED"; backTo: string }) {
  const key = useRef(newIdempotencyKey());
  const [body, setBody] = useState("");
  const [error, setError] = useState<string>();
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState<"reply" | "close" | null>(null);

  if (status === "CLOSED") return <p className={styles.hint}>This request is closed.</p>;

  const reply = async (event: FormEvent) => {
    event.preventDefault();
    if (!body.trim()) {
      setError("Write a reply");
      return;
    }
    setError(undefined);
    setFailure(null);
    setBusy("reply");
    try {
      await api(`/v1/admin/help-requests/${id}/replies`, {
        method: "POST",
        body: { body },
        response: adminHelpRequestSchema,
        headers: { "idempotency-key": key.current },
      });
      window.location.assign(`${backTo}&done=answered`);
    } catch {
      setFailure("We couldn't send the reply. Try again.");
      setBusy(null);
    }
  };

  const close = async () => {
    setBusy("close");
    try {
      await api(`/v1/admin/help-requests/${id}/close`, { method: "POST", response: adminHelpRequestSchema });
      window.location.assign(backTo);
    } catch {
      setFailure("We couldn't close it. Try again.");
      setBusy(null);
    }
  };

  return (
    <section className={styles.panel} aria-labelledby="reply-title">
      <h3 id="reply-title" className={styles.panelTitle}>
        Reply
      </h3>
      {failure ? (
        <Notice tone="error" title="Something went wrong" live>
          <p>{failure}</p>
        </Notice>
      ) : null}
      <form noValidate onSubmit={reply} className={styles.tableCol}>
        <FormField label="Reply to customer (sent by email)" id="help-reply" error={error}>
          <TextArea value={body} onChange={(event) => setBody(event.target.value)} />
        </FormField>
        <div className={styles.panelActions}>
          <Button type="submit" loading={busy === "reply"}>
            Send reply and mark ANSWERED
          </Button>
          <Button variant="secondary" loading={busy === "close"} onClick={() => void close()}>
            Close request
          </Button>
        </div>
      </form>
    </section>
  );
}
