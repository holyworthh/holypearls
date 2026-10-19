import { collectionListSchema, storeSchema, templateListSchema } from "@holypearls/contracts";
import { ButtonLink, ErrorState } from "@holypearls/ui";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadWorkspace } from "../../../../../../components/workspace/load";
import { StoreSetup } from "../../../../../../components/workspace/StoreViews";
import { WorkspaceShell } from "../../../../../../components/workspace/WorkspaceShell";
import styles from "../../../../../../components/workspace/workspace.module.css";
import { serverApi } from "../../../../../../lib/server-api";

export const metadata: Metadata = { title: "Store setup", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Set up a company store (B2B-FR-080–082): people who manage stores only. */
export default async function StoreSetupPage({ params }: { params: Promise<{ organizationId: string; storeId: string }> }) {
  const { organizationId, storeId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(storeId)) notFound();
  const path = `/workspace/${organizationId}/stores/${storeId}`;
  const { me, organization } = await loadWorkspace(organizationId, `${path}/setup`);
  const [store, templates, collections] = await Promise.all([
    serverApi(`/v1/organizations/${organizationId}/stores/${storeId}`, storeSchema),
    serverApi(`/v1/organizations/${organizationId}/templates`, templateListSchema),
    serverApi(`/v1/organizations/${organizationId}/collections`, collectionListSchema),
  ]);
  if ((!store.ok && store.status === 404) || (store.ok && !store.data.canManage)) notFound();
  return (
    <WorkspaceShell organization={organization} userName={me.name} section="stores">
      <a className={styles.viewAll} href={`/workspace/${organizationId}/stores`}>
        ← Company Store
      </a>
      <h1 className={styles.title}>{store.ok ? store.data.name : "Store setup"}</h1>
      {!store.ok || !templates.ok || !collections.ok ? (
        <ErrorState
          title="We couldn't load this store"
          body="Something went wrong on our side. Try again, or share the request ID with support."
          requestId={!store.ok ? store.error.requestId : !templates.ok ? templates.error.requestId : !collections.ok ? collections.error.requestId : undefined}
          action={<ButtonLink variant="secondary" href={`${path}/setup`}>Try again</ButtonLink>}
        />
      ) : (
        <StoreSetup organizationId={organizationId} initial={store.data} templates={templates.data.templates} collections={collections.data.collections} />
      )}
    </WorkspaceShell>
  );
}
