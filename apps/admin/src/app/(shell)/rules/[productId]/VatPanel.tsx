"use client";

import { type AdminTaxSetting, adminTaxSettingListSchema, adminTaxSettingSchema, ApiError } from "@holypearls/contracts";
import { Button, Checkbox, DatePicker, FormField, Notice, StatusChip, TextField } from "@holypearls/ui";
import { api, errorCode } from "@holypearls/web-kit/api";
import { StepUpDialog } from "@/components/StepUpDialog";
import { useState } from "react";
import styles from "../../admin-list.module.css";
import { formatTime } from "../../format";
import css from "../../form-layout.module.css";

const lagosNow = () => new Date(Date.now() + 3_600_000).toISOString().slice(0, 16);

/** VAT (Pen 107 · MWJuf; OPS-FR-019): one rate for every product, from a date. Past rates are never edited. */
export function VatPanel({ initial }: { initial: AdminTaxSetting[] }) {
  const [entries, setEntries] = useState(initial);
  const current = entries.find((entry) => entry.current);
  const [from, setFrom] = useState(lagosNow);
  const [rate, setRate] = useState(current ? String(current.vatRateBps / 100) : "7.5");
  const [onDelivery, setOnDelivery] = useState(current?.vatOnDelivery ?? true);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [stepUp, setStepUp] = useState(false);
  const now = Date.now();

  const save = async () => {
    if (!/^\d+(\.\d{1,2})?$/.test(rate.trim()) || Number(rate) > 100) {
      setNotice({ tone: "error", text: "Enter the rate as a percentage, like 7.5" });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      await api("/v1/admin/pricing/vat", { method: "POST", body: { effectiveFrom: `${from}:00+01:00`, vatRateBps: Math.round(Number(rate) * 100), vatOnDelivery: onDelivery, note: note.trim() || null }, response: adminTaxSettingSchema });
      setEntries((await api("/v1/admin/pricing/vat", { response: adminTaxSettingListSchema })).entries);
      setStepUp(false);
      setNotice({ tone: "success", text: "VAT rate scheduled. Accepted quotes and existing orders keep the VAT they had." });
    } catch (error) {
      if (errorCode(error) === "RECENT_MFA_REQUIRED") setStepUp(true);
      else setNotice({ tone: "error", text: error instanceof ApiError ? (Object.values(error.body.fieldErrors ?? {})[0] ?? error.body.message) : "That didn't save. Try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={css.layout}>
      <section className={styles.panel} aria-labelledby="vat-title">
        <h2 id="vat-title" className={styles.panelTitle}>
          VAT (OPS-FR-019)
        </h2>
        <table className={styles.table}>
          <caption className="hp-visually-hidden">VAT rates, newest first</caption>
          <thead>
            <tr>
              <th scope="col">FROM</th>
              <th scope="col">RATE</th>
              <th scope="col">STATUS</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td className={styles.mono}>{formatTime(entry.effectiveFrom)}</td>
                <td>
                  {entry.vatRateBps / 100}%<span className={styles.hint}> · {entry.vatOnDelivery ? "on goods and delivery" : "on goods only"}</span>
                  {entry.note ? <span className={styles.hint}> · {entry.note}</span> : null}
                </td>
                <td>{entry.current ? <StatusChip tone="success">CURRENT</StatusChip> : Date.parse(entry.effectiveFrom) > now ? <StatusChip tone="info">SCHEDULED</StatusChip> : <StatusChip tone="neutral">PAST</StatusChip>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className={styles.panel} aria-labelledby="new-vat-title">
        <h2 id="new-vat-title" className={styles.panelTitle}>
          New VAT rate
        </h2>
        {notice ? (
          <Notice tone={notice.tone} live>
            <p>{notice.text}</p>
          </Notice>
        ) : null}
        <form
          className={css.form}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <FormField id="vat-from" label="Effective from (Lagos time)">
            <DatePicker withTime value={from} onValueChange={setFrom} />
          </FormField>
          <FormField id="vat-rate" label="Rate (%)">
            <TextField inputMode="decimal" value={rate} onChange={(event) => setRate(event.target.value)} />
          </FormField>
          <Checkbox id="vat-delivery" label="Charge VAT on delivery too" checked={onDelivery} onChange={(event) => setOnDelivery(event.target.checked)} />
          <FormField id="vat-note" label="Note" optional>
            <TextField value={note} onChange={(event) => setNote(event.target.value)} />
          </FormField>
          <div className={css.actions}>
            <Button type="submit" loading={busy}>
              Save VAT rate
            </Button>
          </div>
        </form>
        <StepUpDialog open={stepUp} action="Change the VAT rate" confirmLabel="Confirm and save" onClose={() => setStepUp(false)} onVerified={save} />
      </section>
    </div>
  );
}
