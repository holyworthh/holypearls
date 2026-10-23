"use client";

import { type PrivacyPerson, privacyPersonSchema } from "@holypearls/contracts";
import { Button, Checkbox, Dialog, FormField, Notice, PermissionDenied, StatusChip, TextField } from "@holypearls/ui";
import { api, errorCode, errorReason, newIdempotencyKey } from "@holypearls/web-kit/api";
import { type FormEvent, useRef, useState } from "react";
import { z } from "zod";
import { StepUpDialog } from "@/components/StepUpDialog";
import styles from "../admin-list.module.css";
import css from "../form-layout.module.css";

type Step = "erase" | "export";
type Message = { tone: "success" | "error"; title: string; text: string };

/**
 * Look up by email, then export a JSON copy or erase and anonymize (Pen 136).
 * Both need a recent authenticator check: the step-up dialog opens when the
 * API asks and the action runs again. The email only ever travels in request
 * bodies. Payment, order and tax records are kept without name or contact
 * details; the request is logged in the audit log (no request table).
 */
export function Privacy() {
  const [email, setEmail] = useState("");
  const [person, setPerson] = useState<PrivacyPerson | null>(null);
  const [looked, setLooked] = useState("");
  const [message, setMessage] = useState<Message | null>(null);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState<"lookup" | Step | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [stepUp, setStepUp] = useState<Step | null>(null);
  // One key per erase press, kept if the press is retried after the step-up.
  const eraseKey = useRef<string | null>(null);

  const fail = (problem: unknown, step?: Step) => {
    const code = errorCode(problem);
    if (code === "RECENT_MFA_REQUIRED" && step) return setStepUp(step);
    if (code === "FORBIDDEN" && errorReason(problem) === "PERMISSION_REQUIRED") return setDenied(true);
    const reason = errorReason(problem);
    if (code === "RULE_FAILED" && reason) return setMessage({ tone: "error", title: "This can't be erased yet", text: problem instanceof Error ? problem.message : "A rule stops it." });
    setMessage({ tone: "error", title: "That didn't work", text: "Something went wrong on our side. Try again." });
  };

  const find = async (event?: FormEvent) => {
    event?.preventDefault();
    setBusy("lookup");
    setMessage(null);
    try {
      const found = await api("/v1/admin/privacy/lookup", { method: "POST", body: { email: email.trim() }, response: privacyPersonSchema });
      setPerson(found);
      setLooked(email.trim());
    } catch (problem) {
      setPerson(null);
      fail(problem);
    } finally {
      setBusy(null);
    }
  };

  const exportCopy = async () => {
    setBusy("export");
    setMessage(null);
    try {
      const data = await api("/v1/admin/privacy/export", { method: "POST", body: { email: looked }, response: z.unknown() });
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `holypearls-person-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setStepUp(null);
      setMessage({ tone: "success", title: "Export downloaded", text: "Send it through a secure channel, never as an email attachment." });
    } catch (problem) {
      fail(problem, "export");
    } finally {
      setBusy(null);
    }
  };

  const erase = async () => {
    setBusy("erase");
    setMessage(null);
    eraseKey.current ??= newIdempotencyKey();
    try {
      const done = await api("/v1/admin/privacy/erase", { method: "POST", body: { email: looked, confirm: true }, headers: { "idempotency-key": eraseKey.current }, response: privacyPersonSchema });
      eraseKey.current = null;
      setStepUp(null);
      setConfirming(false);
      setPerson(done);
      setMessage({ tone: "success", title: "Request completed", text: "Personal data erased. Payment and tax records kept without name or contact details. Logged in the audit log." });
    } catch (problem) {
      if (errorCode(problem) !== "RECENT_MFA_REQUIRED") eraseKey.current = null;
      setConfirming(false);
      fail(problem, "erase");
    } finally {
      setBusy(null);
    }
  };

  if (denied) return <PermissionDenied permission="EXPORT_PERSONAL_DATA" />;
  const erased = person?.erasedAt != null;
  const blocked = (person?.blockers.length ?? 0) > 0;

  return (
    <div className={css.form}>
      <section className={styles.panel} aria-labelledby="privacy-find">
        <h2 id="privacy-find" className={styles.panelTitle}>
          Find a person
        </h2>
        <form className={css.form} onSubmit={(event) => void find(event)} noValidate>
          <FormField id="privacy-email" label="Email address" hint="Matches customers, guests and accounts with this exact email.">
            <TextField type="email" autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} />
          </FormField>
          <div className={css.actions}>
            <Button type="submit" loading={busy === "lookup"} disabled={!email.trim()}>
              Look up
            </Button>
          </div>
        </form>
      </section>

      {message ? (
        <Notice tone={message.tone} title={message.title} live>
          <p>{message.text}</p>
        </Notice>
      ) : null}

      {person && !person.found && !erased ? (
        <Notice tone="neutral" title="Nothing found">
          <p>No personal data is held under this email. It may already have been erased.</p>
        </Notice>
      ) : null}

      {person?.found ? (
        <>
          <header className={styles.head}>
            <h2 className={styles.title}>Erase data for {looked}</h2>
            <div className={css.actions}>
              <StatusChip tone={person.erasedAt ? "neutral" : "info"}>{person.erasedAt ? "Already erased" : person.hasAccount ? "Account" : "Guest"}</StatusChip>
              <span className={styles.hint}>
                {person.counts.orders} orders · {person.counts.receipts} receipts · {person.counts.quotes} quotes · {person.counts.checkouts} checkouts
              </span>
            </div>
          </header>
          {person.blockers.map((blocker) => (
            <Notice key={blocker.code} tone="error" title="Can't erase yet" live>
              <p>{blocker.message}</p>
            </Notice>
          ))}
          <div className={css.layout}>
            <section className={styles.panel} aria-labelledby="privacy-removed">
              <h2 id="privacy-removed" className={styles.panelTitle}>
                Will be removed or anonymized
              </h2>
              {["Name, email, phone on customer record", "Delivery addresses", "Account and sessions", "Marketing consent", "Help requests and problem report contact details"].map((line) => (
                <Checkbox key={line} checked readOnly disabled label={line} />
              ))}
            </section>
            <section className={styles.panel} aria-labelledby="privacy-kept">
              <h2 id="privacy-kept" className={styles.panelTitle}>
                Kept (legal record)
              </h2>
              <ul className={styles.plainList}>
                {[`Orders (${person.counts.orders}): financial totals`, `Payment attempts and receipts (${person.counts.receipts})`, "Tax (VAT) records for 7 years"].map((line) => (
                  <li key={line}>
                    <strong>{line}</strong>
                    <br />
                    <span className={styles.hint}>Name and contact details replaced with &quot;Erased customer&quot;</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
          <div className={css.actions}>
            <Button variant="secondary" loading={busy === "export"} onClick={() => void exportCopy()}>
              Export copy first
            </Button>
            <Button variant="destructive" disabled={blocked || erased} loading={busy === "erase"} onClick={() => setConfirming(true)}>
              Erase and anonymize
            </Button>
          </div>
          <p className={styles.hint}>Needs EXPORT_PERSONAL_DATA and an MFA check in the last 15 minutes.</p>
        </>
      ) : null}

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Erase data for ${looked}?`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button variant="destructive" loading={busy === "erase"} onClick={() => void erase()}>
              Erase and anonymize
            </Button>
          </>
        }
      >
        <p>This can&apos;t be undone. Name, contact details and addresses are removed. Payment and tax records are kept. Export a copy first if the person asked for one.</p>
      </Dialog>
      <StepUpDialog
        open={stepUp !== null}
        action={stepUp === "export" ? "Export a person's data" : "Erase and anonymize a person's data"}
        confirmLabel={stepUp === "export" ? "Confirm and export" : "Confirm and erase"}
        onClose={() => setStepUp(null)}
        onVerified={stepUp === "export" ? exportCopy : erase}
      />
    </div>
  );
}
