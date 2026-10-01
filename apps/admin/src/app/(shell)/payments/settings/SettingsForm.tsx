"use client";

import { ApiError, PAYSTACK_CHECKLIST, type PaymentChannel, type PaymentSettings, paymentSettingsSchema } from "@holypearls/contracts";
import { Button, Checkbox, Notice, StatusChip } from "@holypearls/ui";
import { api, errorCode } from "@holypearls/web-kit/api";
import { useState, type FormEvent } from "react";
import { StepUpDialog } from "@/components/StepUpDialog";
import styles from "../../admin-list.module.css";

const CHANNELS: { key: PaymentChannel; label: string; needs?: keyof PaymentSettings["accountSupports"] }[] = [
  { key: "card", label: "Card" },
  { key: "bank_transfer", label: "Bank transfer" },
  { key: "ussd", label: "USSD" },
  { key: "apple_pay", label: "Apple Pay", needs: "applePay" },
];

const SUPPORTS: { key: keyof PaymentSettings["accountSupports"]; label: string }[] = [
  { key: "internationalPayments", label: "International payments approved" },
  { key: "americanExpress", label: "American Express turned on" },
  { key: "usd", label: "USD + Zenith Bank USD domiciliary account" },
  { key: "applePay", label: "Apple Pay enabled" },
];

/**
 * Payment settings (Pen 100 · f2p7r: settings S2ppAi, step-up didZV,
 * checklist QfnbF; TECH-05 §13–14, OPS-FR-044, 047). Saving is high-risk: the
 * API asks for a recent authenticator check and the step-up dialog opens.
 * Only methods the Paystack account supports (as staff confirm) can be on.
 */
export function SettingsForm({ initial, canManage }: { initial: PaymentSettings; canManage: boolean }) {
  const [settings, setSettings] = useState(initial);
  const [form, setForm] = useState(() => ({ ...initial }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stepUp, setStepUp] = useState(false);
  const disabled = !canManage;
  const pausing = settings.onlinePayments && !form.onlinePayments;

  const set = <K extends keyof PaymentSettings>(key: K, value: PaymentSettings[K]) => {
    setSaved(false);
    setForm((current) => ({ ...current, [key]: value }));
  };
  const toggleChannel = (channel: PaymentChannel, on: boolean) => set("channels", on ? [...form.channels, channel] : form.channels.filter((item) => item !== channel));

  const save = async () => {
    setBusy(true);
    setFailure(null);
    setErrors({});
    try {
      const next = await api("/v1/admin/payments/settings", {
        method: "PUT",
        body: { version: settings.version, onlinePayments: form.onlinePayments, channels: form.channels, internationalCards: form.internationalCards, usdEnabled: form.usdEnabled, accountSupports: form.accountSupports, checklist: form.checklist },
        response: paymentSettingsSchema,
      });
      setSettings(next);
      setForm({ ...next });
      setSaved(true);
      setStepUp(false);
    } catch (problem) {
      const code = errorCode(problem);
      if (code === "RECENT_MFA_REQUIRED") setStepUp(true);
      else if (problem instanceof ApiError && problem.body.fieldErrors) setErrors(problem.body.fieldErrors);
      else if (code === "VERSION_CONFLICT") setFailure("Someone else saved these settings first. Reload to see their changes, then save again.");
      else if (code === "FORBIDDEN") setFailure("Your staff permissions don't include PAYMENT_MANAGE.");
      else setFailure("We couldn't save the settings. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void save();
  };

  return (
    <form className={styles.columns} onSubmit={submit} noValidate>
      <div className={styles.tableCol}>
        {!settings.onlinePayments ? (
          <Notice tone="warning" title="Online payments are paused">
            <p>
              New attempts are blocked. {settings.pendingAttempts} pending {settings.pendingAttempts === 1 ? "attempt is" : "attempts are"} still being checked. Customers see
              &ldquo;Online payment is paused. We&apos;ll email you when it&apos;s back.&rdquo;
            </p>
          </Notice>
        ) : null}
        {!settings.providerConfigured ? (
          <Notice tone="info" title="Paystack isn't set up here">
            <p>No Paystack key is set for this environment, so checkout shows payment as not available whatever these settings say.</p>
          </Notice>
        ) : null}
        {saved ? (
          <Notice tone="success" title="Saved" live>
            <p>Payment settings saved and recorded in the audit log.</p>
          </Notice>
        ) : null}
        {failure ? (
          <Notice tone="error" title="Not saved" live>
            <p>{failure}</p>
          </Notice>
        ) : null}

        <fieldset className={styles.panel} disabled={disabled}>
          <legend className={styles.panelTitle}>Online payments</legend>
          <Checkbox label="Accept online payments" checked={form.onlinePayments} onChange={(event) => set("onlinePayments", event.target.checked)} hint="Pausing stops new payment attempts. Pending attempts are still checked." />
        </fieldset>

        <fieldset className={styles.panel} disabled={disabled}>
          <legend className={styles.panelTitle}>Payment methods passed to Paystack</legend>
          {CHANNELS.map((channel) => {
            const unavailable = channel.needs ? !form.accountSupports[channel.needs] : false;
            return (
              <Checkbox
                key={channel.key}
                label={unavailable ? `${channel.label} (not available)` : channel.label}
                checked={form.channels.includes(channel.key)}
                disabled={unavailable && !form.channels.includes(channel.key)}
                onChange={(event) => toggleChannel(channel.key, event.target.checked)}
                hint={unavailable ? `${channel.label} isn't enabled on the Paystack account (confirmed by staff), so it can't be offered.` : undefined}
              />
            );
          })}
          {errors.channels ? <p className={styles.hint} role="alert">{errors.channels}</p> : null}
        </fieldset>

        <fieldset className={styles.panel} disabled={disabled}>
          <legend className={styles.panelTitle}>International and currency</legend>
          <Checkbox label="International cards (Visa, Mastercard, Verve, Amex)" checked={form.internationalCards} onChange={(event) => set("internationalCards", event.target.checked)} hint={errors.internationalCards} />
          <Checkbox label="USD quotes" checked={form.usdEnabled} onChange={(event) => set("usdEnabled", event.target.checked)} hint={errors.usdEnabled ?? "USD quotes need USD enabled on Paystack and a Zenith Bank USD domiciliary account."} />
        </fieldset>

        {canManage ? (
          <div className={styles.panelActions}>
            <Button type="submit" loading={busy}>
              {pausing ? "Pause online payments" : "Save settings"}
            </Button>
            <span className={styles.hint}>Saving asks for your authenticator if your last check was over 15 minutes ago.</span>
          </div>
        ) : (
          <p className={styles.hint}>View only: changing payment settings needs PAYMENT_MANAGE.</p>
        )}
      </div>

      <aside className={styles.detailCol} aria-label="Paystack account">
        <fieldset className={styles.panel} disabled={disabled}>
          <legend className={styles.panelTitle}>What the Paystack account supports</legend>
          <p className={styles.eyebrow}>
            {settings.accountConfirmedAt
              ? `CONFIRMED BY ${(settings.accountConfirmedBy ?? "STAFF").toUpperCase()} · ${new Date(settings.accountConfirmedAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }).toUpperCase()}`
              : "NOT CONFIRMED YET"}
          </p>
          {SUPPORTS.map((item) => (
            <Checkbox key={item.key} label={item.label} checked={form.accountSupports[item.key]} onChange={(event) => set("accountSupports", { ...form.accountSupports, [item.key]: event.target.checked })} />
          ))}
        </fieldset>

        <fieldset className={styles.panel} disabled={disabled}>
          <legend className={styles.panelTitle}>Paystack setup checklist</legend>
          <p className={styles.hint}>Business tasks before launch (TECH-05 §14). Statuses are staff-confirmed notes, not live checks. Keys are never shown here.</p>
          {PAYSTACK_CHECKLIST.map((item) => (
            <Checkbox key={item.key} label={item.label} hint={item.where} checked={Boolean(form.checklist[item.key])} onChange={(event) => set("checklist", { ...form.checklist, [item.key]: event.target.checked })} />
          ))}
        </fieldset>

        <section className={styles.panel} aria-labelledby="changes-title">
          <h2 id="changes-title" className={styles.panelTitle}>
            Recent changes
          </h2>
          {settings.recentChanges.length ? (
            <ul className={styles.fields}>
              {settings.recentChanges.map((change) => (
                <li key={change.occurredAt}>
                  <strong>{change.summary}</strong>
                  <br />
                  <span className={styles.hint}>
                    {change.actorLabel.toUpperCase()} · PAYMENT_MANAGE · {new Date(change.occurredAt).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).toUpperCase()}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.hint}>No changes yet.</p>
          )}
          <StatusChip tone={settings.onlinePayments ? "success" : "warning"}>{settings.onlinePayments ? "PAYMENTS ON" : "PAYMENTS PAUSED"}</StatusChip>
        </section>
      </aside>

      <StepUpDialog open={stepUp} action={pausing ? "Pause all online payments" : "Save payment settings"} confirmLabel={pausing ? "Confirm and pause" : "Confirm and save"} onClose={() => setStepUp(false)} onVerified={save} />
    </form>
  );
}
