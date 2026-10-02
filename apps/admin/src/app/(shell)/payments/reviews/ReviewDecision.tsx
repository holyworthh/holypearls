"use client";

import { type AdminReview, adminReviewSchema } from "@holypearls/contracts";
import { Button, FormField, Notice, RadioCardGroup, TextArea } from "@holypearls/ui";
import { api, errorCode, newIdempotencyKey } from "@holypearls/web-kit/api";
import { ApiError } from "@holypearls/contracts";
import { useRef, useState, type FormEvent } from "react";
import styles from "../../admin-list.module.css";

/**
 * The decision on a payment review (Pen 99 · resolution; OPS-FR-046): keep a
 * successful payment, or return the intent to OPEN. A note is required and
 * goes to the audit log. Paystack records are never deleted.
 */
export function ReviewDecision({ review }: { review: AdminReview }) {
  const succeeded = review.attempts.filter((attempt) => attempt.status === "SUCCEEDED");
  const credited = succeeded.find((attempt) => attempt.credited) ?? null;
  const keep = credited ?? succeeded[0] ?? null;
  const key = useRef(newIdempotencyKey());
  const [choice, setChoice] = useState<"SUCCEEDED" | "OPEN">(keep ? "SUCCEEDED" : "OPEN");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const options = [
    ...(keep
      ? [
          {
            value: "SUCCEEDED",
            title: credited ? `Keep the intent SUCCEEDED with ${keep.reference}` : `Count ${keep.reference} as the payment`,
            description: review.reason === "DUPLICATE_PAYMENT" ? "Refund the extra payment from the refunds screen." : "The order, receipt and confirmation email follow if they don't exist yet.",
          },
        ]
      : []),
    {
      value: "OPEN",
      title: "Return the intent to OPEN — no payment should count",
      description: credited ? "Not possible: a payment is already credited and its order exists." : "The customer can pay again. Refund any money taken.",
      disabled: Boolean(credited),
    },
  ];

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!note.trim()) {
      setError("Add a decision note. It's stored in the audit log.");
      return;
    }
    setError(undefined);
    setFailure(null);
    setBusy(true);
    try {
      await api(`/v1/admin/payments/reviews/${review.id}/resolve`, {
        method: "POST",
        body: choice === "SUCCEEDED" ? { resolution: "SUCCEEDED", attemptId: keep!.id, note } : { resolution: "OPEN", note },
        response: adminReviewSchema,
        headers: { "idempotency-key": key.current },
      });
      window.location.assign(`/payments/reviews?review=${review.id}&done=1`);
    } catch (problem) {
      key.current = newIdempotencyKey();
      setBusy(false);
      if (problem instanceof ApiError && problem.body.fieldErrors?.note) setError(problem.body.fieldErrors.note);
      else if (errorCode(problem) === "FORBIDDEN") setFailure("You can see this review. Resolving it needs PAYMENT_MANAGE.");
      else setFailure(problem instanceof ApiError ? problem.body.message : "We couldn't save the decision. Try again.");
    }
  };

  return (
    <form className={styles.panel} onSubmit={submit} noValidate aria-labelledby="decision-title">
      <h3 id="decision-title" className={styles.panelTitle}>
        Resolution
      </h3>
      <RadioCardGroup name="resolution" legend="Decision" options={options} value={choice} onChange={(value) => setChoice(value as "SUCCEEDED" | "OPEN")} />
      <FormField label="Decision note (required, shown in audit log)" id="decision-note" error={error}>
        <TextArea id="decision-note" value={note} onChange={(event) => setNote(event.target.value)} rows={3} />
      </FormField>
      {failure ? (
        <Notice tone="error" title="Can't resolve yet" live>
          <p>{failure}</p>
        </Notice>
      ) : null}
      <p className={styles.hint}>Recorded in the audit log. Paystack records are never deleted.</p>
      <Button type="submit" loading={busy}>
        Resolve review
      </Button>
    </form>
  );
}
