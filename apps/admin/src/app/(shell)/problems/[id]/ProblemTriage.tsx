"use client";

import { type AdminProblem, adminProblemSchema, ApiError, PROBLEM_TYPE_LABEL } from "@holypearls/contracts";
import { Button, FormField, Notice, StatusChip, TextArea } from "@holypearls/ui";
import { api } from "@holypearls/web-kit/api";
import { useState } from "react";
import { z } from "zod";
import list from "../../admin-list.module.css";
import { formatTime } from "../../format";
import styles from "../../production/production.module.css";

const TONE = { NEW: "warning", TRIAGED: "info", CLOSED: "neutral" } as const;

/** Triage (Pen 129): an internal note, NEW → TRIAGED → CLOSED, and replies emailed to the customer. */
export function ProblemTriage({ initial }: { initial: AdminProblem }) {
  const [report, setReport] = useState(initial);
  const [note, setNote] = useState(initial.triageNote ?? "");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const run = async (name: string, call: () => Promise<AdminProblem>, done: string) => {
    setBusy(name);
    setResult(null);
    try {
      setReport(await call());
      setResult({ tone: "success", text: done });
    } catch (problem) {
      setResult({ tone: "error", text: problem instanceof ApiError ? (problem.body.code === "VERSION_CONFLICT" ? "Someone else updated this report. Reload and try again." : problem.body.message) : "Try again." });
    } finally {
      setBusy(null);
    }
  };
  // Downloads are short-lived signed links, fetched when opened (TECH-04 §7).
  const open = async (fileId: string) => {
    try {
      const { url } = await api(`/v1/files/${fileId}/download`, { response: z.object({ url: z.string() }) });
      window.open(url, "_blank", "noopener");
    } catch {
      setResult({ tone: "error", text: "We couldn't open that photo. Try again." });
    }
  };
  const move = (status: "TRIAGED" | "CLOSED") =>
    run(status, () => api(`/v1/admin/problems/${report.id}/triage`, { method: "POST", body: { version: report.version, status, triageNote: note }, response: adminProblemSchema }), status === "TRIAGED" ? "Marked TRIAGED. The note stays internal." : "Report closed.");
  const sendReply = () =>
    run("reply", () => api(`/v1/admin/problems/${report.id}/replies`, { method: "POST", body: { body: reply }, response: adminProblemSchema }), "Reply emailed to the customer.").then(() => setReply(""));

  return (
    <>
      <header className={styles.head}>
        <div className={list.head}>
          <p className={list.eyebrow}>
            PROBLEM REPORT {report.number} · ORDER {report.orderNumber}
          </p>
          <h1 className={list.title}>
            {PROBLEM_TYPE_LABEL[report.type]} · {report.item}
          </h1>
          <div className={styles.titleRow}>
            <StatusChip tone={TONE[report.status]}>{report.status}</StatusChip>
            <span className={list.hint}>
              {report.customerName} · {report.photos.length} photo{report.photos.length === 1 ? "" : "s"} · {report.quantity.toLocaleString("en-NG")} of {report.ordered.toLocaleString("en-NG")} affected
            </span>
          </div>
        </div>
        <div className={list.panelActions}>
          {report.status !== "CLOSED" ? (
            <Button type="button" variant="secondary" loading={busy === "CLOSED"} onClick={() => void move("CLOSED")}>
              Close
            </Button>
          ) : null}
          {report.status === "NEW" ? (
            <Button type="button" loading={busy === "TRIAGED"} onClick={() => void move("TRIAGED")}>
              Mark TRIAGED
            </Button>
          ) : null}
        </div>
      </header>
      {result ? (
        <Notice tone={result.tone} live>
          {result.text}
        </Notice>
      ) : null}
      <div className={styles.columns}>
        <div className={styles.main}>
          <section className={list.panel} aria-labelledby="what-title">
            <h2 id="what-title" className={list.panelTitle}>
              What happened
            </h2>
            <p className={list.notice}>{report.description}</p>
          </section>
          <section className={list.panel} aria-labelledby="photos-title">
            <h2 id="photos-title" className={list.panelTitle}>
              Photos
            </h2>
            {report.photos.length ? (
              <ul className={list.plainList}>
                {report.photos.map((photo) => (
                  <li key={photo.id}>
                    <button type="button" className={list.action} onClick={() => void open(photo.id)}>
                      {photo.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={list.hint}>No photos added.</p>
            )}
          </section>
          <section className={list.panel} aria-labelledby="note-title">
            <FormField id="triage-note" label="Triage note (internal)">
              <TextArea rows={3} maxLength={4000} value={note} onChange={(event) => setNote(event.target.value)} />
            </FormField>
          </section>
        </div>
        <aside className={styles.side}>
          <section className={list.panel} aria-labelledby="reply-title">
            <h2 id="reply-title" className={list.panelTitle}>
              Reply to customer
            </h2>
            {report.replies.map((entry, index) => (
              <p key={`${entry.at}-${index}`} className={list.hint}>
                {entry.body} · {entry.by} · {formatTime(entry.at)}
              </p>
            ))}
            <FormField id="reply" label="Message (emailed)">
              <TextArea rows={4} maxLength={4000} value={reply} onChange={(event) => setReply(event.target.value)} />
            </FormField>
            <div>
              <Button type="button" variant="secondary" loading={busy === "reply"} disabled={!reply.trim()} onClick={() => void sendReply()}>
                Send reply
              </Button>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
