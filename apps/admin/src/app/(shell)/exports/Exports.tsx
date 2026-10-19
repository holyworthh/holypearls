"use client";

import { ApiError, EXPORT_LABELS, type ExportItem, type ExportList, type ExportType, PERSONAL_EXPORTS, exportDownloadSchema, exportItemSchema, exportListSchema } from "@holypearls/contracts";
import { Button, EmptyState, FormField, Notice, Select, StatusChip, TextField } from "@holypearls/ui";
import { api, errorCode } from "@holypearls/web-kit/api";
import { type FormEvent, useEffect, useState } from "react";
import { StepUpDialog } from "@/components/StepUpDialog";
import styles from "../admin-list.module.css";
import css from "../form-layout.module.css";
import { ago } from "../format";

const lagosDay = (at: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(at);
const shortDate = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const name = (item: ExportItem) => `${EXPORT_LABELS[item.type]}${item.from ? ` · ${shortDate(item.from)} – ${shortDate(item.to!)}` : ""}`;
const hoursLeft = (iso: string) => Math.max(1, Math.round((Date.parse(iso) - Date.now()) / 3_600_000));

/**
 * New export and the list (Pen 120). Customers holds personal data: the API
 * asks for a recent authenticator check and the step-up dialog opens. The
 * list checks back every few seconds while a file is being built (TECH-02 §11).
 */
export function Exports({ initial }: { initial: ExportList }) {
  const [list, setList] = useState(initial);
  const [form, setForm] = useState<{ type: ExportType; from: string; to: string }>(() => ({ type: initial.allowed[0]!, from: lagosDay(new Date(Date.now() - 30 * 86_400_000)), to: lagosDay(new Date()) }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ tone: "success" | "error"; title: string; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [stepUp, setStepUp] = useState(false);
  const personal = PERSONAL_EXPORTS.includes(form.type);
  const generating = list.items.some((item) => item.status === "GENERATING");

  useEffect(() => {
    if (!generating) return;
    const timer = setInterval(async () => {
      try {
        const next = await api("/v1/admin/exports", { response: exportListSchema });
        const done = next.items.find((item) => item.status === "READY" && list.items.find((old) => old.id === item.id)?.status === "GENERATING");
        if (done) setMessage({ tone: "success", title: "Export ready", text: `${name(done)} is ready. The download link lasts 5 minutes; the file expires in 24 hours.` });
        setList(next);
      } catch {
        // The next check tries again.
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [generating, list.items]);

  const fail = (problem: unknown, fallback: string) => {
    const code = errorCode(problem);
    if (code === "RECENT_MFA_REQUIRED") return setStepUp(true);
    if (problem instanceof ApiError && problem.body.fieldErrors) return setErrors(problem.body.fieldErrors);
    if (code === "FORBIDDEN") return setMessage({ tone: "error", title: "You don't have access to this", text: "Your staff permissions don't include this export." });
    setMessage({ tone: "error", title: "That didn't work", text: fallback });
  };

  const request = async () => {
    setBusy("request");
    setErrors({});
    setMessage(null);
    try {
      const item = await api("/v1/admin/exports", { method: "POST", body: { type: form.type, from: form.type === "CATALOGUE" ? null : form.from, to: form.type === "CATALOGUE" ? null : form.to }, response: exportItemSchema });
      setList((current) => ({ ...current, items: [item, ...current.items] }));
      setStepUp(false);
      setMessage({ tone: "success", title: "Export requested", text: `${name(item)} is being built. It's listed below and ready in a minute or two.` });
    } catch (problem) {
      fail(problem, "We couldn't request the export. Try again.");
    } finally {
      setBusy(null);
    }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void request();
  };

  const retry = async (item: ExportItem) => {
    setBusy(item.id);
    setMessage(null);
    try {
      const next = await api(`/v1/admin/exports/${item.id}/retry`, { method: "POST", response: exportItemSchema });
      setList((current) => ({ ...current, items: current.items.map((entry) => (entry.id === next.id ? next : entry)) }));
    } catch (problem) {
      fail(problem, "We couldn't retry the export. Try again.");
    } finally {
      setBusy(null);
    }
  };
  const download = async (item: ExportItem) => {
    setBusy(item.id);
    setMessage(null);
    try {
      const { url } = await api(`/v1/admin/exports/${item.id}/download`, { method: "POST", response: exportDownloadSchema });
      window.location.assign(url);
    } catch (problem) {
      fail(problem, "This file is no longer available. Request a new export.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={styles.columns}>
      <section className={styles.panel} aria-labelledby="new-export">
        <h2 id="new-export" className={styles.panelTitle}>
          New export
        </h2>
        <form className={css.form} onSubmit={submit} noValidate>
          <FormField id="export-type" label="What to export" hint={list.allowed.map((type) => EXPORT_LABELS[type]).join(" · ")}>
            <Select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as ExportType })} options={list.allowed.map((type) => ({ value: type, label: EXPORT_LABELS[type] }))} />
          </FormField>
          {form.type === "CATALOGUE" ? (
            <p className={styles.hint}>The catalogue is exported as it is now.</p>
          ) : (
            <div className={css.row}>
              <FormField id="export-from" label="From" error={errors.from}>
                <TextField type="date" value={form.from} max={form.to} onChange={(event) => setForm({ ...form, from: event.target.value })} />
              </FormField>
              <FormField id="export-to" label="To" error={errors.to}>
                <TextField type="date" value={form.to} min={form.from} onChange={(event) => setForm({ ...form, to: event.target.value })} />
              </FormField>
            </div>
          )}
          {personal ? (
            <Notice tone="warning" title="Contains personal data">
              <p>{EXPORT_LABELS[form.type]} includes names, emails and phone numbers. You need EXPORT_PERSONAL_DATA and a recent MFA check.</p>
            </Notice>
          ) : null}
          <div className={css.actions}>
            <Button type="submit" loading={busy === "request"}>
              Request export
            </Button>
          </div>
        </form>
      </section>
      <section className={styles.tableCol} aria-labelledby="export-list">
        <h2 id="export-list" className="hp-visually-hidden">
          Requested exports
        </h2>
        {message ? (
          <Notice tone={message.tone} title={message.title} live>
            <p>{message.text}</p>
          </Notice>
        ) : null}
        {list.items.length === 0 ? (
          <EmptyState title="No exports yet" body="Requested exports appear here for 24 hours." />
        ) : (
          <div className={styles.panel}>
            <table className={styles.table}>
              <caption className="hp-visually-hidden">Requested exports</caption>
              <thead>
                <tr>
                  <th scope="col">EXPORT</th>
                  <th scope="col">REQUESTED</th>
                  <th scope="col">STATE</th>
                  <th scope="col">
                    <span className="hp-visually-hidden">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.items.map((item) => (
                  <tr key={item.id}>
                    <td className={styles.strong}>{name(item)}</td>
                    <td>
                      {item.requestedBy.replace(/ \(TEST DATA\)$/, "")} · {ago(item.requestedAt)} ago
                    </td>
                    <td>
                      {item.status === "GENERATING" ? (
                        <StatusChip tone="info">Generating…</StatusChip>
                      ) : item.status === "READY" ? (
                        <StatusChip tone="success">{`Ready · expires in ${hoursLeft(item.expiresAt!)} h`}</StatusChip>
                      ) : item.status === "EXPIRED" ? (
                        <StatusChip tone="neutral">Expired</StatusChip>
                      ) : (
                        <StatusChip tone="error">Failed · retry</StatusChip>
                      )}
                    </td>
                    <td>
                      {item.status === "READY" ? (
                        <button type="button" className={styles.action} disabled={busy === item.id} onClick={() => void download(item)}>
                          Download<span className="hp-visually-hidden"> {name(item)}</span>
                        </button>
                      ) : item.status === "FAILED" ? (
                        <button type="button" className={styles.action} disabled={busy === item.id} onClick={() => void retry(item)}>
                          Retry<span className="hp-visually-hidden"> {name(item)}</span>
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className={styles.hint}>Files live in private storage and are never emailed. Each download link lasts 5 minutes.</p>
      </section>
      <StepUpDialog open={stepUp} action={`Export ${EXPORT_LABELS[form.type]} (personal data)`} confirmLabel="Confirm and export" onClose={() => setStepUp(false)} onVerified={request} />
    </div>
  );
}
