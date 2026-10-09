import { orderRequestSchema } from "@holypearls/contracts";
import { ButtonLink, ErrorState, StatusChip } from "@holypearls/ui";
import { naira } from "@holypearls/web-kit/money";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ApprovalDecision } from "../../../../../components/workspace/ApprovalViews";
import { ORDER_REQUEST_STATUS } from "../../../../../components/workspace/labels";
import { loadWorkspace } from "../../../../../components/workspace/load";
import { WorkspaceShell } from "../../../../../components/workspace/WorkspaceShell";
import styles from "../../../../../components/workspace/workspace.module.css";
import { serverApi } from "../../../../../lib/server-api";

export const metadata: Metadata = { title: "Approval request", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Lagos" });

/** Approval Review (Pen 72 · hirBW desktop; 73 · mZWyB mobile): who, where and how much, what's being ordered, history, and the decision. */
export default async function ApprovalRequestPage({ params }: { params: Promise<{ organizationId: string; requestId: string }> }) {
  const { organizationId, requestId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(requestId)) notFound();
  const { me, organization } = await loadWorkspace(organizationId, `/workspace/${organizationId}/approvals/${requestId}`);
  const result = await serverApi(`/v1/organizations/${organizationId}/order-requests/${requestId}`, orderRequestSchema);
  if (!result.ok && result.status === 404) notFound();
  return (
    <WorkspaceShell organization={organization} userName={me.name} section="approvals">
      <a className={styles.viewAll} href={`/workspace/${organizationId}/approvals`}>
        ← Approvals
      </a>
      {!result.ok ? (
        <ErrorState title="We couldn't load this request" body="Something went wrong on our side. Try again, or share the request ID with support." requestId={result.error.requestId} action={<ButtonLink variant="secondary" href={`/workspace/${organizationId}/approvals/${requestId}`}>Try again</ButtonLink>} />
      ) : (
        (() => {
          const request = result.data;
          const status = request.needsMyDecision ? { label: "AWAITING YOUR APPROVAL", tone: "warning" as const } : ORDER_REQUEST_STATUS[request.status];
          return (
            <div className={styles.orderLayout}>
              <div className={styles.templateSpec}>
                <section className={styles.detail} aria-labelledby="request-title">
                  <StatusChip tone={status.tone}>{status.label}</StatusChip>
                  <h1 id="request-title" className={styles.title}>
                    {request.title}
                  </h1>
                  <dl className={styles.requestMeta}>
                    <div>
                      <dt className={styles.eyebrow}>Requested by</dt>
                      <dd className={styles.detailLabel}>{request.requestedBy}</dd>
                    </div>
                    <div>
                      <dt className={styles.eyebrow}>Location</dt>
                      <dd className={styles.detailLabel}>{request.locationName}</dd>
                    </div>
                    <div>
                      <dt className={styles.eyebrow}>Submitted</dt>
                      <dd className={styles.detailLabel}>{day(request.createdAt)}</dd>
                    </div>
                    <div>
                      <dt className={styles.eyebrow}>Estimated total</dt>
                      <dd className={styles.detailLabel}>{request.estimatedTotalMinor ? naira(request.estimatedTotalMinor, request.currency) : "Priced by HolyPearls"}</dd>
                    </div>
                  </dl>
                </section>
                <section className={styles.detail} aria-labelledby="items-title">
                  <h2 id="items-title" className={styles.detailTitle}>
                    What&apos;s being ordered
                  </h2>
                  {request.items.map((item) => (
                    <div key={item.configurationId} className={styles.detailRow}>
                      <div className={styles.detailText}>
                        <span className={styles.detailLabel}>{item.productName}</span>
                        <span className={styles.detailValue}>
                          {item.templateName ? "From approved template" : "Saved design"}
                          {item.quantity ? ` · ${item.quantity.toLocaleString("en-NG")}` : ""} · {request.locationName}
                          {item.totalMinor ? ` · ${naira(item.totalMinor, request.currency)}` : ""}
                        </span>
                      </div>
                    </div>
                  ))}
                  <p className={styles.dialogText}>The final price comes in HolyPearls&apos; quote.</p>
                </section>
                <section className={styles.detail} aria-labelledby="history-title">
                  <h2 id="history-title" className={styles.detailTitle}>
                    History
                  </h2>
                  {request.history.map((event) => (
                    <div key={`${event.label}-${event.at}`} className={styles.detailRow}>
                      <div className={styles.detailText}>
                        <span className={styles.detailLabel}>{event.label}</span>
                        <span className={styles.detailValue}>
                          {event.by ? `${event.by} · ` : ""}
                          {day(event.at)}
                        </span>
                      </div>
                    </div>
                  ))}
                  {request.approvals
                    .filter((approval) => approval.note)
                    .map((approval) => (
                      <p key={approval.id} className={styles.dialogText}>
                        {approval.decidedBy ?? "Approver"}: {approval.note}
                      </p>
                    ))}
                </section>
              </div>
              <ApprovalDecision organizationId={organizationId} initial={request} />
            </div>
          );
        })()
      )}
    </WorkspaceShell>
  );
}
