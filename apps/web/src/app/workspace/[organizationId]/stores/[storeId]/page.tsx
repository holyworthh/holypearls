import { storeSchema } from "@holypearls/contracts";
import { ButtonLink, ErrorState } from "@holypearls/ui";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadWorkspace } from "../../../../../components/workspace/load";
import { StoreView } from "../../../../../components/workspace/StoreViews";
import { WorkspaceShell } from "../../../../../components/workspace/WorkspaceShell";
import styles from "../../../../../components/workspace/workspace.module.css";
import { serverApi } from "../../../../../lib/server-api";

export const metadata: Metadata = { title: "Company Store", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** A company store (Pen 77 procurement; Pen 32 and 78 self-order). */
export default async function StorePage({ params }: { params: Promise<{ organizationId: string; storeId: string }> }) {
  const { organizationId, storeId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(storeId)) notFound();
  const path = `/workspace/${organizationId}/stores/${storeId}`;
  const { me, organization } = await loadWorkspace(organizationId, path);
  const store = await serverApi(`/v1/organizations/${organizationId}/stores/${storeId}`, storeSchema);
  if (!store.ok && store.status === 404) notFound();
  return (
    <WorkspaceShell organization={organization} userName={me.name} section="stores">
      <div className={styles.head}>
        <a className={styles.viewAll} href={`/workspace/${organizationId}/stores`}>
          ← Company Store
        </a>
        {store.ok && store.data.canManage ? (
          <ButtonLink variant="secondary" href={`${path}/setup`}>
            Set up this store
          </ButtonLink>
        ) : null}
      </div>
      {!store.ok ? (
        <>
          <h1 className={styles.title}>Company Store</h1>
          <ErrorState title="We couldn't load this store" body="Something went wrong on our side. Try again, or share the request ID with support." requestId={store.error.requestId} action={<ButtonLink variant="secondary" href={path}>Try again</ButtonLink>} />
        </>
      ) : (
        <StoreView organizationId={organizationId} store={store.data} />
      )}
    </WorkspaceShell>
  );
}
