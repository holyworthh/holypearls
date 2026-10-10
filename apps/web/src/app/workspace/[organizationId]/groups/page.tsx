import { collectionListSchema } from "@holypearls/contracts";
import { ButtonLink, ErrorState, StatusChip } from "@holypearls/ui";
import type { Metadata } from "next";
import { COLLECTION_STATUS } from "../../../../components/workspace/labels";
import { loadWorkspace } from "../../../../components/workspace/load";
import { WorkspaceShell } from "../../../../components/workspace/WorkspaceShell";
import styles from "../../../../components/workspace/workspace.module.css";
import { serverApi } from "../../../../lib/server-api";

export const metadata: Metadata = { title: "Groups", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" });

/** Group collections (T12-01; PRD-05 B2B-FR-050): one link collects everyone's size and details. */
export default async function GroupsPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const { me, organization } = await loadWorkspace(organizationId, `/workspace/${organizationId}/groups`);
  const list = await serverApi(`/v1/organizations/${organizationId}/collections`, collectionListSchema);
  return (
    <WorkspaceShell organization={organization} userName={me.name} section="groups">
      <div className={styles.head}>
        <h1 className={styles.title}>Groups</h1>
        {list.ok && list.data.canManage ? <ButtonLink href={`/workspace/${organizationId}/groups/new`}>New group collection</ButtonLink> : null}
      </div>
      {!list.ok ? (
        <ErrorState title="We couldn't load this list" body="Something went wrong on our side. Try again, or share the request ID with support." requestId={list.error.requestId} action={<ButtonLink variant="secondary" href={`/workspace/${organizationId}/groups`}>Try again</ButtonLink>} />
      ) : (
        <section className={styles.panel} aria-label="Group collections">
          {list.data.collections.length ? (
            <ul className={styles.rows}>
              {list.data.collections.map((collection) => {
                const status = COLLECTION_STATUS[collection.status];
                return (
                  <li key={collection.id} className={styles.row}>
                    <div className={styles.rowText}>
                      <a className={styles.rowLink} href={`/workspace/${organizationId}/groups/${collection.id}`}>
                        {collection.title}
                      </a>
                      <span className={styles.rowMeta}>
                        {collection.productName} · {collection.locationName}
                        {collection.deadline ? ` · closes ${day(collection.deadline)}` : ""}
                      </span>
                    </div>
                    <StatusChip tone={status.tone}>{status.label}</StatusChip>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className={styles.emptyRow}>No group collections yet. Start one to collect everyone&apos;s size and name with one link, no accounts needed.</p>
          )}
        </section>
      )}
    </WorkspaceShell>
  );
}
