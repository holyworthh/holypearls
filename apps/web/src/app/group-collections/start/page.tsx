import { myOrganizationsSchema } from "@holypearls/contracts";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountShell } from "../../../components/account/AccountShell";
import { serverApi } from "../../../lib/server-api";
import styles from "../../account/account.module.css";

export const metadata: Metadata = { title: "Start a group collection", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * "Start a Group Collection" from the configurator (Pen 132 · rGGwn, T03-05's
 * link): opens the setup with the current design as the source, in the
 * person's workspace. Collections belong to workspaces; anyone without one is
 * told how to get one.
 */
export default async function StartGroupCollectionPage({ searchParams }: { searchParams: Promise<{ configuration?: string }> }) {
  const { configuration } = await searchParams;
  const design = configuration && /^[0-9a-f-]{36}$/.test(configuration) ? configuration : null;
  const next = `/group-collections/start${design ? `?configuration=${design}` : ""}`;
  const mine = await serverApi("/v1/me/organizations", myOrganizationsSchema);
  if (!mine.ok) {
    if (mine.status === 401) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
    throw new Error(mine.error.message);
  }
  const workspaces = mine.data.organizations.filter((organization) => organization.me.permissions.includes("MANAGE_COLLECTIONS"));
  const setup = (organizationId: string) => `/workspace/${organizationId}/groups/new${design ? `?configuration=${design}` : ""}`;
  if (workspaces.length === 1) redirect(setup(workspaces[0]!.id));
  return (
    <AccountShell current="/account/workspace">
      <h1 className={styles.title}>Start a group collection</h1>
      <section className={styles.card} aria-labelledby="group-start-title">
        <h2 id="group-start-title" className={styles.cardTitle}>
          {workspaces.length ? "Choose a workspace" : "Group collections are for business workspaces"}
        </h2>
        {workspaces.length ? (
          <ul className={styles.rows}>
            {workspaces.map((organization) => (
              <li key={organization.id} className={styles.row}>
                <p className={styles.rowTitle}>{organization.name}</p>
                <a className={styles.action} href={setup(organization.id)}>
                  Start here
                  <ArrowRight aria-hidden size={16} />
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.rowTitle}>
            One link lets everyone add their own size and name. Ask for a business workspace, or ask your workspace Owner for “Manage group collections”.{" "}
            <a className={styles.action} href="/account/workspace">
              Ask for a workspace
            </a>
          </p>
        )}
      </section>
    </AccountShell>
  );
}
