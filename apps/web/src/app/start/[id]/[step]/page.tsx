import { myOrganizationsSchema, PROJECT_STEPS, projectSchema } from "@holypearls/contracts";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Builder } from "../../../../components/projects/Builder";
import { placeableWorkspaces } from "../../../../components/workspace/PlacedForPicker";
import { SiteShell } from "../../../../components/site/SiteShell";
import { hasSessionCookie, serverApi } from "../../../../lib/server-api";

export const metadata: Metadata = { title: "Your project", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * One step of the project builder (T05-01, Pen 24 · LqHMw). Drafts are
 * private and never indexed (Stage 3.1D §31). Not yours: 404.
 */
export default async function ProjectStepPage({ params }: { params: Promise<{ id: string; step: string }> }) {
  const { id, step } = await params;
  const meta = PROJECT_STEPS.find((item) => item.slug === step);
  if (!meta || !/^[0-9a-f-]{36}$/.test(id)) notFound();
  const project = await serverApi(`/v1/projects/${id}`, projectSchema);
  if (!project.ok) notFound();
  // Sent projects can't change here; their link shows the confirmation.
  if (project.data.status !== "DRAFT") redirect(`/start/${id}`);
  const signedIn = await hasSessionCookie();
  // Workspace members can place the project for one of their locations (T10-03).
  const mine = signedIn && meta.key === "REVIEW" ? await serverApi("/v1/me/organizations", myOrganizationsSchema) : null;
  return (
    <SiteShell footer={false}>
      <Builder key={`${meta.key}-${project.data.version}`} initial={project.data} step={meta.key} signedIn={signedIn} workspaces={mine?.ok ? placeableWorkspaces(mine.data.organizations) : []} />
    </SiteShell>
  );
}
