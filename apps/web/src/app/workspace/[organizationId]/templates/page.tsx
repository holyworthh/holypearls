import { brandAssetListSchema, templateListSchema, templateSourceListSchema } from "@holypearls/contracts";
import { ButtonLink, ErrorState, StatusChip } from "@holypearls/ui";
import { Stamp } from "lucide-react";
import type { Metadata } from "next";
import { reach, TEMPLATE_STATUS } from "../../../../components/workspace/labels";
import { loadWorkspace } from "../../../../components/workspace/load";
import { NewTemplateButton } from "../../../../components/workspace/TemplateViews";
import { WorkspaceShell } from "../../../../components/workspace/WorkspaceShell";
import styles from "../../../../components/workspace/workspace.module.css";
import { serverApi } from "../../../../lib/server-api";

export const metadata: Metadata = { title: "Templates", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Templates index (Pen 68 · w6wi5): product photo first, status, location scope (B2B-FR-030–032). */
export default async function TemplatesPage({ params, searchParams }: { params: Promise<{ organizationId: string }>; searchParams: Promise<{ archived?: string }> }) {
  const { organizationId } = await params;
  const showArchived = (await searchParams).archived === "1";
  const { me, organization } = await loadWorkspace(organizationId, `/workspace/${organizationId}/templates`);
  const base = `/v1/organizations/${organizationId}`;
  const list = await serverApi(`${base}/templates${showArchived ? "?archived=1" : ""}`, templateListSchema);
  const canManage = list.ok && list.data.canManage;
  const [sources, assets] = canManage ? await Promise.all([serverApi(`${base}/templates/sources`, templateSourceListSchema), serverApi(`${base}/assets`, brandAssetListSchema)]) : [null, null];
  const href = `/workspace/${organizationId}/templates`;
  return (
    <WorkspaceShell organization={organization} userName={me.name} section="templates">
      <div className={styles.head}>
        <h1 className={styles.title}>Templates</h1>
        {canManage && sources?.ok && assets?.ok ? <NewTemplateButton organizationId={organizationId} me={organization.me} sources={sources.data.sources} assets={assets.data.assets} /> : null}
      </div>
      {!list.ok ? (
        <ErrorState title="We couldn't load this list" body="Something went wrong on our side. Try again, or share the request ID with support." requestId={list.error.requestId} action={<ButtonLink variant="secondary" href={href}>Try again</ButtonLink>} />
      ) : (
        <>
          <nav className={styles.filters} aria-label="Template filters">
            <a className={styles.filter} href={showArchived ? href : `${href}?archived=1`} aria-current={showArchived ? "page" : undefined}>
              {showArchived ? "Showing archived" : "Show archived"}
            </a>
          </nav>
          {list.data.templates.length ? (
            <ul className={styles.assetGrid} aria-label="Templates">
              {list.data.templates.map((template) => {
                const status = TEMPLATE_STATUS[template.status];
                return (
                  <li key={template.id}>
                    <a className={styles.assetCard} href={`${href}/${template.id}`}>
                      <span className={styles.assetThumb}>{template.image ? <img src={template.image.thumbnailUrl} alt={template.image.alt} loading="lazy" /> : <Stamp aria-hidden className={styles.navIcon} />}</span>
                      <span className={styles.assetCardBody}>
                        <StatusChip tone={status.tone}>{status.label}</StatusChip>
                        <span className={styles.rowTitle}>{template.name}</span>
                        <span className={styles.rowMeta}>
                          {template.productName} · {reach(template)}
                        </span>
                        {template.assetLabel ? <span className={styles.rowMeta}>{template.assetLabel}</span> : null}
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          ) : (
            <section className={styles.panel} aria-label="Templates">
              <p className={styles.emptyRow}>
                {canManage
                  ? "No templates yet. Turn a past order or a saved design into a template so your team can reorder it with your brand locked in."
                  : "No templates for your locations yet. Your Owner or Admin sets them up."}
              </p>
            </section>
          )}
        </>
      )}
    </WorkspaceShell>
  );
}
