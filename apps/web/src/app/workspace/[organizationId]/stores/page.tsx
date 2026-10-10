import { storeListSchema } from "@holypearls/contracts";
import { ButtonLink, ErrorState, StatusChip } from "@holypearls/ui";
import type { Metadata } from "next";
import { STORE_STATUS } from "../../../../components/workspace/labels";
import { loadWorkspace } from "../../../../components/workspace/load";
import { NewStoreForm } from "../../../../components/workspace/StoreViews";
import { WorkspaceShell } from "../../../../components/workspace/WorkspaceShell";
import styles from "../../../../components/workspace/workspace.module.css";
import { serverApi } from "../../../../lib/server-api";

export const metadata: Metadata = { title: "Company Store", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Company stores (T12-06; PRD-05 B2B-FR-080): private shops of the organization's approved products. */
export default async function StoresPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const { me, organization } = await loadWorkspace(organizationId, `/workspace/${organizationId}/stores`);
  const list = await serverApi(`/v1/organizations/${organizationId}/stores`, storeListSchema);
  return (
    <WorkspaceShell organization={organization} userName={me.name} section="stores">
      <h1 className={styles.title}>Company Store</h1>
      {!list.ok ? (
        <ErrorState title="We couldn't load this list" body="Something went wrong on our side. Try again, or share the request ID with support." requestId={list.error.requestId} action={<ButtonLink variant="secondary" href={`/workspace/${organizationId}/stores`}>Try again</ButtonLink>} />
      ) : (
        <>
          <section className={styles.panel} aria-label="Company stores">
            {list.data.stores.length ? (
              <ul className={styles.rows}>
                {list.data.stores.map((store) => {
                  const status = STORE_STATUS[store.status];
                  return (
                    <li key={store.id} className={styles.row}>
                      <div className={styles.rowText}>
                        <a className={styles.rowLink} href={`/workspace/${organizationId}/stores/${store.id}${store.status === "DRAFT" ? "/setup" : ""}`}>
                          {store.name}
                        </a>
                        <span className={styles.rowMeta}>
                          {store.mode === "PROCUREMENT" ? "Buyers order for their locations" : "Each employee orders for themselves"} · {store.itemCount} {store.itemCount === 1 ? "item" : "items"}
                        </span>
                      </div>
                      <StatusChip tone={status.tone}>{status.label}</StatusChip>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className={styles.emptyRow}>No company stores yet. {list.data.canManage ? "Start one to offer your approved products to your people." : "Your Admin can set one up."}</p>
            )}
          </section>
          {list.data.canManage ? <NewStoreForm organizationId={organizationId} /> : null}
        </>
      )}
    </WorkspaceShell>
  );
}
