"use client";

import { ApiError, STAFF_PERMISSIONS, type StaffList as List, type StaffPermission, staffInvitationSchema, staffListSchema } from "@holypearls/contracts";
import { Button, Checkbox, FormField, Notice, StatusChip, TextField } from "@holypearls/ui";
import { api, errorCode, newIdempotencyKey } from "@holypearls/web-kit/api";
import { type FormEvent, useRef, useState } from "react";
import { StepUpDialog } from "@/components/StepUpDialog";
import styles from "../admin-list.module.css";
import css from "../form-layout.module.css";

const permissionsLine = (permissions: readonly string[]) => (permissions.length > 3 ? `${permissions.slice(0, 3).join(", ")} +${permissions.length - 3}` : permissions.join(", ") || "—");

/** The staff table and the invite form (Pen 122 rbymz; "Invitation sent"). Inviting with permissions asks for MFA. */
export function StaffList({ initial }: { initial: List }) {
  const [list, setList] = useState(initial);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ email: string; name: string; permissions: StaffPermission[] }>({ email: "", name: "", permissions: [] });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ tone: "success" | "error"; title: string; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [stepUp, setStepUp] = useState(false);
  const key = useRef(newIdempotencyKey());

  const reload = async () => setList(await api("/v1/admin/staff", { response: staffListSchema }));
  const invite = async () => {
    setBusy("invite");
    setErrors({});
    setMessage(null);
    try {
      const sent = await api("/v1/admin/staff/invitations", { method: "POST", body: form, headers: { "idempotency-key": key.current }, response: staffInvitationSchema });
      key.current = newIdempotencyKey();
      setStepUp(false);
      setOpen(false);
      setForm({ email: "", name: "", permissions: [] });
      setMessage({ tone: "success", title: "Invitation sent", text: `${sent.email} has 7 days to accept (PENDING). They must sign in with that email and set up MFA.` });
      await reload();
    } catch (problem) {
      key.current = newIdempotencyKey();
      if (errorCode(problem) === "RECENT_MFA_REQUIRED") setStepUp(true);
      else if (problem instanceof ApiError && problem.body.fieldErrors) setErrors(problem.body.fieldErrors);
      else setMessage({ tone: "error", title: "That didn't work", text: problem instanceof ApiError ? problem.body.message : "We couldn't send the invitation. Try again." });
    } finally {
      setBusy(null);
    }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void invite();
  };
  const cancel = async (id: string) => {
    setBusy(id);
    try {
      setList(await api(`/v1/admin/staff/invitations/${id}/revoke`, { method: "POST", response: staffListSchema }));
      setMessage({ tone: "success", title: "Invitation cancelled", text: "The link no longer works." });
    } catch {
      setMessage({ tone: "error", title: "That didn't work", text: "We couldn't cancel the invitation. Try again." });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={styles.tableCol}>
      <div className={styles.panelActions}>
        <Button onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="invite-staff">
          Invite staff
        </Button>
      </div>
      {message ? (
        <Notice tone={message.tone} title={message.title} live>
          <p>{message.text}</p>
        </Notice>
      ) : null}
      {open ? (
        <form id="invite-staff" className={`${styles.panel} ${css.form}`} onSubmit={submit} noValidate aria-labelledby="invite-title">
          <h2 id="invite-title" className={styles.panelTitle}>
            Invite staff
          </h2>
          <div className={css.row}>
            <FormField id="invite-email" label="Email" error={errors.email}>
              <TextField type="email" autoComplete="off" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
            </FormField>
            <FormField id="invite-name" label="Name" error={errors.name}>
              <TextField value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </FormField>
          </div>
          <fieldset className={css.form}>
            <legend className={styles.strong}>Permissions (TECH-03 §8)</legend>
            <div className={css.row}>
              {STAFF_PERMISSIONS.map((permission) => (
                <Checkbox
                  key={permission}
                  id={`invite-${permission}`}
                  label={permission}
                  checked={form.permissions.includes(permission)}
                  onChange={(event) => setForm({ ...form, permissions: event.target.checked ? [...form.permissions, permission] : form.permissions.filter((item) => item !== permission) })}
                />
              ))}
            </div>
          </fieldset>
          <p className={styles.hint}>Giving permissions is high-risk and asks for MFA. The invitation lasts 7 days and works once.</p>
          <div className={css.actions}>
            <Button type="submit" loading={busy === "invite"}>
              Send invitation
            </Button>
          </div>
        </form>
      ) : null}
      <div className={`${styles.panel} ${css.wide}`}>
        <table className={styles.table}>
          <caption className="hp-visually-hidden">Staff and invitations</caption>
          <thead>
            <tr>
              <th scope="col">NAME</th>
              <th scope="col">PERMISSIONS</th>
              <th scope="col">MFA</th>
              <th scope="col">STATUS</th>
            </tr>
          </thead>
          <tbody>
            {list.members.map((member) => (
              <tr key={member.staffProfileId}>
                <td>
                  <a className={styles.action} href={`/staff/${member.staffProfileId}`}>
                    {member.name}
                  </a>
                </td>
                <td className={styles.mono}>{permissionsLine(member.permissions)}</td>
                <td>{member.mfaEnabled ? <StatusChip tone="success">On</StatusChip> : <StatusChip tone="warning">Reset — not set up</StatusChip>}</td>
                <td>
                  <StatusChip tone={member.status === "ACTIVE" ? "success" : "neutral"}>{member.status}</StatusChip>
                </td>
              </tr>
            ))}
            {list.invitations.map((invitation) => (
              <tr key={invitation.id}>
                <td>
                  {invitation.email}
                  <br />
                  <button type="button" className={styles.action} disabled={busy === invitation.id} onClick={() => void cancel(invitation.id)}>
                    Cancel invitation<span className="hp-visually-hidden"> for {invitation.email}</span>
                  </button>
                </td>
                <td className={styles.mono}>{permissionsLine(invitation.permissions)}</td>
                <td>—</td>
                <td>
                  <StatusChip tone={invitation.status === "PENDING" ? "info" : "neutral"}>{invitation.status}</StatusChip>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <StepUpDialog open={stepUp} action={`Invite ${form.email || "a staff member"} with ${form.permissions.join(", ") || "no permissions"}`} confirmLabel="Confirm and invite" onClose={() => setStepUp(false)} onVerified={invite} />
    </div>
  );
}
