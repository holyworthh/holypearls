"use client";

import {
  ApiError,
  CONFIRMATION_REQUIRED,
  IDEMPOTENCY_KEY_HEADER,
  type MyOrganization,
  ORGANIZATION_PERMISSIONS,
  ORGANIZATION_ROLES,
  type OrganizationPermission,
  type OrganizationRole,
  PERMISSION_LABELS,
  ROLE_LABELS,
  ROLE_PRESETS,
  type Team,
  type TeamInvitation,
  type TeamMember,
  teamInvitationSchema,
  teamMemberSchema,
  teamSchema,
  toFieldErrors,
  inviteInputSchema,
} from "@holypearls/contracts";
import { Button, Checkbox, Dialog, FormField, Notice, Select, StatusChip, TextField } from "@holypearls/ui";
import { api, errorCode, errorReason, newIdempotencyKey } from "@holypearls/web-kit/api";
import { ChevronRight, Ellipsis, RefreshCw, ShieldAlert, UserPlus } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { useEmailCode } from "../EmailCode";
import { INVITE_STATUS, MEMBER_STATUS, reach, REFUSAL } from "./labels";
import styles from "./workspace.module.css";

type Location = { id: string; name: string };
type Scope = { allLocations: boolean; locationIds: string[] };
interface Confirmation {
  title: string;
  body: string[];
  added: string[];
  action: string;
  destructive?: boolean;
  run: () => Promise<void>;
}

const firstName = (name: string) => name.replace(/\(.*?\)/g, "").trim().split(/\s+/)[0] ?? name;
const article = (role: OrganizationRole) => (role === "ADMIN" || role === "APPROVER" || role === "OWNER" ? "an" : "a");
const INVITABLE = ORGANIZATION_ROLES.filter((role) => role !== "OWNER");

const message = (error: unknown) => {
  if (errorCode(error) === "VERSION_CONFLICT") return "Someone else changed this member first. We've refreshed the team; try again.";
  const reason = errorReason(error);
  if (reason && REFUSAL[reason]) return REFUSAL[reason]!;
  return error instanceof ApiError ? error.body.message : "Something went wrong. Check your connection and try again.";
};

/** Choose All locations or particular ones; only the manager's own locations are offered (no escalation). */
function ScopePicker({ idPrefix, scope, onChange, locations, canGrantAll, error }: { idPrefix: string; scope: Scope; onChange: (scope: Scope) => void; locations: readonly Location[]; canGrantAll: boolean; error?: string }) {
  return (
    <fieldset className={styles.choices} aria-describedby={error ? `${idPrefix}-error` : undefined}>
      <legend>Locations</legend>
      {canGrantAll ? <Checkbox id={`${idPrefix}-all`} label="All locations" hint="Including locations added later" checked={scope.allLocations} onChange={(event) => onChange({ ...scope, allLocations: event.target.checked })} /> : null}
      {scope.allLocations
        ? null
        : locations.map((location) => (
            <Checkbox
              key={location.id}
              id={`${idPrefix}-${location.id}`}
              label={location.name}
              checked={scope.locationIds.includes(location.id)}
              onChange={(event) => onChange({ ...scope, locationIds: event.target.checked ? [...scope.locationIds, location.id] : scope.locationIds.filter((id) => id !== location.id) })}
            />
          ))}
      {error ? (
        <p id={`${idPrefix}-error`} className={styles.dialogText} role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

/**
 * Team (Pen 70 · HLbMo: desktop table I0EQdT, 390 px cards LrSO2). Invite with
 * a role and locations (B2B-FR-090); raising someone's access asks for
 * confirmation and a recent email code (B2B-FR-091, TECH-03 §9); the last
 * Owner is protected (B2B-FR-092); deactivation ends access at once
 * (B2B-FR-093). The page only hides what the API would refuse; the API checks
 * every change again.
 */
export function TeamView({ organization, initial }: { organization: MyOrganization; initial: Team }) {
  const [team, setTeam] = useState(initial);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [inviting, setInviting] = useState(false);
  const [managing, setManaging] = useState<TeamMember | null>(null);
  const [invitation, setInvitation] = useState<TeamInvitation | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [busy, setBusy] = useState(false);
  const emailCode = useEmailCode("VERIFY_ACTION");
  const me = organization.me;
  const isOwner = me.role === "OWNER";
  const base = `/v1/organizations/${organization.id}`;
  const myLocations: Location[] = me.locations;
  const total = team.members.length + team.invitations.length;
  const soleOwner = team.activeOwners === 1 ? team.members.find((member) => member.role === "OWNER" && member.status === "ACTIVE") : undefined;

  const refresh = async () => {
    setTeam(await api(`${base}/members`, { response: teamSchema }));
    // The result notice sits above the list; on a phone it may be off screen.
    window.scrollTo({ top: 0 });
  };
  const fail = async (error: unknown) => {
    setNotice({ tone: "error", text: message(error) });
    if (errorCode(error) === "VERSION_CONFLICT") await refresh().catch(() => undefined);
  };
  const canManage = (member: TeamMember) => member.role !== "OWNER" || isOwner;

  /**
   * Sends a change. The first answer for anything that changes access is
   * CONFIRMATION_REQUIRED with what it would add; the dialog shows that, and
   * confirming sends it again, through the email code step when the API asks.
   */
  const confirmable = async (send: (confirmed: boolean) => Promise<unknown>, describe: (context: Record<string, unknown>) => Omit<Confirmation, "run">, done: string) => {
    setNotice(null);
    try {
      await send(false);
      await refresh();
      setNotice({ tone: "success", text: done });
    } catch (error) {
      if (errorReason(error) !== CONFIRMATION_REQUIRED) return fail(error);
      const context = (error as ApiError).body.context ?? {};
      setConfirmation({
        ...describe(context),
        run: async () => {
          setBusy(true);
          // After an email code the dialog runs this again, so it refreshes and reports by itself.
          const apply = async () => {
            try {
              await send(true);
              await refresh();
              setNotice({ tone: "success", text: done });
            } catch (failure) {
              if (errorCode(failure) === "RECENT_EMAIL_CODE_REQUIRED") throw failure;
              await fail(failure);
            }
          };
          try {
            await emailCode.run(apply);
          } finally {
            setConfirmation(null);
            setManaging(null);
            setBusy(false);
          }
        },
      });
    }
  };

  const addedLines = (context: Record<string, unknown>) => {
    const permissions = (context.addedPermissions as { label: string }[] | undefined) ?? [];
    const locations = (context.addedLocations as { name: string }[] | undefined) ?? [];
    return [...(context.becomesOwner ? ["Owner: every permission, including transferring ownership"] : []), ...permissions.map((entry) => entry.label), ...(context.addedAllLocations ? ["All locations"] : []), ...locations.map((location) => `Location: ${location.name}`)];
  };

  const changeMember = (member: TeamMember, next: { role: OrganizationRole; scope: Scope; permissions: OrganizationPermission[] | null }) =>
    confirmable(
      (confirmed) =>
        api(`${base}/members/${member.membershipId}`, {
          method: "PATCH",
          body: { role: next.role, allLocations: next.scope.allLocations, locationIds: next.scope.allLocations ? [] : next.scope.locationIds, permissions: next.permissions, version: member.version, confirmed },
          response: teamMemberSchema,
        }),
      (context) => ({
        title: next.role !== member.role ? `Make ${member.name} ${article(next.role)} ${ROLE_LABELS[next.role]}?` : `Change ${member.name}'s access?`,
        body: [context.raises ? `${firstName(member.name)} will get:` : `${firstName(member.name)} will lose some access.`],
        added: addedLines(context),
        action: next.role !== member.role ? "Change role" : "Save changes",
      }),
      `${member.name}'s access was changed.`,
    );

  const setStatus = (member: TeamMember, to: "deactivate" | "reactivate") =>
    confirmable(
      (confirmed) => api(`${base}/members/${member.membershipId}/${to}`, { method: "POST", body: { version: member.version, confirmed }, response: teamMemberSchema }),
      (context) =>
        to === "deactivate"
          ? { title: `Deactivate ${member.name}?`, body: ["They lose access to the workspace straight away. Their past actions stay in the history."], added: [], action: "Deactivate", destructive: true }
          : { title: `Reactivate ${member.name}?`, body: [`${firstName(member.name)} gets their access back:`], added: addedLines(context), action: "Reactivate" },
      to === "deactivate" ? `${member.name} was deactivated.` : `${member.name} was reactivated.`,
    );

  const transfer = (member: TeamMember, stepDown: boolean) =>
    confirmable(
      async (confirmed) => {
        const result = await api(`${base}/ownership-transfer`, { method: "POST", body: { membershipId: member.membershipId, stepDown, confirmed }, response: teamSchema });
        // Stepping down removes Owner powers from this page, so it reloads with the new role.
        if (confirmed && stepDown) window.location.reload();
        return result;
      },
      () => ({
        title: `Make ${member.name} an Owner?`,
        body: [stepDown ? "They get every permission and every location, and you become an Admin." : "They get every permission and every location. You stay an Owner too."],
        added: [],
        action: "Make Owner",
      }),
      `${member.name} is now an Owner.`,
    );

  const inviteAgain = async (entry: TeamInvitation) => {
    setNotice(null);
    try {
      await api(`${base}/invitations`, {
        method: "POST",
        body: { email: entry.email, role: entry.role, allLocations: entry.allLocations, locationIds: entry.locations.map((location) => location.id) },
        headers: { [IDEMPOTENCY_KEY_HEADER]: newIdempotencyKey() },
        response: teamInvitationSchema,
      });
      setInvitation(null);
      await refresh();
      setNotice({ tone: "success", text: `A new invitation was sent to ${entry.email}.` });
    } catch (error) {
      await fail(error);
    }
  };

  const revoke = async (entry: TeamInvitation) => {
    setNotice(null);
    try {
      await api(`${base}/invitations/${entry.id}/revoke`, { method: "POST", response: z.object({ revoked: z.literal(true) }) });
      setInvitation(null);
      await refresh();
      setNotice({ tone: "success", text: `The invitation to ${entry.email} was cancelled.` });
    } catch (error) {
      await fail(error);
    }
  };

  const memberStatus = (member: TeamMember) => <StatusChip tone={MEMBER_STATUS[member.status].tone}>{MEMBER_STATUS[member.status].label}</StatusChip>;
  const inviteStatus = (entry: TeamInvitation) => <StatusChip tone={INVITE_STATUS[entry.status].tone}>{INVITE_STATUS[entry.status].label}</StatusChip>;
  const roleControl = (member: TeamMember) =>
    member.status === "ACTIVE" && canManage(member) ? (
      <select
        className={styles.roleSelect}
        aria-label={`Role for ${member.name}`}
        value={member.role}
        onChange={(event) => void changeMember(member, { role: event.target.value as OrganizationRole, scope: { allLocations: member.allLocations, locationIds: member.locations.map((location) => location.id) }, permissions: null })}
      >
        {ORGANIZATION_ROLES.filter((role) => role !== "OWNER" || member.role === "OWNER").map((role) => (
          <option key={role} value={role}>
            {ROLE_LABELS[role]}
          </option>
        ))}
      </select>
    ) : (
      ROLE_LABELS[member.role]
    );

  return (
    <>
      <div className={styles.head}>
        <h1 className={styles.title}>
          Team<span className={styles.mobileCount}> · {total}</span>
        </h1>
        <Button onClick={() => setInviting(true)}>
          <UserPlus aria-hidden className={styles.buttonIcon} />
          Invite people
        </Button>
      </div>
      {notice ? (
        <Notice tone={notice.tone} live>
          <p>{notice.text}</p>
        </Notice>
      ) : null}
      {soleOwner ? (
        <p className={styles.warning}>
          <ShieldAlert aria-hidden />
          {soleOwner.isYou ? "You're the only Owner." : `${firstName(soleOwner.name)} is the only Owner.`} Add another Owner before changing {soleOwner.isYou ? "your" : "their"} role.
        </p>
      ) : null}

      <table className={styles.table}>
        <caption className="hp-visually-hidden">Members and invitations</caption>
        <thead>
          <tr>
            <th scope="col">Member</th>
            <th scope="col" className={styles.colFixed}>
              Role
            </th>
            <th scope="col" className={styles.colFixed}>
              Location
            </th>
            <th scope="col" className={styles.colFixed}>
              Status
            </th>
            <th scope="col" className={styles.colActions}>
              <span className="hp-visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {team.members.map((member) => (
            <tr key={member.membershipId}>
              <td>
                <span className={styles.person}>
                  <span className={styles.avatar} aria-hidden="true">
                    {member.name.trim()[0]!.toUpperCase()}
                  </span>
                  <span className={styles.personText}>
                    <span className={styles.personName}>
                      {member.name}
                      {member.isYou ? " (you)" : ""}
                    </span>
                    <span className={styles.personEmail}>{member.email}</span>
                  </span>
                </span>
              </td>
              <td>{roleControl(member)}</td>
              <td>{reach(member)}</td>
              <td>{memberStatus(member)}</td>
              <td className={styles.colActions}>
                {canManage(member) ? (
                  <button type="button" className={styles.iconButton} onClick={() => setManaging(member)} aria-label={`Manage ${member.name}`}>
                    <Ellipsis aria-hidden />
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
          {team.invitations.map((entry) => (
            <tr key={entry.id}>
              <td>
                <span className={styles.person}>
                  <span className={styles.avatar} aria-hidden="true">
                    {entry.email[0]!.toUpperCase()}
                  </span>
                  <span className={styles.personText}>
                    <span className={styles.personName}>{entry.email}</span>
                    <span className={styles.personEmail}>Invited</span>
                  </span>
                </span>
              </td>
              <td>{ROLE_LABELS[entry.role]}</td>
              <td>{reach(entry)}</td>
              <td>{inviteStatus(entry)}</td>
              <td className={styles.colActions}>
                {entry.status === "EXPIRED" ? (
                  <button type="button" className={styles.iconButton} onClick={() => void inviteAgain(entry)} aria-label={`Invite ${entry.email} again`}>
                    <RefreshCw aria-hidden />
                  </button>
                ) : (
                  <button type="button" className={styles.iconButton} onClick={() => setInvitation(entry)} aria-label={`Manage the invitation to ${entry.email}`}>
                    <Ellipsis aria-hidden />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className={styles.cards} aria-label="Members and invitations">
        {team.members.map((member) => (
          <li key={member.membershipId}>
            <button type="button" className={styles.card} onClick={() => setManaging(member)} disabled={!canManage(member)} aria-label={`${member.name}, ${ROLE_LABELS[member.role]}, ${reach(member)}, ${MEMBER_STATUS[member.status].label}`}>
              <span className={styles.avatar} aria-hidden="true">
                {member.name.trim()[0]!.toUpperCase()}
              </span>
              <span className={styles.cardText}>
                <span className={styles.personName}>{member.name}</span>
                <span className={styles.personEmail}>
                  {ROLE_LABELS[member.role]} · {reach(member)}
                </span>
                {memberStatus(member)}
              </span>
              {canManage(member) ? <ChevronRight aria-hidden className={styles.chevron} /> : null}
            </button>
          </li>
        ))}
        {team.invitations.map((entry) => (
          <li key={entry.id}>
            <button type="button" className={styles.card} onClick={() => setInvitation(entry)} aria-label={`${entry.email}, ${ROLE_LABELS[entry.role]}, ${reach(entry)}, ${INVITE_STATUS[entry.status].label}`}>
              <span className={styles.avatar} aria-hidden="true">
                {entry.email[0]!.toUpperCase()}
              </span>
              <span className={styles.cardText}>
                <span className={styles.personName}>{entry.email}</span>
                <span className={styles.personEmail}>
                  {ROLE_LABELS[entry.role]} · {reach(entry)}
                </span>
                {inviteStatus(entry)}
              </span>
              <ChevronRight aria-hidden className={styles.chevron} />
            </button>
          </li>
        ))}
      </ul>

      <InviteDialog
        open={inviting}
        onClose={() => setInviting(false)}
        locations={myLocations}
        canGrantAll={me.allLocations}
        onSend={async (body, key) => {
          await api(`${base}/invitations`, { method: "POST", body, headers: { [IDEMPOTENCY_KEY_HEADER]: key }, response: teamInvitationSchema });
          setInviting(false);
          await refresh();
          setNotice({ tone: "success", text: `Invitation sent to ${body.email}. It works once and expires in 7 days.` });
        }}
      />

      {managing ? (
        <ManageDialog
          key={managing.membershipId}
          member={managing}
          isOwner={isOwner}
          locations={myLocations}
          canGrantAll={me.allLocations}
          soleOwner={soleOwner?.membershipId === managing.membershipId}
          onClose={() => setManaging(null)}
          onSave={(next) => changeMember(managing, next)}
          onStatus={(to) => setStatus(managing, to)}
          onTransfer={(stepDown) => transfer(managing, stepDown)}
        />
      ) : null}

      <Dialog
        open={invitation !== null}
        onClose={() => setInvitation(null)}
        title={invitation ? `Invitation to ${invitation.email}` : ""}
        footer={
          invitation ? (
            <>
              <Button variant="secondary" onClick={() => setInvitation(null)}>
                Close
              </Button>
              {invitation.status === "PENDING" ? (
                <Button variant="destructive" onClick={() => void revoke(invitation)}>
                  Revoke invitation
                </Button>
              ) : (
                <Button onClick={() => void inviteAgain(invitation)}>Invite again</Button>
              )}
            </>
          ) : null
        }
      >
        {invitation ? (
          <p className={styles.dialogText}>
            {ROLE_LABELS[invitation.role]} · {reach(invitation)}. {invitation.status === "PENDING" ? `Expires ${new Date(invitation.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "Africa/Lagos" })}.` : "This invitation expired."}
          </p>
        ) : null}
      </Dialog>

      <Dialog
        open={confirmation !== null}
        onClose={() => setConfirmation(null)}
        title={confirmation?.title ?? ""}
        footer={
          confirmation ? (
            <>
              <Button variant="secondary" onClick={() => setConfirmation(null)}>
                Cancel
              </Button>
              <Button variant={confirmation.destructive ? "destructive" : "primary"} loading={busy} onClick={() => void confirmation.run()}>
                {confirmation.action}
              </Button>
            </>
          ) : null
        }
      >
        {confirmation ? (
          <>
            {confirmation.body.map((line) => (
              <p key={line} className={styles.dialogText}>
                {line}
              </p>
            ))}
            {confirmation.added.length ? (
              <ul className={styles.added}>
                {confirmation.added.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
            {confirmation.added.length ? <p className={styles.dialogText}>Giving someone more access needs a code we email you. They&apos;ll get an email about the change.</p> : null}
          </>
        ) : null}
      </Dialog>
      {emailCode.dialog}
    </>
  );
}

function InviteDialog({ open, onClose, locations, canGrantAll, onSend }: { open: boolean; onClose: () => void; locations: readonly Location[]; canGrantAll: boolean; onSend: (body: z.infer<typeof inviteInputSchema>, key: string) => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<OrganizationRole, "OWNER">>("BUYER");
  const [scope, setScope] = useState<Scope>({ allLocations: false, locationIds: locations.length === 1 ? [locations[0]!.id] : [] });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(() => newIdempotencyKey());

  const submit = async () => {
    setFailure(undefined);
    const parsed = inviteInputSchema.safeParse({ email, role, allLocations: scope.allLocations, locationIds: scope.allLocations ? [] : scope.locationIds });
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await onSend(parsed.data, key);
      setEmail("");
      setKey(newIdempotencyKey());
    } catch (error) {
      if (error instanceof ApiError && error.body.fieldErrors) setErrors(error.body.fieldErrors);
      else setFailure(message(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Invite people"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={() => void submit()}>
            Send invitation
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        {failure ? (
          <Notice tone="error" live>
            <p>{failure}</p>
          </Notice>
        ) : null}
        <FormField id="invite-email" label="Email" hint="They accept by signing in with this email." error={errors.email}>
          <TextField type="email" autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} />
        </FormField>
        <FormField id="invite-role" label="Role" hint={ROLE_PRESETS[role].map((permission) => PERMISSION_LABELS[permission]).join(" · ")} error={errors.role}>
          <Select value={role} onChange={(event) => setRole(event.target.value as typeof role)} options={INVITABLE.map((value) => ({ value, label: ROLE_LABELS[value] }))} />
        </FormField>
        <ScopePicker idPrefix="invite-location" scope={scope} onChange={setScope} locations={locations} canGrantAll={canGrantAll} error={errors.locationIds} />
      </div>
    </Dialog>
  );
}

/** One member: role, locations, permissions (Owners only), status and ownership. Opens as a sheet on mobile (frame 70). */
function ManageDialog({
  member,
  isOwner,
  locations,
  canGrantAll,
  soleOwner,
  onClose,
  onSave,
  onStatus,
  onTransfer,
}: {
  member: TeamMember;
  isOwner: boolean;
  locations: readonly Location[];
  canGrantAll: boolean;
  soleOwner: boolean;
  onClose: () => void;
  onSave: (next: { role: OrganizationRole; scope: Scope; permissions: OrganizationPermission[] | null }) => Promise<void>;
  onStatus: (to: "deactivate" | "reactivate") => Promise<void>;
  onTransfer: (stepDown: boolean) => Promise<void>;
}) {
  const [role, setRole] = useState<OrganizationRole>(member.role);
  const [scope, setScope] = useState<Scope>({ allLocations: member.allLocations, locationIds: member.locations.map((location) => location.id) });
  const [permissions, setPermissions] = useState<OrganizationPermission[]>(member.permissions);
  const [adjust, setAdjust] = useState(member.adjusted);
  const [stepDown, setStepDown] = useState(false);
  const [locationError, setLocationError] = useState<string>();
  const active = member.status === "ACTIVE";
  const roles = ORGANIZATION_ROLES.filter((value) => value !== "OWNER" || member.role === "OWNER");

  const save = () => {
    if (role !== "OWNER" && !scope.allLocations && scope.locationIds.length === 0) {
      setLocationError("Choose at least one location, or All locations");
      return;
    }
    void onSave({ role, scope: role === "OWNER" ? { allLocations: true, locationIds: [] } : scope, permissions: isOwner && adjust && role !== "OWNER" ? permissions : null });
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={member.name}
      footer={
        active ? (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={save}>Save changes</Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            <Button onClick={() => void onStatus("reactivate")}>Reactivate</Button>
          </>
        )
      }
    >
      <div className={styles.form}>
        <p className={styles.dialogText}>
          {member.email} · {MEMBER_STATUS[member.status].label}
        </p>
        {soleOwner ? (
          <p className={styles.warning}>
            <ShieldAlert aria-hidden />
            {firstName(member.name)} is the only Owner. Add another Owner before changing their role.
          </p>
        ) : null}
        {active ? (
          <>
            <FormField id="manage-role" label="Role">
              <Select
                value={role}
                disabled={soleOwner}
                onChange={(event) => {
                  const next = event.target.value as OrganizationRole;
                  setRole(next);
                  setPermissions([...(next === "OWNER" ? ORGANIZATION_PERMISSIONS : ROLE_PRESETS[next])]);
                }}
                options={roles.map((value) => ({ value, label: ROLE_LABELS[value] }))}
              />
            </FormField>
            {role === "OWNER" ? (
              <p className={styles.dialogText}>Owners hold every permission and every location.</p>
            ) : (
              <ScopePicker
                idPrefix="manage-location"
                scope={scope}
                onChange={(next) => {
                  setScope(next);
                  setLocationError(undefined);
                }}
                locations={locations}
                canGrantAll={canGrantAll}
                error={locationError}
              />
            )}
            {isOwner && role !== "OWNER" ? (
              <fieldset className={styles.choices}>
                <legend>Permissions</legend>
                <Checkbox id="manage-adjust" label="Adjust this role's permissions for this person" checked={adjust} onChange={(event) => setAdjust(event.target.checked)} />
                {adjust
                  ? ORGANIZATION_PERMISSIONS.map((permission) => (
                      <Checkbox
                        key={permission}
                        id={`manage-permission-${permission}`}
                        label={PERMISSION_LABELS[permission]}
                        checked={permissions.includes(permission)}
                        onChange={(event) => setPermissions(event.target.checked ? [...permissions, permission] : permissions.filter((value) => value !== permission))}
                      />
                    ))
                  : null}
              </fieldset>
            ) : null}
            {!member.isYou ? (
              <div className={styles.dangerZone}>
                {isOwner && member.role !== "OWNER" ? (
                  <>
                    <Checkbox id="manage-step-down" label="I'll become an Admin" checked={stepDown} onChange={(event) => setStepDown(event.target.checked)} />
                    <Button variant="secondary" onClick={() => void onTransfer(stepDown)}>
                      Make Owner
                    </Button>
                  </>
                ) : null}
                {!soleOwner ? (
                  <Button variant="destructive" onClick={() => void onStatus("deactivate")}>
                    Deactivate
                  </Button>
                ) : null}
              </div>
            ) : null}
          </>
        ) : (
          <p className={styles.dialogText}>Deactivated members can&apos;t open the workspace. Reactivating gives them back their role and locations.</p>
        )}
      </div>
    </Dialog>
  );
}
