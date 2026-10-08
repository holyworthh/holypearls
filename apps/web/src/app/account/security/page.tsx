import { meSchema, sessionListSchema } from "@holypearls/contracts";

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { serverApi } from "../../../lib/server-api";
import styles from "../account.module.css";
import { ChangePassword } from "./ChangePassword";
import { SessionsCard } from "./SessionsCard";
import { AccountShell } from "../../../components/account/AccountShell";

export const metadata: Metadata = { title: "Security", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Signed-in account security (Pen frame 90 · KReiI): a server-rendered signed-in page. */
export default async function SecurityPage() {
  const me = await serverApi("/v1/me", meSchema);
  if (!me.ok) {
    if (me.status === 401) redirect("/sign-in?next=/account/security");
    throw new Error(me.error.message);
  }
  const sessions = await serverApi("/v1/me/sessions", sessionListSchema);

  return (
    <AccountShell current="/account/security">
      <div>
        <h1 className={styles.title}>Security</h1>
        <p className={styles.subtitle}>Signed in as {me.data.email}</p>
      </div>
      <ChangePassword />
      <SessionsCard initial={sessions.ok ? sessions.data.sessions : null} total={sessions.ok ? sessions.data.total : 0} />
      <p className={styles.note}>Sessions last 30 days and extend while you use them.</p>
    </AccountShell>
  );
}
