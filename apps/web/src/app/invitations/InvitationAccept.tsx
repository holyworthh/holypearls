"use client";

import { acceptedInvitationSchema, INVITATION_TOKEN_HEADER, type InvitationPreview, invitationPreviewSchema, type Me, meSchema, ROLE_LABELS } from "@holypearls/contracts";
import { Button, ButtonLink, Notice, PageLoading } from "@holypearls/ui";
import { api, errorCode, errorReason } from "@holypearls/web-kit/api";
import styles from "@holypearls/web-kit/auth.module.css";
import { useCallback, useEffect, useState } from "react";
import { ResendVerification } from "../../components/account/ResendVerification";

/** Kept for this tab only, so the secret survives signing in without ever going into a URL the server sees. */
const STORE = "hp.invitation";

type View =
  | { state: "loading" }
  | { state: "missing" }
  | { state: "ready"; token: string; preview: InvitationPreview; me: Me | null };

const readStore = () => {
  try {
    return sessionStorage.getItem(STORE);
  } catch {
    return null;
  }
};
const writeStore = (token: string | null) => {
  try {
    if (token) sessionStorage.setItem(STORE, token);
    else sessionStorage.removeItem(STORE);
  } catch {
    // Private windows may refuse storage; the link still works in this tab.
  }
};

export function InvitationAccept() {
  const [view, setView] = useState<View>({ state: "loading" });
  const [problem, setProblem] = useState<{ reason: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const fromHash = window.location.hash.slice(1);
    if (fromHash) {
      writeStore(fromHash);
      // Take the secret out of the address bar and history.
      window.history.replaceState(null, "", window.location.pathname);
    }
    const token = fromHash || readStore();
    if (!token) return setView({ state: "missing" });
    try {
      const preview = await api("/v1/invitations/preview", { headers: { [INVITATION_TOKEN_HEADER]: token }, response: invitationPreviewSchema });
      const me = await api("/v1/me", { response: meSchema }).catch(() => null);
      setView({ state: "ready", token, preview, me });
    } catch {
      setView({ state: "missing" });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (view.state === "loading") return <PageLoading label="Opening your invitation" />;
  if (view.state === "missing") {
    return (
      <section className={`${styles.card} ${styles.stateCard}`} aria-labelledby="invite-title">
        <h1 id="invite-title" className={styles.stateTitle}>
          This invitation link doesn&apos;t work
        </h1>
        <p className={styles.intro}>Open the link from your invitation email again, or ask the person who invited you to send a new one.</p>
      </section>
    );
  }

  const { token, preview, me } = view;
  const role = ROLE_LABELS[preview.role];
  const closed = {
    ACCEPTED: ["This invitation has already been used", "Each invitation works once. If it was you, open your workspace."],
    EXPIRED: ["This invitation has expired", "Invitations last 7 days. Ask the person who invited you to send a new one."],
    REVOKED: ["This invitation was cancelled", "Ask the person who invited you if you still need access."],
  } as const;

  if (preview.status !== "PENDING") {
    const [title, body] = closed[preview.status];
    return (
      <section className={`${styles.card} ${styles.stateCard}`} aria-labelledby="invite-title">
        <h1 id="invite-title" className={styles.stateTitle}>
          {title}
        </h1>
        <p className={styles.intro}>{body}</p>
        {preview.status === "ACCEPTED" && me ? (
          <ButtonLink fullWidth href="/workspace">
            Open your workspace
          </ButtonLink>
        ) : null}
      </section>
    );
  }

  const accept = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const { organizationId } = await api("/v1/invitations/accept", { method: "POST", body: { token }, response: acceptedInvitationSchema });
      writeStore(null);
      window.location.assign(`/workspace/${organizationId}`);
    } catch (error) {
      setBusy(false);
      const reason = errorReason(error) ?? errorCode(error) ?? "";
      const text: Record<string, string> = {
        WRONG_ACCOUNT: `This invitation is for ${preview.invitedEmail}. Sign in with that email to accept it.`,
        VERIFY_EMAIL_FIRST: "Verify your email first, then accept the invitation.",
        ALREADY_MEMBER: "You're already in this team.",
        INVITATION_EXPIRED: closed.EXPIRED[1],
        INVITATION_REVOKED: closed.REVOKED[1],
        INVITATION_ACCEPTED: closed.ACCEPTED[1],
      };
      setProblem({ reason, text: text[reason] ?? "We couldn't accept the invitation. Try again." });
    }
  };

  return (
    <section className={styles.card} aria-labelledby="invite-title">
      <h1 id="invite-title" className={styles.title}>
        Join {preview.organizationName}
      </h1>
      <p className={styles.intro}>
        You&apos;re invited as {role}. The invitation is for {preview.invitedEmail} and works until{" "}
        {new Date(preview.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "Africa/Lagos" })}.
      </p>
      {problem ? (
        <Notice tone={problem.reason === "ALREADY_MEMBER" ? "info" : "error"} live>
          <p>{problem.text}</p>
          {problem.reason === "ALREADY_MEMBER" ? (
            <ButtonLink variant="secondary" href="/workspace">
              Open your workspace
            </ButtonLink>
          ) : null}
        </Notice>
      ) : null}
      {!me ? (
        <div className={styles.actions}>
          <ButtonLink fullWidth className={styles.primary} href="/sign-in?next=/invitations">
            Sign in to accept
          </ButtonLink>
          <ButtonLink fullWidth variant="secondary" href="/sign-up">
            Create an account
          </ButtonLink>
          <p className={styles.support}>Use {preview.invitedEmail}, the email the invitation was sent to. New accounts verify their email first, then open the invitation link again.</p>
        </div>
      ) : !me.emailVerified ? (
        <Notice tone="warning" title="Verify your email first">
          <p>Check {me.email} for the verification link, then come back to this page.</p>
          <ResendVerification email={me.email} />
        </Notice>
      ) : (
        <div className={styles.actions}>
          <Button fullWidth loading={busy} onClick={() => void accept()}>
            Accept invitation
          </Button>
          <p className={styles.support}>Signed in as {me.email}.</p>
          {problem?.reason === "WRONG_ACCOUNT" ? (
            <ButtonLink fullWidth variant="secondary" href="/sign-in?next=/invitations">
              Sign in with another account
            </ButtonLink>
          ) : null}
        </div>
      )}
    </section>
  );
}
