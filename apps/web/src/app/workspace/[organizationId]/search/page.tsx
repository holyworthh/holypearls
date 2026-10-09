import { workspaceSearchSchema } from "@holypearls/contracts";
import { ErrorState } from "@holypearls/ui";
import type { Metadata } from "next";
import { chosenLocation, loadWorkspace } from "../../../../components/workspace/load";
import { OrderRows, ProjectRows } from "../../../../components/workspace/WorkspaceLists";
import { WorkspaceShell } from "../../../../components/workspace/WorkspaceShell";
import styles from "../../../../components/workspace/workspace.module.css";
import { serverApi } from "../../../../lib/server-api";

export const metadata: Metadata = { title: "Search this workspace", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Workspace search (Pen 130 · pjuPc desktop, g8oai 375): only records the person may see, never another location (B2B-FR-013). */
export default async function WorkspaceSearchPage({ params, searchParams }: { params: Promise<{ organizationId: string }>; searchParams: Promise<{ q?: string; location?: string }> }) {
  const { organizationId } = await params;
  const query = await searchParams;
  const { me, organization } = await loadWorkspace(organizationId, `/workspace/${organizationId}/search`);
  const location = chosenLocation(organization, query.location);
  const q = (query.q ?? "").trim().slice(0, 100);
  const results = q.length >= 2 ? await serverApi(`/v1/organizations/${organizationId}/search?q=${encodeURIComponent(q)}${location ? `&location=${location}` : ""}`, workspaceSearchSchema) : null;
  const scope = location ? organization.me.locations.find((entry) => entry.id === location)!.name : organization.me.allLocations ? null : organization.me.locations.map((entry) => entry.name).join(", ");
  const total = results?.ok ? results.data.orders.length + results.data.projects.length : 0;
  return (
    <WorkspaceShell organization={organization} userName={me.name} section="search" location={location}>
      <p className={styles.eyebrow}>Search this workspace</p>
      <h1 className={styles.title}>{q ? `Results for "${q}"` : "Search"}</h1>
      <form className={styles.search} action={`/workspace/${organizationId}/search`} role="search" aria-label="Search this workspace again">
        <label className="hp-visually-hidden" htmlFor="workspace-search-page">
          Search orders and projects
        </label>
        <input id="workspace-search-page" name="q" type="search" defaultValue={q} placeholder="Order number, item or project" />
        {location ? <input type="hidden" name="location" value={location} /> : null}
      </form>
      {scope ? <p className={styles.support}>Showing records for {scope} only — your locations.</p> : null}
      {!q || q.length < 2 ? (
        <p className={styles.support}>Type at least two letters: an order number, an item or a project name.</p>
      ) : !results?.ok ? (
        <ErrorState title="We couldn't search" body="Something went wrong on our side. Try again, or share the request ID with support." requestId={results && !results.ok ? results.error.requestId : null} />
      ) : total === 0 ? (
        <p className={styles.support}>No results for &ldquo;{q}&rdquo; in your locations. Check the spelling or try an order number.</p>
      ) : (
        <>
          <section className={styles.panel} aria-labelledby="search-orders">
            <div className={styles.panelHead}>
              <h2 id="search-orders" className={styles.panelTitle}>
                Orders ({results.data.orders.length})
              </h2>
            </div>
            <OrderRows orders={results.data.orders} empty="No matching orders." />
          </section>
          <section className={styles.panel} aria-labelledby="search-projects">
            <div className={styles.panelHead}>
              <h2 id="search-projects" className={styles.panelTitle}>
                Projects ({results.data.projects.length})
              </h2>
            </div>
            <ProjectRows projects={results.data.projects} empty="No matching projects." />
          </section>
        </>
      )}
    </WorkspaceShell>
  );
}
