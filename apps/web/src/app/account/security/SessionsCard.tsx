"use client";

import { revokeAllResultSchema, type SessionList } from "@holypearls/contracts";
import { Button, ButtonLink, Dialog, Notice, StatusChip } from "@holypearls/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../../lib/api";
import styles from "./security.module.css";

type Session = SessionList["sessions"][number];

const relative = (iso: string, now = Date.now()) => {
  const minutes = Math.round((now - Date.parse(iso)) / 60_000);
  if (minutes < 5) return "active now";
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
};

/** "Where you're signed in" with sign out everywhere (Pen frame 90 and its states EQyq6). */
export function SessionsCard({ initial }: { initial: Session[] | null }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);

  if (done) {
    return (
      <section className={styles.card} aria-live="polite">
        <Notice tone="success" title="All sessions ended">
          <p>You&apos;ve been signed out on every device. Sign in again to continue.</p>
        </Notice>
        <ButtonLink href="/sign-in" fullWidth className={styles.fullButton}>
          Sign in
        </ButtonLink>
      </section>
    );
  }

  if (!initial) {
    return (
      <section className={styles.card}>
        <Notice tone="error" title="Something went wrong" live>
          <p>We couldn&apos;t load your sessions. Try again.</p>
        </Notice>
        <div>
          <Button variant="secondary" onClick={() => router.refresh()}>
            Try again
          </Button>
        </div>
      </section>
    );
  }

  const revokeAll = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await api("/v1/me/sessions/revoke-all", { method: "POST", body: {}, response: revokeAllResultSchema });
      setConfirming(false);
      setDone(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const count = initial.length;
  return (
    <section className={`${styles.card} ${styles.sessionsCard}`} aria-labelledby="sessions-title">
      <h2 id="sessions-title" className={styles.cardTitle}>
        Where you&apos;re signed in
      </h2>
      <ul className={styles.sessions}>
        {initial.map((session) => (
          <li key={session.sessionId} className={styles.session}>
            <span className={styles.sessionText}>
              <span className={styles.device}>{session.device}</span>
              <span className={styles.meta}>
                {session.current ? "active now" : relative(session.lastActiveAt)}
              </span>
            </span>
            {session.current ? <StatusChip tone="info">This device</StatusChip> : null}
          </li>
        ))}
      </ul>
      <div className={styles.sessionActions}>
        <Button variant="destructive" onClick={() => setConfirming(true)}>
          Sign out everywhere
        </Button>
      </div>
      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Sign out everywhere?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button variant="destructive" loading={busy} onClick={() => void revokeAll()}>
              Sign out everywhere
            </Button>
          </>
        }
      >
        <p className={styles.support}>
          You&apos;ll be signed out on {count === 1 ? "this device" : `all ${count} devices, including this one`}. Guest
          links you received by email keep working.
        </p>
        {failed ? (
          <Notice tone="error" title="Something went wrong" live>
            <p>We couldn&apos;t sign you out everywhere. Try again.</p>
          </Notice>
        ) : null}
      </Dialog>
    </section>
  );
}
