import { collectionSchema, importBatchListSchema, importBatchSchema } from "@holypearls/contracts";
import { ButtonLink, ErrorState } from "@holypearls/ui";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ImportView } from "../../../../../../components/workspace/ImportView";
import { loadWorkspace } from "../../../../../../components/workspace/load";
import { WorkspaceShell } from "../../../../../../components/workspace/WorkspaceShell";
import styles from "../../../../../../components/workspace/workspace.module.css";
import { serverApi } from "../../../../../../lib/server-api";

export const metadata: Metadata = { title: "Import people", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Import people from a spreadsheet (Pen 75 · mEw4a; T12-03c): the latest import still in progress, or a new upload. */
export default async function ImportPage({ params, searchParams }: { params: Promise<{ organizationId: string; collectionId: string }>; searchParams: Promise<{ batch?: string; new?: string }> }) {
  const { organizationId, collectionId } = await params;
  const query = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(collectionId)) notFound();
  const path = `/workspace/${organizationId}/groups/${collectionId}`;
  const { me, organization } = await loadWorkspace(organizationId, `${path}/import`);
  const [collection, batches] = await Promise.all([serverApi(`/v1/organizations/${organizationId}/collections/${collectionId}`, collectionSchema), serverApi(`/v1/organizations/${organizationId}/collections/${collectionId}/imports`, importBatchListSchema)]);
  if (!collection.ok && collection.status === 404) notFound();
  const open = query.new ? null : (query.batch ?? (batches.ok ? batches.data.batches.find((batch) => batch.status === "CHECKED" || (batch.status === "IMPORTED" && batch.imported < batch.rows))?.id : undefined));
  const batch = open && /^[0-9a-f-]{36}$/.test(open) ? await serverApi(`/v1/organizations/${organizationId}/collections/${collectionId}/imports/${open}`, importBatchSchema) : null;
  return (
    <WorkspaceShell organization={organization} userName={me.name} section="groups">
      <a className={styles.viewAll} href={path}>
        ← {collection.ok ? collection.data.title : "Group collection"}
      </a>
      <h1 className={styles.title}>Import people from a spreadsheet</h1>
      {!collection.ok ? (
        <ErrorState title="We couldn't load this collection" body="Something went wrong on our side. Try again, or share the request ID with support." requestId={collection.error.requestId} action={<ButtonLink variant="secondary" href={`${path}/import`}>Try again</ButtonLink>} />
      ) : (
        <ImportView organizationId={organizationId} collectionId={collectionId} initial={batch?.ok ? batch.data : null} />
      )}
    </WorkspaceShell>
  );
}
