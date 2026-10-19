import { adminRefundListSchema } from "@holypearls/contracts";
import { ButtonLink, EmptyState, ErrorState, Notice, PermissionDenied, StatusChip } from "@holypearls/ui";
import { serverApi } from "@/lib/server-api";
import styles from "../admin-list.module.css";
import { requireAdmin } from "../admin-session";
import { money } from "../format";
import { CUSTOMER_TONE, shortReference } from "../payments/PaymentsTabs";

const REFUND_TONE = { PENDING: "info", PROCESSED: "success", FAILED: "error" } as const;

/** Refunds (Pen 121 · NJoG3, states W5Vo5g; OPS-FR-043; TECH-05 §11). Each is a new record; the original payment never changes. */
export default async function RefundsPage({ searchParams }: { searchParams: Promise<{ issued?: string }> }) {
  const admin = await requireAdmin();
  if (!admin.permissions.includes("REFUND_ISSUE")) return <PermissionDenied permission="REFUND_ISSUE" />;
  const { issued } = await searchParams;
  const list = await serverApi("/v1/admin/refunds", adminRefundListSchema);
  const done = list.ok && issued ? list.data.items.find((item) => item.number === issued) : undefined;
  return (
    <>
      <header className={styles.head}>
        <p className={styles.eyebrow}>PAYSTACK REFUND API</p>
        <h1 className={styles.title}>Refunds</h1>
      </header>
      {done ? (
        <Notice tone="success" title="Refund submitted" live>
          <p>
            {done.number} is {done.status} with Paystack. Status updates by webhook and check job. Recorded in the audit log.
          </p>
        </Notice>
      ) : null}
      {!list.ok ? (
        <ErrorState
          title="We couldn't load this list"
          body="Something went wrong on our side. Try again, or share the request ID with support."
          requestId={list.error.requestId}
          action={
            <ButtonLink variant="secondary" href="/refunds">
              Try again
            </ButtonLink>
          }
        />
      ) : list.data.items.length === 0 ? (
        <EmptyState title="No refunds yet" body="Refunds start from a payment review or a payment." />
      ) : (
        <div className={styles.panel}>
          <table className={styles.table}>
            <caption className="hp-visually-hidden">Refunds, newest first</caption>
            <thead>
              <tr>
                <th scope="col">REFUND</th>
                <th scope="col">ORIGINAL ATTEMPT</th>
                <th scope="col">FOR</th>
                <th scope="col">AMOUNT</th>
                <th scope="col">REFUND STATUS</th>
                <th scope="col">CUSTOMER SEES</th>
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((refund) => (
                <tr key={refund.id}>
                  <td className={styles.mono}>
                    <a className={styles.action} href={`/payments/intents/${refund.intentId}`}>
                      {refund.number}
                    </a>
                  </td>
                  <td className={styles.mono} title={refund.reference}>
                    {shortReference(refund.reference)}
                  </td>
                  <td>{refund.forLabel}</td>
                  <td className={styles.mono}>{money(refund.amountMinor, refund.currency)}</td>
                  <td>
                    <StatusChip tone={REFUND_TONE[refund.status]}>{refund.status}</StatusChip>
                    {refund.failure ? <span className={styles.hint}> {refund.failure}</span> : null}
                  </td>
                  <td>{refund.customerSees ? <StatusChip tone={CUSTOMER_TONE[refund.customerSees] ?? "neutral"}>{refund.customerSees}</StatusChip> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
