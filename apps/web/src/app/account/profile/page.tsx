import { meSchema } from "@holypearls/contracts";
import { Notice } from "@holypearls/ui";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountShell } from "../../../components/account/AccountShell";
import { serverApi } from "../../../lib/server-api";
import styles from "../account.module.css";
import { ProfileForm } from "./ProfileForm";

export const metadata: Metadata = { title: "Profile", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Profile (Pen frame 91 · Wulll: desktop z7H5i, mobile SKaLX, states rSztv). */
export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  const me = await serverApi("/v1/me", meSchema);
  if (!me.ok) {
    if (me.status === 401) redirect("/sign-in?next=/account/profile");
    throw new Error(me.error.message);
  }
  return (
    <AccountShell current="/account/profile">
      <h1 className={styles.title}>Profile</h1>
      {email === "changed" ? (
        <Notice tone="success" title="Email changed">
          <p>Your account email is now {me.data.email}. You were signed out on your other devices.</p>
        </Notice>
      ) : null}
      <ProfileForm initial={{ name: me.data.name, email: me.data.email, phone: me.data.phone, emailVerified: me.data.emailVerified, pendingEmail: me.data.pendingEmail }} />
    </AccountShell>
  );
}
