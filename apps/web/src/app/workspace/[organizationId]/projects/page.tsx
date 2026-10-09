import { workspaceProjectListSchema } from "@holypearls/contracts";
import { ButtonLink, ErrorState } from "@holypearls/ui";
import type { Metadata } from "next";
import { chosenLocation, loadWorkspace } from "../../../../components/workspace/load";
import { GROUP_LABEL, PROJECT_GROUPS, ProjectRows } from "../../../../components/workspace/WorkspaceLists";
import { workspaceHref, WorkspaceShell } from "../../../../components/workspace/WorkspaceShell";
import styles from "../../../../components/workspace/workspace.module.css";
import { serverApi } from "../../../../lib/server-api";

export const metadata: Metadata = { title: "Projects", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Projects (Pen 64 · cNcKd): grouped by status with Quote ready first; one list on a phone. */
export default async function WorkspaceProjectsPage({ params, searchParams }: { params: Promise<{ organizationId: string }>; searchParams: Promise<{ location?: string }> }) {
  const { organizationId } = await params;
  const { me, organization } = await loadWorkspace(organizationId, `/workspace/${organizationId}/projects`);
  const location = chosenLocation(organization, (await searchParams).location);
  const list = await serverApi(`/v1/organizations/${organizationId}/projects${location ? `?location=${location}` : ""}`, workspaceProjectListSchema);
  return (
    <WorkspaceShell organization={organization} userName={me.name} section="projects" location={location}>
      <div className={styles.head}>
        <h1 className={styles.title}>Projects</h1>
        {organization.me.permissions.includes("CREATE_REQUESTS") ? <ButtonLink href="/start">Start a project</ButtonLink> : null}
      </div>
      {!list.ok ? (
        <ErrorState title="We couldn't load this list" body="Something went wrong on our side. Try again, or share the request ID with support." requestId={list.error.requestId} action={<ButtonLink variant="secondary" href={workspaceHref(organizationId, "/projects", location)}>Try again</ButtonLink>} />
      ) : list.data.projects.length === 0 ? (
        <section className={styles.panel} aria-label="Projects">
          <p className={styles.emptyRow}>No projects yet. Start a project and choose this workspace before you send it.</p>
        </section>
      ) : (
        PROJECT_GROUPS.map((group) => {
          const rows = list.data.projects.filter((project) => project.group === group);
          if (!rows.length) return null;
          return (
            <section key={group} className={styles.panel} aria-labelledby={`group-${group}`}>
              <div className={styles.panelHead}>
                <h2 id={`group-${group}`} className={styles.groupTitle}>
                  {GROUP_LABEL[group]} <span className={styles.count}>{rows.length}</span>
                </h2>
              </div>
              <ProjectRows projects={rows} empty="" />
            </section>
          );
        })
      )}
    </WorkspaceShell>
  );
}
