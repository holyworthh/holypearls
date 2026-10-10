import { collectionSchema, locationListSchema } from "@holypearls/contracts";
import { ButtonLink, ErrorState } from "@holypearls/ui";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CollectionSetup } from "../../../../../components/workspace/GroupViews";
import { loadWorkspace } from "../../../../../components/workspace/load";
import { WorkspaceShell } from "../../../../../components/workspace/WorkspaceShell";
import styles from "../../../../../components/workspace/workspace.module.css";
import { serverApi } from "../../../../../lib/server-api";

export const metadata: Metadata = { title: "Group collection", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Group collection setup (Pen 132 · a0VCfj desktop, BHzbM 375; states rGGwn). */
export default async function CollectionPage({ params }: { params: Promise<{ organizationId: string; collectionId: string }> }) {
  const { organizationId, collectionId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(collectionId)) notFound();
  const { me, organization } = await loadWorkspace(organizationId, `/workspace/${organizationId}/groups/${collectionId}`);
  const [result, locations] = await Promise.all([
    serverApi(`/v1/organizations/${organizationId}/collections/${collectionId}`, collectionSchema),
    serverApi(`/v1/organizations/${organizationId}/locations`, locationListSchema),
  ]);
  if (!result.ok && result.status === 404) notFound();
  return (
    <WorkspaceShell organization={organization} userName={me.name} section="groups">
      <a className={styles.viewAll} href={`/workspace/${organizationId}/groups`}>
        ← Groups
      </a>
      {result.ok ? (
        <>
          <p className={styles.eyebrow}>{result.data.status === "DRAFT" ? "New group collection · step 2 of 2" : `Group collection · ${result.data.locationName}`}</p>
          <h1 className={styles.title}>{result.data.status === "DRAFT" ? `Set up “${result.data.title}”` : result.data.title}</h1>
          <CollectionSetup organizationId={organizationId} initial={result.data} locations={locations.ok ? locations.data.locations.map(({ id, name }) => ({ id, name })) : []} />
        </>
      ) : (
        <ErrorState title="We couldn't load this collection" body="Something went wrong on our side. Try again, or share the request ID with support." requestId={result.error.requestId} action={<ButtonLink variant="secondary" href={`/workspace/${organizationId}/groups/${collectionId}`}>Try again</ButtonLink>} />
      )}
    </WorkspaceShell>
  );
}
