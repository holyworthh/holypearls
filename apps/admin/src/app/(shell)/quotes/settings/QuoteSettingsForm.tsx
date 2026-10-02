"use client";

import { ApiError, type InstallmentTrigger, type QuoteSettings, quoteSettingsSchema, TRIGGER_LABEL } from "@holypearls/contracts";
import { Button, FormField, Notice, Select, TextArea, TextField } from "@holypearls/ui";
import { api, errorCode } from "@holypearls/web-kit/api";
import { type FormEvent, useState } from "react";
import { StepUpDialog } from "@/components/StepUpDialog";
import styles from "../../admin-list.module.css";
import { formatTime } from "../../format";

type Entry = { key: string; label: string; percent: string; trigger: InstallmentTrigger };

const TRIGGERS = (Object.entries(TRIGGER_LABEL) as [InstallmentTrigger, string][]).filter(([trigger]) => trigger !== "ON_DATE");

/**
 * The defaults each new quote version starts from (TECH-05 §4: no
 * percentage is fixed in code). Saving decides what customers pay, so it
 * asks for a recent authenticator check (step-up dialog).
 */
export function QuoteSettingsForm({ initial }: { initial: QuoteSettings }) {
  const [settings, setSettings] = useState(initial);
  const [validDays, setValidDays] = useState(String(initial.validDays));
  const [notice, setNotice] = useState(String(initial.expiringNoticeDays));
  const [terms, setTerms] = useState(initial.defaultTerms);
  const [entries, setEntries] = useState<Entry[]>(() => initial.defaultSchedule.map((entry, index) => ({ key: String(index), label: entry.label, percent: String(Number(entry.value) / 100), trigger: entry.trigger })));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stepUp, setStepUp] = useState(false);
  const total = entries.reduce((sum, entry) => sum + (Number(entry.percent) || 0), 0);

  const save = async () => {
    setBusy(true);
    setFailure(null);
    setErrors({});
    try {
      const next = await api("/v1/admin/quote-settings", {
        method: "PUT",
        body: {
          version: settings.version,
          validDays: Number(validDays) || 0,
          expiringNoticeDays: Number(notice) || 0,
          defaultSchedule: entries.map((entry) => ({ label: entry.label, kind: "PERCENT", value: String(Math.round(Number(entry.percent) * 100) || 0), trigger: entry.trigger })),
          defaultTerms: terms,
        },
        response: quoteSettingsSchema,
      });
      setSettings(next);
      setSaved(true);
      setStepUp(false);
    } catch (problem) {
      const code = errorCode(problem);
      if (code === "RECENT_MFA_REQUIRED") setStepUp(true);
      else if (problem instanceof ApiError && problem.body.fieldErrors) setErrors(problem.body.fieldErrors);
      else if (code === "VERSION_CONFLICT") setFailure("Someone else saved these settings first. Reload to see their changes, then save again.");
      else setFailure("We couldn't save the settings. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSaved(false);
    void save();
  };

  return (
    <form className={styles.columns} onSubmit={submit} noValidate>
      <div className={styles.tableCol}>
        {saved ? (
          <Notice tone="success" title="Saved" live>
            <p>New quote versions start from these settings. Versions already sent don&apos;t change.</p>
          </Notice>
        ) : null}
        {failure ? (
          <Notice tone="error" title="Not saved" live>
            <p>{failure}</p>
          </Notice>
        ) : null}
        <fieldset className={styles.panel}>
          <legend className={styles.panelTitle}>Validity</legend>
          <FormField id="valid-days" label="Quotes are valid for (days after sending)" error={errors.validDays}>
            <TextField inputMode="numeric" value={validDays} onChange={(event) => setValidDays(event.target.value.replace(/\D/g, ""))} />
          </FormField>
          <FormField id="notice-days" label="Remind the customer this many days before it expires" hint="0 sends no reminder." error={errors.expiringNoticeDays}>
            <TextField inputMode="numeric" value={notice} onChange={(event) => setNotice(event.target.value.replace(/\D/g, ""))} />
          </FormField>
        </fieldset>
        <fieldset className={styles.panel}>
          <legend className={styles.panelTitle}>Default payment schedule</legend>
          {entries.map((entry, index) => (
            <div key={entry.key} className={styles.filters}>
              <TextField aria-label={`Payment ${index + 1} name`} value={entry.label} maxLength={60} onChange={(event) => setEntries((current) => current.map((item, at) => (at === index ? { ...item, label: event.target.value } : item)))} />
              <TextField aria-label={`Payment ${index + 1} percentage of the total`} inputMode="decimal" value={entry.percent} onChange={(event) => setEntries((current) => current.map((item, at) => (at === index ? { ...item, percent: event.target.value } : item)))} />
              <span className={styles.hint}>%</span>
              <Select
                aria-label={`Payment ${index + 1} due`}
                value={entry.trigger}
                options={TRIGGERS.map(([trigger, label]) => ({ value: trigger, label }))}
                onChange={(event) => setEntries((current) => current.map((item, at) => (at === index ? { ...item, trigger: event.target.value as InstallmentTrigger } : item)))}
              />
              {entries.length > 1 ? (
                <button type="button" className={styles.action} onClick={() => setEntries((current) => current.filter((_, at) => at !== index))}>
                  Remove<span className="hp-visually-hidden"> payment {index + 1}</span>
                </button>
              ) : null}
            </div>
          ))}
          <div className={styles.panelActions}>
            <Button type="button" variant="secondary" disabled={entries.length >= 8} onClick={() => setEntries((current) => [...current, { key: crypto.randomUUID(), label: `Milestone ${current.length + 1}`, percent: "0", trigger: "BEFORE_PRODUCTION" }])}>
              Add milestone
            </Button>
            <span className={styles.hint} role="status">
              Total {total.toLocaleString("en-NG", { maximumFractionDigits: 2 })}%. It must be 100%.
            </span>
          </div>
          {errors.defaultSchedule ? (
            <p className={styles.hint} role="alert">
              {errors.defaultSchedule}
            </p>
          ) : null}
        </fieldset>
        <fieldset className={styles.panel}>
          <legend className={styles.panelTitle}>Default terms</legend>
          <FormField id="default-terms" label="Terms shown to customer on new versions">
            <TextArea rows={4} value={terms} maxLength={4000} onChange={(event) => setTerms(event.target.value)} />
          </FormField>
        </fieldset>
        <div className={styles.panelActions}>
          <Button type="submit" loading={busy}>
            Save settings
          </Button>
          <span className={styles.hint}>Saving asks for your authenticator if your last check was over 15 minutes ago.</span>
        </div>
      </div>
      <aside className={styles.detailCol} aria-label="Last change">
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Last change</h2>
          <p className={styles.hint}>{settings.updatedBy ? `${settings.updatedBy} · ${formatTime(settings.updatedAt!)}` : "Starting values from setup."}</p>
        </section>
      </aside>
      <StepUpDialog open={stepUp} action="Change the default quote settings" confirmLabel="Confirm and save" onClose={() => setStepUp(false)} onVerified={save} />
    </form>
  );
}
