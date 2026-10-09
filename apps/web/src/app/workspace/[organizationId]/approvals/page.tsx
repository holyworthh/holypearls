import { orderRequestListSchema } from "@holypearls/contracts";
import { ButtonLink, ErrorState, StatusChip } from "@holypearls/ui";
import { naira } from "@holypearls/web-kit/money";
import type { Metadata } from "next";
import { ORDER_REQUEST_STATUS } from "../../../../components/workspace/labels";
import { loadWorkspace } from "../../../../components/workspace/load";
import { WorkspaceShell } from "../../../../components/workspace/WorkspaceShell";
import styles from "../../../../components/workspace/workspace.module.css";
import { serverApi } from "../../../../lib/server-api";

export const metadata: Metadata = { title: "Approvals", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Lagos" });

/** Approvals (T11-04; Pen 72–73): requests waiting for this person first, then the rest they can see. */
export default async function ApprovalsPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const { me, organization } = await loadWorkspace(organizationId, `/workspace/${organizationId}/approvals`);
  const list = await serverApi(`/v1/organizations/${organizationId}/order-requests`, orderRequestListSchema);
  const waiting = list.ok ? list.data.requests.filter((request) => request.needsMyDecision) : [];
  const rest = list.ok ? list.data.requests.filter((request) => !request.needsMyDecision) : [];
  const rows = (requests: typeof rest) => (
    <ul className={styles.rows}>
      {requests.map((request) => {
        const status = ORDER_REQUEST_STATUS[request.status];
        return (
          <li key={request.id} className={styles.row}>
            <div className={styles.rowText}>
              <a className={styles.rowLink} href={`/workspace/${organizationId}/approvals/${request.id}`}>
                {request.title}
              </a>
              <span className={styles.rowMeta}>
                {request.requestedBy} · {request.locationName} · {day(request.createdAt)}
                {request.estimatedTotalMinor ? ` · ${naira(request.estimatedTotalMinor, request.currency)}` : ""}
              </span>
            </div>
            <StatusChip tone={status.tone}>{status.label}</StatusChip>
          </li>
        );
      })}
    </ul>
  );
  return (
    <WorkspaceShell organization={organization} userName={me.name} section="approvals">
      <h1 className={styles.title}>Approvals</h1>
      {!list.ok ? (
        <ErrorState title="We couldn't load this list" body="Something went wrong on our side. Try again, or share the request ID with support." requestId={list.error.requestId} action={<ButtonLink variant="secondary" href={`/workspace/${organizationId}/approvals`}>Try again</ButtonLink>} />
      ) : (
        <>
          {list.data.canApprove ? (
            <section className={styles.panel} aria-labelledby="waiting-title">
              <div className={styles.panelHead}>
                <h2 id="waiting-title" className={styles.panelTitle}>
                  Awaiting your approval
                </h2>
              </div>
              {waiting.length ? rows(waiting) : <p className={styles.emptyRow}>Nothing is waiting for you.</p>}
            </section>
          ) : null}
          <section className={styles.panel} aria-labelledby="requests-title">
            <div className={styles.panelHead}>
              <h2 id="requests-title" className={styles.panelTitle}>
                {list.data.canApprove ? "Other requests" : "Your requests"}
              </h2>
            </div>
            {rest.length ? rows(rest) : <p className={styles.emptyRow}>No order requests yet. Orders over your workspace&apos;s approval rule wait here for an approver.</p>}
          </section>
        </>
      )}
    </WorkspaceShell>
  );
}
