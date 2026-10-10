import { accountHistorySchema, templateListSchema } from "@holypearls/contracts";
import { PageState } from "@holypearls/ui";
import type { Metadata } from "next";
import { NewCollectionForm } from "../../../../../components/workspace/GroupViews";
import { loadWorkspace } from "../../../../../components/workspace/load";
import { WorkspaceShell } from "../../../../../components/workspace/WorkspaceShell";
import styles from "../../../../../components/workspace/workspace.module.css";
import { serverApi } from "../../../../../lib/server-api";

export const metadata: Metadata = { title: "New group collection", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** New group collection, step 1 (Pen 132): from an approved template or the person's saved design (B2B-FR-051). */
export default async function NewCollectionPage({ params, searchParams }: { params: Promise<{ organizationId: string }>; searchParams: Promise<{ template?: string; configuration?: string }> }) {
  const { organizationId } = await params;
  const query = await searchParams;
  const { me, organization } = await loadWorkspace(organizationId, `/workspace/${organizationId}/groups/new`);
  const allowed = organization.me.permissions.includes("MANAGE_COLLECTIONS");
  const [templates, history] = allowed ? await Promise.all([serverApi(`/v1/organizations/${organizationId}/templates`, templateListSchema), serverApi("/v1/me/history", accountHistorySchema)]) : [null, null];
  const sources = [
    ...(templates?.ok ? templates.data.templates.filter((template) => template.status === "APPROVED").map((template) => ({ kind: "TEMPLATE" as const, id: template.id, label: `${template.name} · ${template.productName}` })) : []),
    ...(history?.ok ? history.data.drafts.filter((draft) => draft.kind === "CONFIGURATION").map((draft) => ({ kind: "CONFIGURATION" as const, id: draft.id, label: draft.title })) : []),
  ];
  const wanted = query.template ? `TEMPLATE:${query.template}` : query.configuration ? `CONFIGURATION:${query.configuration}` : null;
  if (query.configuration && !sources.some((source) => source.id === query.configuration)) sources.unshift({ kind: "CONFIGURATION", id: query.configuration, label: "The design you were working on" });
  return (
    <WorkspaceShell organization={organization} userName={me.name} section="groups">
      <a className={styles.viewAll} href={`/workspace/${organizationId}/groups`}>
        ← Groups
      </a>
      <p className={styles.eyebrow}>New group collection · step 1 of 2</p>
      <h1 className={styles.title}>New group collection</h1>
      {allowed ? (
        <NewCollectionForm organizationId={organizationId} me={organization.me} sources={sources} initialSource={wanted && sources.some((source) => `${source.kind}:${source.id}` === wanted) ? wanted : null} />
      ) : (
        <PageState eyebrow="403 · MANAGE GROUP COLLECTIONS" title="You can't start group collections" body="Ask your workspace Owner or Admin to give you “Manage group collections”." />
      )}
    </WorkspaceShell>
  );
}
