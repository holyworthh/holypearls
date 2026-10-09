import { myOrganizationsSchema, ROLE_LABELS } from "@holypearls/contracts";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountShell } from "../../components/account/AccountShell";
import { serverApi } from "../../lib/server-api";
import styles from "../account/account.module.css";

export const metadata: Metadata = { title: "Your workspaces", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const landing = (organization: { id: string }) => `/workspace/${organization.id}`;

/**
 * Into the Brand Workspace. One workspace opens straight away; several are
 * listed; none sends the person to ask for one (owner decision 2026-10-08).
 */
export default async function WorkspacePage() {
  const mine = await serverApi("/v1/me/organizations", myOrganizationsSchema);
  if (!mine.ok) {
    if (mine.status === 401) redirect("/sign-in?next=/workspace");
    throw new Error(mine.error.message);
  }
  const { organizations } = mine.data;
  if (organizations.length === 0) redirect("/account/workspace");
  if (organizations.length === 1) redirect(landing(organizations[0]!));
  return (
    <AccountShell current="/account/workspace">
      <h1 className={styles.title}>Your workspaces</h1>
      <section className={styles.card} aria-labelledby="workspaces-title">
        <h2 id="workspaces-title" className={styles.cardTitle}>
          Choose a workspace
        </h2>
        <ul className={styles.rows}>
          {organizations.map((organization) => (
            <li key={organization.id} className={styles.row}>
              <div className={styles.rowText}>
                <span className={styles.ref}>{ROLE_LABELS[organization.me.role].toUpperCase()}</span>
                <p className={styles.rowTitle}>{organization.name}</p>
              </div>
              <a className={styles.action} href={landing(organization)}>
                Open
                <ArrowRight aria-hidden size={16} />
              </a>
            </li>
          ))}
        </ul>
      </section>
    </AccountShell>
  );
}
