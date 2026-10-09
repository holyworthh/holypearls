import { ROLE_LABELS, workspaceOverviewSchema } from "@holypearls/contracts";
import { ButtonLink, ErrorState } from "@holypearls/ui";
import { CreditCard, FileCheck2, FileText } from "lucide-react";
import type { Metadata } from "next";
import { chosenLocation, loadWorkspace } from "../../../components/workspace/load";
import { OrderRows, ProjectRows } from "../../../components/workspace/WorkspaceLists";
import { workspaceHref, WorkspaceShell } from "../../../components/workspace/WorkspaceShell";
import styles from "../../../components/workspace/workspace.module.css";
import { serverApi } from "../../../lib/server-api";

export const metadata: Metadata = { title: "Workspace", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const ICON = { PROOF: FileCheck2, PAYMENT: CreditCard, QUOTE: FileText } as const;

const greeting = () => {
  const hour = Number(new Date().toLocaleString("en-GB", { hour: "numeric", hour12: false, timeZone: "Africa/Lagos" }));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
};

/**
 * The workspace overview (Pen 28 · e851AK desktop, 62 · Rtyrl 390 px;
 * B2B-FR-010): Needs Attention first, then quick actions and active work. No
 * KPI tiles; every number is something a person can act on. Templates and
 * Groups arrive with T11 and T12.
 */
export default async function WorkspaceOverviewPage({ params, searchParams }: { params: Promise<{ organizationId: string }>; searchParams: Promise<{ location?: string }> }) {
  const { organizationId } = await params;
  const { me, organization } = await loadWorkspace(organizationId, `/workspace/${organizationId}`);
  const location = chosenLocation(organization, (await searchParams).location);
  const overview = await serverApi(`/v1/organizations/${organizationId}/overview${location ? `?location=${location}` : ""}`, workspaceOverviewSchema);
  const scope = location ? organization.me.locations.find((entry) => entry.id === location)!.name : organization.me.allLocations ? "All locations" : organization.me.locations.map((entry) => entry.name).join(", ");
  const firstName = me.name.replace(/\(.*?\)/g, "").trim().split(/\s+/)[0] ?? me.name;
  return (
    <WorkspaceShell organization={organization} userName={me.name} section="overview" location={location}>
      <div className={styles.head}>
        <div>
          <p className={styles.eyebrow}>
            {organization.name} · {scope} · {ROLE_LABELS[organization.me.role]}
          </p>
          <h1 className={styles.title}>
            {greeting()}, {firstName}.
          </h1>
        </div>
        {overview.ok && overview.data.canCreate ? (
          <div className={styles.quickActions}>
            <ButtonLink variant="secondary" href="/start">
              Start a Project
            </ButtonLink>
            <ButtonLink variant="ink" href="/products">
              Order products
            </ButtonLink>
          </div>
        ) : null}
      </div>

      {!overview.ok ? (
        <ErrorState
          title="We couldn't load your workspace"
          body="Something went wrong on our side. Try again, or share the request ID with support."
          requestId={overview.error.requestId}
          action={<ButtonLink variant="secondary" href={workspaceHref(organizationId, "", location)}>Try again</ButtonLink>}
        />
      ) : (
        <>
          <section className={styles.panel} aria-labelledby="attention-title">
            <div className={`${styles.panelHead} ${styles.panelHeadAttention}`}>
              <span className={styles.count}>{overview.data.needsAttention.length}</span>
              <h2 id="attention-title" className={styles.panelTitle}>
                Needs your attention
              </h2>
            </div>
            {overview.data.needsAttention.length ? (
              <ul className={styles.rows}>
                {overview.data.needsAttention.map((item) => {
                  const Icon = ICON[item.kind];
                  return (
                    <li key={`${item.kind}-${item.href}-${item.title}`} className={styles.row}>
                      <span className={styles.rowIcon} aria-hidden="true">
                        <Icon />
                      </span>
                      <div className={styles.rowText}>
                        <span className={styles.rowTitle}>{item.title}</span>
                        <span className={styles.rowMeta}>{item.detail}</span>
                      </div>
                      <a className={styles.rowAction} href={item.href}>
                        {item.actionLabel}
                      </a>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className={styles.emptyRow}>Nothing needs you right now. Proofs to approve, payments due and quotes to review appear here.</p>
            )}
          </section>

          <div className={styles.columns}>
            <section className={styles.panel} aria-labelledby="orders-title">
              <div className={styles.panelHead}>
                <h2 id="orders-title" className={styles.panelTitle}>
                  Active orders
                </h2>
                <a className={styles.viewAll} href={workspaceHref(organizationId, "/orders", location)}>
                  View all
                </a>
              </div>
              <OrderRows orders={overview.data.activeOrders} empty="No active orders. Orders placed for this workspace appear here." />
            </section>
            <section className={styles.panel} aria-labelledby="projects-title">
              <div className={styles.panelHead}>
                <h2 id="projects-title" className={styles.panelTitle}>
                  Active projects
                </h2>
                <a className={styles.viewAll} href={workspaceHref(organizationId, "/projects", location)}>
                  View all
                </a>
              </div>
              <ProjectRows projects={overview.data.activeProjects} empty="No active projects. Start a project to get a quote for something bigger." />
            </section>
          </div>
        </>
      )}
    </WorkspaceShell>
  );
}
