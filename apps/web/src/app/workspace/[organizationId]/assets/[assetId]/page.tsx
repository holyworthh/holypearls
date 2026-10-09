import { brandAssetSchema } from "@holypearls/contracts";
import { ButtonLink, ErrorState } from "@holypearls/ui";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AssetDetail } from "../../../../../components/workspace/AssetViews";
import { loadWorkspace } from "../../../../../components/workspace/load";
import { WorkspaceShell } from "../../../../../components/workspace/WorkspaceShell";
import styles from "../../../../../components/workspace/workspace.module.css";
import { serverApi } from "../../../../../lib/server-api";

export const metadata: Metadata = { title: "Brand asset", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Asset detail (Pen 66 · sgg2F): the current version, its history, replace, retire and archive. */
export default async function BrandAssetPage({ params }: { params: Promise<{ organizationId: string; assetId: string }> }) {
  const { organizationId, assetId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(assetId)) notFound();
  const { me, organization } = await loadWorkspace(organizationId, `/workspace/${organizationId}/assets/${assetId}`);
  const asset = await serverApi(`/v1/organizations/${organizationId}/assets/${assetId}`, brandAssetSchema);
  if (!asset.ok && asset.status === 404) notFound();
  return (
    <WorkspaceShell organization={organization} userName={me.name} section="assets">
      <a className={styles.viewAll} href={`/workspace/${organizationId}/assets`}>
        ← Brand assets
      </a>
      {asset.ok ? (
        <AssetDetail organizationId={organizationId} initial={asset.data} />
      ) : (
        <ErrorState title="We couldn't load this asset" body="Something went wrong on our side. Try again, or share the request ID with support." requestId={asset.error.requestId} action={<ButtonLink variant="secondary" href={`/workspace/${organizationId}/assets/${assetId}`}>Try again</ButtonLink>} />
      )}
    </WorkspaceShell>
  );
}
