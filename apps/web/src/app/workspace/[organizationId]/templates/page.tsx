import { brandAssetListSchema, templateListSchema, templateSourceListSchema } from "@holypearls/contracts";
import { ButtonLink, ErrorState } from "@holypearls/ui";
import type { Metadata } from "next";
import { TemplateCards } from "../../../../components/workspace/WorkspaceLists";
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
  const [sources, assets] = canManage
    ? await Promise.all([serverApi(`${base}/templates/sources`, templateSourceListSchema), serverApi(`${base}/assets`, brandAssetListSchema)])
    : [null, null];
  const href = `/workspace/${organizationId}/templates`;
  return (
    <WorkspaceShell organization={organization} userName={me.name} section="templates">
      <div className={styles.head}>
        <h1 className={styles.title}>Templates</h1>
        {canManage && sources?.ok && assets?.ok ? (
          <NewTemplateButton organizationId={organizationId} me={organization.me} sources={sources.data.sources} assets={assets.data.assets} />
        ) : null}
      </div>
      {!list.ok ? (
        <ErrorState
          title="We couldn't load this list"
          body="Something went wrong on our side. Try again, or share the request ID with support."
          requestId={list.error.requestId}
          action={
            <ButtonLink variant="secondary" href={href}>
              Try again
            </ButtonLink>
          }
        />
      ) : (
        <>
          <nav className={styles.filters} aria-label="Template filters">
            <a className={styles.filter} href={showArchived ? href : `${href}?archived=1`} aria-current={showArchived ? "page" : undefined}>
              {showArchived ? "Showing archived" : "Show archived"}
            </a>
          </nav>
          {list.data.templates.length ? (
            <TemplateCards templates={list.data.templates} organizationId={organizationId} />
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
