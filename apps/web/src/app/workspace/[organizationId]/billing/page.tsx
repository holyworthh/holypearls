import { workspaceBillingSchema } from "@holypearls/contracts";
import { ButtonLink, ErrorState, PageState, StatusChip } from "@holypearls/ui";
import { naira } from "@holypearls/web-kit/money";
import type { Metadata } from "next";
import { PAYMENT_STATUS } from "../../../../components/orders/status";
import { chosenLocation, loadWorkspace } from "../../../../components/workspace/load";
import { SettingsTabs, WorkspaceShell } from "../../../../components/workspace/WorkspaceShell";
import styles from "../../../../components/workspace/workspace.module.css";
import { serverApi } from "../../../../lib/server-api";

export const metadata: Metadata = { title: "Billing", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Lagos" });

/** Billing (Pen 130 · juM56 desktop, tDzhI 375): balances due, receipts and payment history. Owner and Admin only (B2B-FR-012). */
export default async function WorkspaceBillingPage({ params, searchParams }: { params: Promise<{ organizationId: string }>; searchParams: Promise<{ location?: string }> }) {
  const { organizationId } = await params;
  const { me, organization } = await loadWorkspace(organizationId, `/workspace/${organizationId}/billing`);
  const location = chosenLocation(organization, (await searchParams).location);
  const billing = organization.me.permissions.includes("VIEW_BILLING") ? await serverApi(`/v1/organizations/${organizationId}/billing${location ? `?location=${location}` : ""}`, workspaceBillingSchema) : null;
  return (
    <WorkspaceShell organization={organization} userName={me.name} section="settings" location={location}>
      <SettingsTabs organizationId={organizationId} current="billing" me={organization.me} />
      <h1 className={styles.title}>Billing</h1>
      {!billing || (!billing.ok && billing.status === 403) ? (
        <PageState eyebrow="403 · VIEW BILLING" title="You don't have access to this" body="Billing is only for the workspace Owner and Admins. Ask your Owner for a receipt." />
      ) : !billing.ok ? (
        <ErrorState title="We couldn't load this list" body="Something went wrong on our side. Try again, or share the request ID with support." requestId={billing.error.requestId} action={<ButtonLink variant="secondary" href={`/workspace/${organizationId}/billing`}>Try again</ButtonLink>} />
      ) : (
        <>
          <div className={styles.totals}>
            <div className={styles.total}>
              <span className={styles.eyebrow}>Balances due</span>
              <span className={styles.totalValue}>{naira(billing.data.dueMinor, billing.data.currency)}</span>
              <span className={styles.rowMeta}>
                {billing.data.balancesDue.length} {billing.data.balancesDue.length === 1 ? "order" : "orders"}
              </span>
            </div>
            <div className={styles.total}>
              <span className={styles.eyebrow}>Paid this year</span>
              <span className={styles.totalValue}>{naira(billing.data.paidThisYearMinor, billing.data.currency)}</span>
              <span className={styles.rowMeta}>
                {billing.data.receiptsThisYear} {billing.data.receiptsThisYear === 1 ? "receipt" : "receipts"}
              </span>
            </div>
          </div>
          <section className={styles.panel} aria-labelledby="due-title">
            <div className={styles.panelHead}>
              <h2 id="due-title" className={styles.panelTitle}>
                Balances due
              </h2>
            </div>
            {billing.data.balancesDue.length ? (
              <ul className={styles.rows}>
                {billing.data.balancesDue.map((row) => (
                  <li key={row.orderId} className={styles.row}>
                    <div className={styles.rowText}>
                      <span className={styles.ref}>
                        {row.number} · {row.locationName.toUpperCase()}
                      </span>
                      <span className={styles.rowTitle}>{row.label}</span>
                    </div>
                    <StatusChip tone={PAYMENT_STATUS[row.paymentStatus].tone}>{PAYMENT_STATUS[row.paymentStatus].label}</StatusChip>
                    <a className={styles.rowAction} href={`/orders/${row.orderId}`}>
                      Pay {naira(row.amountMinor, row.currency)}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.emptyRow}>No balances due across your organization.</p>
            )}
          </section>
          <section className={styles.panel} aria-labelledby="receipts-title">
            <div className={styles.panelHead}>
              <h2 id="receipts-title" className={styles.panelTitle}>
                Receipts and payment history
              </h2>
            </div>
            {billing.data.receipts.length ? (
              <ul className={styles.rows}>
                {billing.data.receipts.map((row) => (
                  <li key={row.id} className={styles.row}>
                    <div className={styles.rowText}>
                      <span className={styles.ref}>
                        {row.number} · {row.orderNumber}
                      </span>
                      <span className={styles.rowTitle}>
                        {naira(row.amountMinor, row.currency)} · {day(row.paidAt)}
                      </span>
                      <span className={styles.rowMeta}>{row.locationName}</span>
                    </div>
                    <StatusChip tone={PAYMENT_STATUS[row.status].tone}>{PAYMENT_STATUS[row.status].label}</StatusChip>
                    <a className={styles.rowLink} href={`/orders/${row.orderId}/receipts/${row.id}`}>
                      Download
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.emptyRow}>No receipts yet.</p>
            )}
          </section>
        </>
      )}
    </WorkspaceShell>
  );
}
