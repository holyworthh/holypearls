import { adminIntentSchema } from "@holypearls/contracts";
import { ButtonLink, ErrorState, PermissionDenied, StatusChip } from "@holypearls/ui";
import { notFound } from "next/navigation";
import { serverApi } from "@/lib/server-api";
import { siteUrl } from "@/lib/site";
import styles from "../../../admin-list.module.css";
import { requireAdmin } from "../../../admin-session";
import { formatTime, money } from "../../../format";
import { ATTEMPT_TONE, CUSTOMER_TONE, REASON_LABEL, shortReference } from "../../PaymentsTabs";

const INTENT_TONE = { OPEN: "neutral", PROCESSING: "info", SUCCEEDED: "success", REVIEW_REQUIRED: "warning", CANCELLED: "neutral" } as const;
const CHANNEL: Record<string, string> = { card: "Card", bank_transfer: "Bank transfer", ussd: "USSD", apple_pay: "Apple Pay", bank: "Bank" };

/**
 * One payment intent with every attempt, Paystack event, check, review,
 * receipt and history entry (Pen 97 · zbIzN: detail g6Ivx, states fktuR;
 * OPS-FR-045). Paystack records are shown as they are, never tidied.
 */
export default async function IntentPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin.permissions.includes("PAYMENT_VIEW")) return <PermissionDenied permission="PAYMENT_VIEW" />;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const result = await serverApi(`/v1/admin/payments/intents/${id}`, adminIntentSchema);
  if (!result.ok) {
    if (result.status === 404 || result.status === 400) notFound();
    return <ErrorState title="We couldn't load this payment" body="Something went wrong on our side. Try again, or share the request ID with support." requestId={result.error.requestId} />;
  }
  const intent = result.data;
  const openReview = intent.reviews.find((review) => review.status === "OPEN");

  return (
    <>
      <header className={styles.recordHead}>
        <p className={styles.eyebrow}>
          PAYMENT INTENT · {intent.forLabel.toUpperCase()} · INSTALLMENT {intent.installment.position} OF {intent.installment.of} ({intent.installment.label.toUpperCase()})
        </p>
        <h1 className={styles.recordTitle}>
          {money(intent.amountMinor, intent.currency)} {intent.currency} · {intent.installment.label}
        </h1>
        <div className={styles.chips}>
          <StatusChip tone={INTENT_TONE[intent.status]}>{intent.status}</StatusChip>
          <span className={styles.hint}>
            Customer sees {intent.customerSees ?? "—"} · {intent.customer}
          </span>
        </div>
        <div className={styles.panelActions}>
          {intent.orderId ? (
            <ButtonLink variant="secondary" href={siteUrl(`/orders/${intent.orderId}`)} target="_blank" rel="noopener">
              Open order
            </ButtonLink>
          ) : null}
          {openReview ? <ButtonLink href={`/payments/reviews?review=${openReview.id}`}>Open review</ButtonLink> : null}
        </div>
      </header>

      {openReview ? (
        <div className={styles.notice} role="status">
          <StatusChip tone="warning">{openReview.reason}</StatusChip>{" "}
          <span className={styles.hint}>{REASON_LABEL[openReview.reason]}. Finance decides in the review queue; the order is never credited twice.</span>
        </div>
      ) : null}

      <div className={styles.columns}>
        <div className={styles.tableCol}>
          <section aria-labelledby="attempts-title">
            <h2 id="attempts-title" className={styles.panelTitle}>
              Attempts ({intent.attempts.length})
            </h2>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">REFERENCE</th>
                  <th scope="col">METHOD</th>
                  <th scope="col">AMOUNT</th>
                  <th scope="col">CREATED</th>
                  <th scope="col">STATUS</th>
                </tr>
              </thead>
              <tbody>
                {intent.attempts.map((attempt) => (
                  <tr key={attempt.id}>
                    <td className={styles.mono} title={attempt.reference}>
                      {shortReference(attempt.reference)}
                    </td>
                    <td>{attempt.channel ? (CHANNEL[attempt.channel] ?? attempt.channel) : "—"}</td>
                    <td className={styles.mono}>
                      {money(attempt.amountMinor, intent.currency)}
                      {attempt.paidAmountMinor && attempt.paidAmountMinor !== attempt.amountMinor ? ` (paid ${money(attempt.paidAmountMinor, attempt.paidCurrency ?? intent.currency)})` : ""}
                    </td>
                    <td className={styles.mono}>{formatTime(attempt.createdAt)}</td>
                    <td>
                      <StatusChip tone={ATTEMPT_TONE[attempt.status]}>{attempt.status}</StatusChip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className={styles.hint}>Attempt statuses: CREATED, PENDING, SUCCEEDED, FAILED, ABANDONED, UNKNOWN (after 48 h).</p>
          </section>

          <section aria-labelledby="events-title">
            <h2 id="events-title" className={styles.panelTitle}>
              Paystack events ({intent.events.length})
            </h2>
            {intent.events.length ? (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">EVENT</th>
                    <th scope="col">REFERENCE</th>
                    <th scope="col">RECEIVED</th>
                    <th scope="col">CONFIRMED</th>
                  </tr>
                </thead>
                <tbody>
                  {intent.events.map((event) => (
                    <tr key={event.id}>
                      <td className={styles.mono}>{event.event}</td>
                      <td className={styles.mono}>{event.reference ? shortReference(event.reference) : "—"}</td>
                      <td className={styles.mono}>{formatTime(event.receivedAt)}</td>
                      <td className={styles.mono}>{event.processedAt ? formatTime(event.processedAt) : "Waiting"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className={styles.hint}>No webhooks yet. Results also come from the scheduled checks.</p>
            )}
          </section>

          <section aria-labelledby="checks-title">
            <h2 id="checks-title" className={styles.panelTitle}>
              Checks ({intent.attempts.reduce((count, attempt) => count + attempt.checks.length, 0)})
            </h2>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">WHEN</th>
                  <th scope="col">ATTEMPT</th>
                  <th scope="col">FROM</th>
                  <th scope="col">PAYSTACK SAID</th>
                </tr>
              </thead>
              <tbody>
                {intent.attempts.flatMap((attempt) =>
                  attempt.checks.map((check) => (
                    <tr key={`${attempt.id}-${check.at}`}>
                      <td className={styles.mono}>{formatTime(check.at)}</td>
                      <td className={styles.mono}>{shortReference(attempt.reference)}</td>
                      <td>{check.source === "webhook" ? "Webhook, verified" : "Scheduled check"}</td>
                      <td className={styles.mono}>
                        {check.status}
                        {check.amountMinor ? ` · ${money(check.amountMinor, check.currency ?? intent.currency)}` : ""}
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </section>
        </div>

        <aside className={styles.detailCol} aria-label="Summary and history">
          <section className={styles.panel} aria-labelledby="summary-title">
            <h2 id="summary-title" className={styles.panelTitle}>
              Summary
            </h2>
            <dl className={styles.fields}>
              <dt>Intent</dt>
              <dd>{intent.status}</dd>
              <dt>Installment</dt>
              <dd>
                {intent.installment.status} ({intent.installment.label})
              </dd>
              <dt>Succeeded attempt</dt>
              <dd className={styles.mono}>{intent.succeededAttemptReference ? shortReference(intent.succeededAttemptReference) : "—"}</dd>
              <dt>Currency</dt>
              <dd>{intent.currency}</dd>
              <dt>Receipt</dt>
              <dd className={styles.mono}>{intent.receipt?.number ?? "—"}</dd>
              <dt>Customer sees</dt>
              <dd>{intent.customerSees ? <StatusChip tone={CUSTOMER_TONE[intent.customerSees] ?? "neutral"}>{intent.customerSees}</StatusChip> : "—"}</dd>
            </dl>
          </section>
          <section className={styles.panel} aria-labelledby="history-title">
            <h2 id="history-title" className={styles.panelTitle}>
              History
            </h2>
            {intent.history.length ? (
              <ol className={styles.fields}>
                {intent.history.map((entry) => (
                  <li key={`${entry.action}-${entry.occurredAt}`}>
                    <strong>{entry.summary}</strong>
                    <br />
                    <span className={styles.hint}>
                      {entry.actorLabel.toUpperCase()} · {formatTime(entry.occurredAt)}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className={styles.hint}>Nothing recorded yet.</p>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
