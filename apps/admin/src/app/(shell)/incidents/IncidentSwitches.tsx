"use client";

import { ApiError, type IncidentState, incidentStateSchema, revokedCountSchema } from "@holypearls/contracts";
import { Button, Dialog, FormField, Notice, RadioCardGroup, StatusChip, TextField } from "@holypearls/ui";
import { api, errorCode } from "@holypearls/web-kit/api";
import { useState } from "react";
import { StepUpDialog } from "@/components/StepUpDialog";
import styles from "../admin-list.module.css";
import css from "./incidents.module.css";

type Name = "READ_ONLY" | "UPLOADS_PAUSED" | "PAYMENTS_PAUSED" | "SESSIONS" | "GUEST_LINKS";

const lagosTime = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Africa/Lagos" });

/** What each switch says and does, in the words of Pen 123 (JqxuW). */
const SWITCHES: { name: Name; title: string; text: string; runbook: string; off: string; on: string; action: string }[] = [
  { name: "READ_ONLY", title: "Read-only mode", text: "Browsing works. Every change is blocked with a message.", runbook: "Runbook 6", off: "Turn on", on: "Turn off", action: "Turn on read-only mode for the whole site" },
  { name: "UPLOADS_PAUSED", title: "Pause uploads", text: "New file uploads are refused. Existing files still work.", runbook: "Runbook 5", off: "Pause", on: "Resume", action: "Pause uploads for the whole site" },
  { name: "PAYMENTS_PAUSED", title: "Pause online payments", text: "Same switch as Payment settings. Pending attempts are still checked.", runbook: "Runbook 4", off: "Pause", on: "Resume", action: "Pause online payments" },
  { name: "SESSIONS", title: "Revoke sessions", text: "End all sessions for everyone, or for one person.", runbook: "Runbook 2", off: "Revoke…", on: "Revoke…", action: "Revoke sessions" },
  { name: "GUEST_LINKS", title: "Revoke guest links", text: "For one customer or one record (quote, order, proof, draft, collection).", runbook: "—", off: "Revoke…", on: "Revoke…", action: "Revoke guest links" },
];

const READ_ONLY_NOTE = `Customers see: "We're doing maintenance. You can browse, but changes are paused." Recorded in the audit log with your request ID.`;

/** The five switches (Pen 123): each opens a confirmation, and every change asks for a recent authenticator check. */
export function IncidentSwitches({ initial }: { initial: IncidentState }) {
  const [state, setState] = useState(initial);
  const [pending, setPending] = useState<Name | null>(null);
  const [stepUp, setStepUp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scope, setScope] = useState("EVERYONE");
  const [email, setEmail] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [recordId, setRecordId] = useState("");
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<{ tone: "success" | "error"; title: string; text: string } | null>(null);

  const stateOf = (name: Name) => (name === "READ_ONLY" ? state.readOnly : name === "UPLOADS_PAUSED" ? state.uploadsPaused : name === "PAYMENTS_PAUSED" ? state.paymentsPaused : null);
  const entry = SWITCHES.find((item) => item.name === pending);
  const turningOn = pending !== null && !stateOf(pending)?.on;

  const close = () => {
    setPending(null);
    setStepUp(false);
    setError(undefined);
  };

  const run = async () => {
    if (!pending) return;
    setBusy(true);
    setError(undefined);
    try {
      if (pending === "SESSIONS" || pending === "GUEST_LINKS") {
        const body = pending === "SESSIONS" ? (scope === "EVERYONE" ? { scope } : { scope, email }) : customerEmail ? { customerEmail } : { recordId };
        const done = await api(pending === "SESSIONS" ? "/v1/admin/incidents/revoke-sessions" : "/v1/admin/incidents/revoke-guest-links", { method: "POST", body, response: revokedCountSchema });
        setMessage({ tone: "success", title: pending === "SESSIONS" ? "Sessions revoked" : "Guest links turned off", text: `${done.revoked} ${pending === "SESSIONS" ? "sessions ended" : "links turned off"}. Recorded in the audit log.` });
        if (pending === "SESSIONS" && scope === "EVERYONE") {
          window.location.assign("/sign-in");
          return;
        }
      } else {
        setState(await api("/v1/admin/incidents/switch", { method: "POST", body: { switch: pending, on: turningOn }, response: incidentStateSchema }));
        const title = entry!.title;
        setMessage(
          pending === "READ_ONLY" && turningOn
            ? { tone: "success", title: "Read-only mode is on", text: READ_ONLY_NOTE }
            : { tone: "success", title: `${title}: ${turningOn ? "on" : "off"}`, text: "Recorded in the audit log with your request ID." },
        );
      }
      close();
    } catch (problem) {
      if (errorCode(problem) === "RECENT_MFA_REQUIRED") setStepUp(true);
      else setError(problem instanceof ApiError ? problem.body.message : "We couldn't do that. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.tableCol}>
      <Notice tone="info" title="Alerts aren't shown here">
        <p>Alerts for errors, jobs, payments, webhooks, email and file processing go to email or Slack through Sentry.</p>
      </Notice>
      {message ? (
        <Notice tone={message.tone} title={message.title} live>
          <p>{message.text}</p>
        </Notice>
      ) : null}
      <ul className={css.list}>
        {SWITCHES.map((item) => {
          const current = stateOf(item.name);
          return (
            <li key={item.name} className={`${css.card} ${current?.on ? css.on : ""}`}>
              <div className={css.text}>
                <div className={css.heading}>
                  <h2 className={css.name}>{item.title}</h2>
                  {current?.on && current.since ? <StatusChip tone="error">{`ON · since ${lagosTime.format(new Date(current.since))}`}</StatusChip> : <StatusChip tone="neutral">Off</StatusChip>}
                </div>
                <p className={css.description}>{item.text}</p>
              </div>
              <span className={css.runbook}>{item.runbook}</span>
              <Button variant={current?.on ? "secondary" : "primary"} onClick={() => setPending(item.name)}>
                {current?.on ? item.on : item.off}
                <span className="hp-visually-hidden"> {item.title}</span>
              </Button>
            </li>
          );
        })}
      </ul>
      <Dialog
        open={pending !== null && !stepUp}
        onClose={close}
        title={turningOn ? entry?.action : `${entry?.on}: ${entry?.title}`}
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button variant={turningOn || pending === "SESSIONS" || pending === "GUEST_LINKS" ? "destructive" : "primary"} loading={busy} onClick={() => void run()}>
              Confirm
            </Button>
          </>
        }
      >
        {pending === "SESSIONS" ? (
          <>
            <RadioCardGroup
              name="scope"
              legend="Whose sessions"
              value={scope}
              onChange={setScope}
              options={[
                { value: "EVERYONE", title: "Everyone (all customers and staff, including you)" },
                { value: "PERSON", title: "One person" },
              ]}
            />
            {scope === "PERSON" ? (
              <FormField id="revoke-email" label="Person">
                <TextField type="email" autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} />
              </FormField>
            ) : (
              <p>You will be signed out too, and sent to the sign-in page.</p>
            )}
          </>
        ) : pending === "GUEST_LINKS" ? (
          <>
            <FormField id="revoke-customer" label="Customer email">
              <TextField type="email" autoComplete="off" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} />
            </FormField>
            <FormField id="revoke-record" label="Or record ID (quote, order, proof, draft, collection)">
              <TextField value={recordId} onChange={(event) => setRecordId(event.target.value)} />
            </FormField>
          </>
        ) : (
          <p>{entry?.text} This is recorded in the audit log, and needs your authenticator.</p>
        )}
        {error ? (
          <Notice tone="error" title="That didn't work" live>
            <p>{error}</p>
          </Notice>
        ) : null}
      </Dialog>
      <StepUpDialog open={stepUp} action={entry?.action ?? ""} confirmLabel="Confirm and apply" onClose={close} onVerified={run} />
    </div>
  );
}
