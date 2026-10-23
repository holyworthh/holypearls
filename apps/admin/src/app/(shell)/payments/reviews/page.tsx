import { adminReviewListSchema, adminReviewSchema } from "@holypearls/contracts";
import { ButtonLink, EmptyState, ErrorState, PermissionDenied, StatusChip } from "@holypearls/ui";
import { Fragment } from "react";
import { serverApi } from "@/lib/server-api";
import styles from "../../admin-list.module.css";
import { requireAdmin } from "../../admin-session";
import { ago, formatTime, money } from "../../format";
import { PaymentsTabs, REASON_LABEL, shortReference } from "../PaymentsTabs";
import { ReviewDecision } from "./ReviewDecision";

type Search = { review?: string; status?: string; done?: string };

/** Payment reviews: queue, detail and decision (Pen 99 · cfVRu: queue f1lV3, states gMqry, mobile T8Zbf; OPS-FR-046). */
export default async function ReviewsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const admin = await requireAdmin();
  if (!admin.permissions.includes("PAYMENT_VIEW")) return <PermissionDenied permission="PAYMENT_VIEW" />;
  const params = await searchParams;
  const status = params.status === "RESOLVED" ? "RESOLVED" : "OPEN";
  const [queue, open, selected] = await Promise.all([
    serverApi(`/v1/admin/payments/reviews?status=${status}`, adminReviewListSchema),
    status === "OPEN" ? null : serverApi("/v1/admin/payments/reviews?status=OPEN", adminReviewListSchema),
    params.review ? serverApi(`/v1/admin/payments/reviews/${encodeURIComponent(params.review)}`, adminReviewSchema) : null,
  ]);
  const openCount = status === "OPEN" ? (queue.ok ? queue.data.items.length : null) : open?.ok ? open.data.items.length : null;
  const review = selected?.ok ? selected.data : queue.ok && !params.review ? queue.data.items[0] : undefined;
  const canDecide = admin.permissions.includes("PAYMENT_MANAGE");
  const currency = String(review?.details.currency ?? "NGN");

  return (
    <>
      <header className={styles.head}>
        <p className={styles.eyebrow}>PAYMENTS · REVIEWS</p>
        <h1 className={styles.title}>Review queue</h1>
      </header>
      <PaymentsTabs current="reviews" openReviews={openCount} />

      {params.done && review?.status === "RESOLVED" ? (
        <div className={styles.notice} role="status">
          <StatusChip tone="success">Review resolved</StatusChip>{" "}
          <span className={styles.hint}>
            Resolved by {review.resolvedBy ?? "staff"}: intent {review.resolution}. Recorded in the audit log.
          </span>
        </div>
      ) : null}

      {!queue.ok ? (
        <ErrorState title="We couldn't load this list" body="Something went wrong on our side. Try again, or share the request ID with support." requestId={queue.error.requestId} />
      ) : (
        <div className={styles.columns}>
          <div className={styles.tableCol}>
            <nav className={styles.tabs} aria-label="Review status">
              <a className={styles.tab} href="/payments/reviews" aria-current={status === "OPEN" ? "page" : undefined}>
                Open reviews{openCount !== null ? ` · ${openCount}` : ""}
              </a>
              <a className={styles.tab} href="/payments/reviews?status=RESOLVED" aria-current={status === "RESOLVED" ? "page" : undefined}>
                Resolved
              </a>
            </nav>
            {queue.data.items.length === 0 ? (
              <EmptyState title={status === "OPEN" ? "No payments need review" : "No resolved reviews yet"} body="New reviews open automatically when a payment is unclear, the wrong amount, or paid twice." />
            ) : (
              <ul className={styles.listCard} aria-label={status === "OPEN" ? "Open reviews, oldest first" : "Resolved reviews"}>
                {queue.data.items.map((item) => (
                  <li key={item.id}>
                    <a className={styles.item} href={`/payments/reviews?${status === "RESOLVED" ? "status=RESOLVED&" : ""}review=${item.id}`} aria-current={item.id === review?.id ? "true" : undefined}>
                      <span className={styles.itemTop}>
                        <strong>{item.forLabel}</strong>
                        <span className={styles.itemMeta}>{ago(item.createdAt)}</span>
                      </span>
                      <span className={styles.itemMeta}>{REASON_LABEL[item.reason]}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <aside className={styles.detailCol} aria-label="Review detail">
            {review ? (
              <>
                <section className={styles.panel} aria-labelledby="review-title">
                  <p className={styles.eyebrow}>PAYMENT REVIEW · {review.forLabel.toUpperCase()}</p>
                  <h2 id="review-title" className={styles.panelTitle}>
                    {REASON_LABEL[review.reason]}
                  </h2>
                  <div className={styles.chips}>
                    <StatusChip tone={review.status === "OPEN" ? "warning" : "success"}>{review.reason}</StatusChip>
                    <span className={styles.hint}>Opened by system {formatTime(review.createdAt)}</span>
                  </div>
                  <a className={styles.action} href={`/payments/intents/${review.intentId}`}>
                    Open intent
                  </a>
                  <h3 className={styles.panelTitle}>What happened</h3>
                  <dl className={styles.fields}>
                    <dt>Customer</dt>
                    <dd>{review.customer}</dd>
                    {review.attempts.map((attempt) => (
                      <Fragment key={attempt.id}>
                        <dt>{attempt.credited ? "Credited attempt" : attempt.status === "SUCCEEDED" ? "Other successful attempt" : "Attempt"}</dt>
                        <dd className={styles.mono}>
                          {shortReference(attempt.reference)} · {money(attempt.paidAmountMinor ?? attempt.amountMinor, currency)} · {attempt.status}
                        </dd>
                      </Fragment>
                    ))}
                    {typeof review.details.amountMinor === "string" ? (
                      <>
                        <dt>Expected</dt>
                        <dd className={styles.mono}>{money(review.details.amountMinor, String(review.details.currency ?? "NGN"))}</dd>
                      </>
                    ) : null}
                    {typeof review.details.why === "string" ? (
                      <>
                        <dt>Why</dt>
                        <dd>{review.details.why}</dd>
                      </>
                    ) : null}
                  </dl>
                  {review.status === "RESOLVED" ? (
                    <p className={styles.hint}>
                      Resolved by {review.resolvedBy ?? "staff"} {review.resolvedAt ? formatTime(review.resolvedAt) : ""}: {review.resolution === "REFUNDED" ? "refunded" : `intent ${review.resolution}`}. Note: {review.note}
                    </p>
                  ) : null}
                </section>
                {review.status === "OPEN" && admin.permissions.includes("REFUND_ISSUE") && (review.reason === "DUPLICATE_PAYMENT" || review.reason === "PAID_PARTICIPANT_REMOVED") ? (
                  <section className={styles.panel} aria-labelledby="refund-title">
                    <h3 id="refund-title" className={styles.panelTitle}>
                      Refund
                    </h3>
                    <p className={styles.hint}>
                      {review.reason === "DUPLICATE_PAYMENT" ? "Refund the extra attempt" : "Refund the removed participant's payment"}. The review resolves when Paystack processes the refund.
                    </p>
                    {(() => {
                      const paid = review.attempts.filter((attempt) => attempt.status === "SUCCEEDED");
                      const target = review.reason === "DUPLICATE_PAYMENT" ? paid.find((attempt) => !attempt.credited) : paid[0];
                      return target ? <ButtonLink href={`/refunds/new?attempt=${target.id}&review=${review.id}`}>Refund {target.reference}</ButtonLink> : null;
                    })()}
                  </section>
                ) : null}
                {review.status === "OPEN" ? (
                  canDecide ? (
                    <ReviewDecision review={review} />
                  ) : (
                    <section className={styles.panel} aria-label="View only">
                      <StatusChip tone="neutral">View only</StatusChip>
                      <p className={styles.hint}>You can see this review. Resolving it needs PAYMENT_MANAGE.</p>
                    </section>
                  )
                ) : null}
              </>
            ) : selected && !selected.ok ? (
              <ErrorState title="We couldn't load this review" requestId={selected.error.requestId} />
            ) : (
              <p className={styles.hint}>Choose a review to see what happened.</p>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
