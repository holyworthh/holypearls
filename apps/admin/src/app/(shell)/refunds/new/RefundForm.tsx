"use client";

import { ApiError, adminRefundSchema, type RefundablePayment } from "@holypearls/contracts";
import { Button, ButtonLink, FormField, Notice, RadioCardGroup, StatusChip, TextArea, TextField } from "@holypearls/ui";
import { api, errorCode, newIdempotencyKey } from "@holypearls/web-kit/api";
import { type FormEvent, useRef, useState } from "react";
import { StepUpDialog } from "@/components/StepUpDialog";
import styles from "../../admin-list.module.css";
import css from "../../form-layout.module.css";
import { money, toKobo } from "../../format";
import { shortReference } from "../../payments/PaymentsTabs";

const CHANNEL: Record<string, string> = { card: "Card", bank_transfer: "Bank transfer", ussd: "USSD", apple_pay: "Apple Pay", bank: "Bank" };
const REASON: Record<string, string> = { DUPLICATE_PAYMENT: "Duplicate payment", PAID_PARTICIPANT_REMOVED: "Removed participant's payment" };
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Lagos" });

/**
 * The refund form (Pen 121 · mRG8q, states W5Vo5g). High-risk (PRD-06 §18):
 * the API asks for a recent authenticator check and the step-up dialog opens.
 * The original payment isn't changed; a new refund record is linked to it.
 */
export function RefundForm({ payment }: { payment: RefundablePayment }) {
  const left = BigInt(payment.leftMinor);
  const [kind, setKind] = useState<"FULL" | "PARTIAL">("FULL");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState(payment.review ? (REASON[payment.review.reason] ?? "") : "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<{ title: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [stepUp, setStepUp] = useState(false);
  const key = useRef(newIdempotencyKey());
  const amountMinor = kind === "FULL" ? payment.leftMinor : toKobo(amount);
  const action = `Refund ${amountMinor ? money(amountMinor, payment.currency) : "—"} of ${shortReference(payment.reference)} (${kind === "FULL" ? "full" : "partial"})`;

  const issue = async () => {
    if (!amountMinor || amountMinor === "0") {
      setErrors({ amountMinor: "Enter the amount in naira, for example 25000 or 25000.50" });
      return;
    }
    setBusy(true);
    setErrors({});
    setFailure(null);
    try {
      const refund = await api("/v1/admin/refunds", {
        method: "POST",
        body: { attemptId: payment.attemptId, amountMinor, reason, reviewId: payment.review?.status === "OPEN" ? payment.review.id : null },
        headers: { "idempotency-key": key.current },
        response: adminRefundSchema,
      });
      key.current = newIdempotencyKey();
      setStepUp(false);
      if (refund.status === "FAILED") {
        setFailure({ title: "Refund FAILED", text: `${refund.failure ?? "Paystack declined the refund."} ${payment.review ? "The review stays open; try again or contact Paystack." : ""}` });
        setBusy(false);
        return;
      }
      window.location.assign(`/refunds?issued=${refund.number}`);
    } catch (problem) {
      key.current = newIdempotencyKey();
      setBusy(false);
      const code = errorCode(problem);
      if (code === "RECENT_MFA_REQUIRED") setStepUp(true);
      else if (problem instanceof ApiError && problem.body.fieldErrors) setErrors(problem.body.fieldErrors);
      else if (code === "FORBIDDEN") setFailure({ title: "You don't have access to this", text: "Your staff permissions don't include REFUND_ISSUE." });
      else setFailure({ title: "That didn't work", text: problem instanceof ApiError ? problem.body.message : "We couldn't issue the refund. Try again." });
    }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void issue();
  };

  return (
    <>
      <header className={styles.recordHead}>
        <p className={styles.eyebrow}>{payment.review ? `FROM PAYMENT REVIEW · ${payment.review.reason}` : "REFUND"}</p>
        <h1 className={styles.recordTitle}>Refund {shortReference(payment.reference)}</h1>
        <div className={styles.chips}>
          {payment.review ? <StatusChip tone="warning">{payment.review.reason}</StatusChip> : null}
          <span className={styles.hint}>
            Original attempt {money(payment.paidMinor, payment.currency)}
            {payment.channel ? ` · ${CHANNEL[payment.channel] ?? payment.channel}` : ""}
            {payment.paidAt ? ` · ${day(payment.paidAt)}` : ""} · order {payment.forLabel}
          </span>
        </div>
        <div className={styles.panelActions}>
          <ButtonLink variant="secondary" href={`/payments/intents/${payment.intentId}`}>
            Open payment
          </ButtonLink>
          {payment.review ? (
            <ButtonLink variant="secondary" href={`/payments/reviews?review=${payment.review.id}`}>
              Open review
            </ButtonLink>
          ) : null}
        </div>
      </header>

      <div className={styles.columns}>
        <div className={styles.tableCol}>
          {left === 0n ? (
            <Notice tone="info" title="Nothing left to refund">
              <p>Pending and processed refunds already cover {money(payment.paidMinor, payment.currency)}.</p>
            </Notice>
          ) : (
            <form className={`${styles.panel} ${css.form}`} onSubmit={submit} noValidate aria-labelledby="refund-title">
              <h2 id="refund-title" className={styles.panelTitle}>
                Refund
              </h2>
              <RadioCardGroup
                name="refund-kind"
                legend="How much"
                value={kind}
                onChange={(value) => setKind(value as "FULL" | "PARTIAL")}
                options={[
                  { value: "FULL", title: `Full refund · ${money(payment.leftMinor, payment.currency)}`, description: BigInt(payment.refundedMinor) > 0n ? `What's left after ${money(payment.refundedMinor, payment.currency)} already refunded.` : undefined },
                  { value: "PARTIAL", title: "Partial refund" },
                ]}
                error={kind === "FULL" ? errors.amountMinor : undefined}
              />
              {kind === "PARTIAL" ? (
                <FormField id="refund-amount" label="Partial amount (₦)" hint={`Up to ${money(payment.leftMinor, payment.currency)}`} error={errors.amountMinor}>
                  <TextField inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
                </FormField>
              ) : null}
              <FormField id="refund-reason" label="Reason (shown in history)" error={errors.reason}>
                <TextArea value={reason} rows={2} onChange={(event) => setReason(event.target.value)} />
              </FormField>
              <Notice tone="info">
                <p>The original payment record isn&apos;t changed. A new refund record is linked to {shortReference(payment.reference)}.</p>
              </Notice>
              {failure ? (
                <Notice tone="error" title={failure.title} live>
                  <p>{failure.text}</p>
                </Notice>
              ) : null}
              <div className={css.actions}>
                <Button type="submit" loading={busy}>
                  Issue refund through Paystack
                </Button>
              </div>
            </form>
          )}
          {payment.refunds.length ? (
            <section className={styles.panel} aria-labelledby="earlier-title">
              <h2 id="earlier-title" className={styles.panelTitle}>
                Refunds of this payment
              </h2>
              <ul className={styles.plainList}>
                {payment.refunds.map((refund) => (
                  <li key={refund.id}>
                    <span className={styles.mono}>{refund.number}</span> · {money(refund.amountMinor, refund.currency)} · <StatusChip tone={refund.status === "PROCESSED" ? "success" : refund.status === "FAILED" ? "error" : "info"}>{refund.status}</StatusChip>
                    <span className={styles.hint}> {refund.reason}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
        <aside className={styles.detailCol} aria-labelledby="types-title">
          <section className={styles.panel}>
            <h2 id="types-title" className={styles.panelTitle}>
              Resolution types
            </h2>
            <dl className={styles.fields}>
              <dt>DUPLICATE_PAYMENT</dt>
              <dd>Refund the extra attempt</dd>
              <dt>PAID_PARTICIPANT_REMOVED</dt>
              <dd>Refund the removed participant&apos;s payment</dd>
              <dt>Cancelled order</dt>
              <dd>Refund (not store credit)</dd>
            </dl>
            <p className={styles.hint}>Store credit and vouchers are P2 and not offered.</p>
          </section>
        </aside>
      </div>
      <StepUpDialog open={stepUp} action={action} confirmLabel="Confirm and refund" onClose={() => setStepUp(false)} onVerified={issue} />
    </>
  );
}
