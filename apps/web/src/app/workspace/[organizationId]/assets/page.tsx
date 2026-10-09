import { BRAND_ASSET_KIND_LABELS, BRAND_ASSET_KINDS, brandAssetListSchema } from "@holypearls/contracts";
import { ButtonLink, ErrorState, StatusChip } from "@holypearls/ui";
import type { Metadata } from "next";
import { AssetThumb, UploadAssetButton } from "../../../../components/workspace/AssetViews";
import { VERSION_STATUS } from "../../../../components/workspace/labels";
import { loadWorkspace } from "../../../../components/workspace/load";
import { WorkspaceShell } from "../../../../components/workspace/WorkspaceShell";
import styles from "../../../../components/workspace/workspace.module.css";
import { serverApi } from "../../../../lib/server-api";

export const metadata: Metadata = { title: "Brand assets", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Brand Assets (Pen 65 · bZMif): every member sees them; Owners and Admins upload and replace (B2B-FR-020–023). */
export default async function BrandAssetsPage({ params, searchParams }: { params: Promise<{ organizationId: string }>; searchParams: Promise<{ kind?: string; archived?: string }> }) {
  const { organizationId } = await params;
  const query = await searchParams;
  const { me, organization } = await loadWorkspace(organizationId, `/workspace/${organizationId}/assets`);
  const list = await serverApi(`/v1/organizations/${organizationId}/assets`, brandAssetListSchema);
  const kind = BRAND_ASSET_KINDS.find((value) => value === query.kind) ?? null;
  const showArchived = query.archived === "1";
  const href = (next: { kind?: string | null; archived?: boolean }) => {
    const params = new URLSearchParams();
    const chosenKind = next.kind === undefined ? kind : next.kind;
    if (chosenKind) params.set("kind", chosenKind);
    if (next.archived ?? showArchived) params.set("archived", "1");
    const text = params.toString();
    return `/workspace/${organizationId}/assets${text ? `?${text}` : ""}`;
  };
  return (
    <WorkspaceShell organization={organization} userName={me.name} section="assets">
      <div className={styles.head}>
        <h1 className={styles.title}>Brand assets</h1>
        {list.ok && list.data.canManage ? <UploadAssetButton organizationId={organizationId} /> : null}
      </div>
      {!list.ok ? (
        <ErrorState title="We couldn't load this list" body="Something went wrong on our side. Try again, or share the request ID with support." requestId={list.error.requestId} action={<ButtonLink variant="secondary" href={href({})}>Try again</ButtonLink>} />
      ) : (
        <>
          <nav className={styles.filters} aria-label="Asset filters">
            <a className={styles.filter} href={href({ kind: null })} aria-current={kind === null ? "page" : undefined}>
              All
            </a>
            {BRAND_ASSET_KINDS.map((value) => (
              <a key={value} className={styles.filter} href={href({ kind: value })} aria-current={kind === value ? "page" : undefined}>
                {BRAND_ASSET_KIND_LABELS[value]}
              </a>
            ))}
            <a className={styles.filter} href={href({ archived: !showArchived })} aria-current={showArchived ? "page" : undefined}>
              {showArchived ? "Showing archived" : "Show archived"}
            </a>
          </nav>
          {(() => {
            const assets = list.data.assets.filter((asset) => (!kind || asset.kind === kind) && (showArchived || asset.latest.status !== "ARCHIVED"));
            if (!assets.length) {
              return (
                <section className={styles.panel} aria-label="Brand assets">
                  <p className={styles.emptyRow}>{list.data.assets.length ? "No assets match these filters." : "No brand assets yet. Upload your logo so HolyPearls can check it for print and embroidery."}</p>
                </section>
              );
            }
            return (
              <ul className={styles.assetGrid} aria-label="Brand assets">
                {assets.map((asset) => {
                  const shown = asset.current ?? asset.latest;
                  const status = VERSION_STATUS[shown.status];
                  return (
                    <li key={asset.id}>
                      <a className={styles.assetCard} href={`/workspace/${organizationId}/assets/${asset.id}`}>
                        <AssetThumb version={shown} name={asset.name} />
                        <span className={styles.assetCardBody}>
                          <StatusChip tone={status.tone}>{status.label}</StatusChip>
                          <span className={styles.rowTitle}>{asset.name}</span>
                          <span className={styles.rowMeta}>
                            V{shown.number} · {BRAND_ASSET_KIND_LABELS[asset.kind]}
                            {asset.latest.number !== shown.number ? ` · V${asset.latest.number} ${VERSION_STATUS[asset.latest.status].label.toLowerCase()}` : ""}
                          </span>
                        </span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            );
          })()}
        </>
      )}
    </WorkspaceShell>
  );
}
