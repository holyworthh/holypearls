"use client";

import { ApiError, STAFF_PERMISSIONS, type StaffMember, type StaffPermission, staffAccessSchema, staffMemberSchema } from "@holypearls/contracts";
import { Button, Checkbox, Dialog, Notice, StatusChip } from "@holypearls/ui";
import { api, errorCode, errorReason, newIdempotencyKey } from "@holypearls/web-kit/api";
import { useState } from "react";
import { StepUpDialog } from "@/components/StepUpDialog";
import styles from "../../admin-list.module.css";
import css from "../../form-layout.module.css";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Lagos" });
type Pending = "save" | "reset" | null;

/**
 * One staff member (Pen 122 pplkz). Saving permissions grants and revokes
 * one at a time through the TECH-03 §8 routes; each change is audited and
 * needs a recent MFA check (the step-up dialog opens). STAFF_ADMIN can't drop
 * below two active holders, and an MFA reset needs a phone identity check.
 */
export function StaffMemberView({ initial, isSelf }: { initial: StaffMember; isSelf: boolean }) {
  const [member, setMember] = useState(initial);
  const [chosen, setChosen] = useState<StaffPermission[]>(initial.permissions);
  const [message, setMessage] = useState<{ tone: "success" | "error" | "warning"; title: string; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [stepUp, setStepUp] = useState<Pending>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [phoneChecked, setPhoneChecked] = useState(false);

  const reload = async () => {
    const next = await api(`/v1/admin/staff/${member.staffProfileId}`, { response: staffMemberSchema });
    setMember(next);
    return next;
  };
  const blocked = () =>
    setMessage({
      tone: "warning",
      title: "Can't remove STAFF_ADMIN",
      text: `${member.activeStaffAdmins.join(" and ")} are the only STAFF_ADMIN. Add another STAFF_ADMIN before removing this one.`,
    });
  const fail = (problem: unknown, retry: Pending) => {
    if (errorCode(problem) === "RECENT_MFA_REQUIRED" && retry) return setStepUp(retry);
    if (errorReason(problem) === "MINIMUM_STAFF_ADMINS") return blocked();
    setMessage({ tone: "error", title: "That didn't work", text: problem instanceof ApiError ? problem.body.message : "Try again." });
  };

  const save = async () => {
    setBusy("save");
    setMessage(null);
    try {
      // Grants first, so a STAFF_ADMIN swap never dips below two.
      for (const permission of chosen.filter((item) => !member.permissions.includes(item))) {
        await api(`/v1/admin/staff/${member.staffProfileId}/permissions`, { method: "POST", body: { permission }, headers: { "idempotency-key": newIdempotencyKey() }, response: staffAccessSchema });
      }
      for (const permission of member.permissions.filter((item) => !chosen.includes(item))) {
        await api(`/v1/admin/staff/${member.staffProfileId}/permissions/${permission}`, { method: "DELETE", response: staffAccessSchema });
      }
      setStepUp(null);
      const next = await reload();
      setChosen(next.permissions);
      setMessage({ tone: "success", title: "Permissions saved", text: "Every change is in the audit log." });
    } catch (problem) {
      await reload();
      fail(problem, "save");
    } finally {
      setBusy(null);
    }
  };
  const reset = async () => {
    setBusy("reset");
    setMessage(null);
    try {
      await api(`/v1/admin/staff/${member.staffProfileId}/mfa-reset`, { method: "POST", body: {}, response: staffAccessSchema });
      setStepUp(null);
      setPhoneChecked(false);
      await reload();
      setMessage({ tone: "success", title: "MFA reset", text: `${member.name} must set up their authenticator again at next sign-in. Their sessions have ended.` });
    } catch (problem) {
      fail(problem, "reset");
    } finally {
      setBusy(null);
    }
  };
  const deactivate = async () => {
    setBusy("deactivate");
    setMessage(null);
    try {
      setMember(await api(`/v1/admin/staff/${member.staffProfileId}/deactivate`, { method: "POST", body: {}, response: staffMemberSchema }));
      setConfirmDeactivate(false);
      setMessage({ tone: "success", title: "Deactivated", text: `${member.name} lost access and all their sessions ended. History is kept.` });
    } catch (problem) {
      setConfirmDeactivate(false);
      fail(problem, null);
    } finally {
      setBusy(null);
    }
  };
  const active = member.status === "ACTIVE";

  return (
    <>
      <header className={styles.recordHead}>
        <p className={styles.eyebrow}>STAFF · {member.email}</p>
        <h1 className={styles.recordTitle}>{member.name}</h1>
        <div className={styles.chips}>
          <StatusChip tone={active ? "success" : "neutral"}>{member.status}</StatusChip>
          {member.lastMfaReset ? (
            <span className={styles.hint}>
              MFA was reset {day(member.lastMfaReset.at)} by {member.lastMfaReset.by}
              {member.mfaEnabled ? "" : " · must set up again at next sign-in"}
            </span>
          ) : null}
        </div>
        {active ? (
          <div className={styles.panelActions}>
            {!isSelf ? (
              <Button variant="secondary" onClick={() => setConfirmDeactivate(true)}>
                Deactivate
              </Button>
            ) : null}
            <Button loading={busy === "save"} onClick={() => void save()}>
              Save permissions
            </Button>
          </div>
        ) : null}
      </header>
      {message ? (
        <Notice tone={message.tone} title={message.title} live>
          <p>{message.text}</p>
        </Notice>
      ) : null}
      <div className={css.layout}>
        <fieldset className={`${styles.panel} ${css.form}`} disabled={!active}>
          <legend className={styles.panelTitle}>Permissions (TECH-03 §8)</legend>
          <div className={css.row}>
            {STAFF_PERMISSIONS.map((permission) => (
              <Checkbox
                key={permission}
                id={`permission-${permission}`}
                label={permission}
                checked={chosen.includes(permission)}
                onChange={(event) => setChosen(event.target.checked ? [...chosen, permission] : chosen.filter((item) => item !== permission))}
              />
            ))}
          </div>
          <p className={styles.hint}>Adding a permission is high-risk and asks for MFA. Every change is audited.</p>
        </fieldset>
        <section className={styles.panel} aria-labelledby="security-title">
          <h2 id="security-title" className={styles.panelTitle}>
            Security
          </h2>
          <dl className={styles.fields}>
            <dt>MFA</dt>
            <dd>{member.mfaEnabled ? "On" : member.lastMfaReset ? "Reset · not set up" : "Not set up"}</dd>
            <dt>Sessions</dt>
            <dd>{member.activeSessions} active</dd>
          </dl>
          {active && !isSelf ? (
            <>
              <Checkbox id="phone-check" label={`I confirmed ${member.name}'s identity by phone`} checked={phoneChecked} onChange={(event) => setPhoneChecked(event.target.checked)} />
              <Button variant="secondary" disabled={!phoneChecked} loading={busy === "reset"} onClick={() => void reset()}>
                Reset MFA
              </Button>
            </>
          ) : null}
          <p className={styles.hint}>Only reset after confirming the person&apos;s identity by phone.</p>
        </section>
      </div>
      <Dialog
        open={confirmDeactivate}
        onClose={() => setConfirmDeactivate(false)}
        title={`Deactivate ${member.name}?`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDeactivate(false)}>
              Cancel
            </Button>
            <Button loading={busy === "deactivate"} onClick={() => void deactivate()}>
              Deactivate
            </Button>
          </>
        }
      >
        <p>{member.name} loses access immediately and all their sessions end. History is kept.</p>
      </Dialog>
      <StepUpDialog
        open={stepUp !== null}
        action={stepUp === "reset" ? `Reset MFA for ${member.name}` : `Change ${member.name}'s permissions`}
        confirmLabel={stepUp === "reset" ? "Confirm reset" : "Confirm and save"}
        onClose={() => setStepUp(null)}
        onVerified={stepUp === "reset" ? reset : save}
      />
    </>
  );
}
