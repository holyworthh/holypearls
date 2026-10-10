import type { Metadata } from "next";
import { loadWorkspace } from "../../../../components/workspace/load";
import { WorkspaceShell } from "../../../../components/workspace/WorkspaceShell";
import styles from "../../../../components/workspace/workspace.module.css";

export const metadata: Metadata = { title: "More", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** "More" on the 390 px bottom tabs (Pen 62: "everything else lives under More"). */
export default async function WorkspaceMorePage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const { me, organization } = await loadWorkspace(organizationId, `/workspace/${organizationId}/more`);
  const can = (permission: string) => organization.me.permissions.includes(permission as never);
  const links = [
    ["Approvals", "/approvals"],
    ["Templates", "/templates"],
    ["Groups", "/groups"],
    ["Brand assets", "/assets"],
    ...(can("MANAGE_TEAM") ? [["Team", "/team"]] : []),
    ["Locations", "/locations"],
    ["Approval rule", "/approval-rule"],
    ...(can("VIEW_BILLING") ? [["Billing", "/billing"]] : []),
    ["Search this workspace", "/search"],
  ];
  return (
    <WorkspaceShell organization={organization} userName={me.name} section="settings">
      <h1 className={styles.title}>More</h1>
      <section className={styles.panel} aria-label="More">
        <ul className={styles.rows}>
          {links.map(([label, path]) => (
            <li key={path} className={styles.row}>
              <a className={styles.rowLink} href={`/workspace/${organizationId}${path}`}>
                {label}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </WorkspaceShell>
  );
}
