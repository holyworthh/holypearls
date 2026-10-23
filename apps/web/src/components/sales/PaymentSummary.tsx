"use client";

import { type PaymentSummary as Summary, TRIGGER_LABEL } from "@holypearls/contracts";
import { Notice, StatusChip } from "@holypearls/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { newIdempotencyKey } from "@holypearls/web-kit/api";
import { naira } from "@holypearls/web-kit/money";
import { openPaystack, startInstallmentPayment } from "../../lib/paystack";
import s from "./payment-summary.module.css";

const STATUS: Record<string, { label: string; tone: "success" | "info" | "neutral" | "warning" }> = {
  PAID: { label: "PAID", tone: "success" },
  PROCESSING: { label: "CHECKING PAYMENT", tone: "info" },
  DUE: { label: "DUE NOW", tone: "warning" },
  NOT_DUE: { label: "LATER", tone: "neutral" },
  CANCELLED: { label: "CANCELLED", tone: "neutral" },
};

/**
 * The payment summary (PAY-FR-003): total, paid, remaining, next payment and
 * each payment with its status. "Pay" opens Paystack for the next one only;
 * while a payment is being confirmed the page checks again every few seconds
 * and never shows "Paid" until the server says so (PAY-FR-009).
 */
export function PaymentSummary({ orderId, summary }: { orderId: string; summary: Summary }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [key, setKey] = useState(() => newIdempotencyKey());
  const checking = summary.installments.some((part) => part.status === "PROCESSING");

  useEffect(() => {
    if (!checking) return;
    const timer = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(timer);
  }, [checking, router]);

  const pay = async () => {
    if (!summary.next) return;
    setBusy(true);
    setProblem(null);
    const outcome = await startInstallmentPayment(orderId, summary.next.id, key);
    if (!outcome.ok) {
      setProblem(outcome.message);
      setBusy(false);
      return;
    }
    await openPaystack(outcome.start, () => {
      setBusy(false);
      setKey(newIdempotencyKey());
      router.refresh();
    });
  };

  return (
    <section className={s.panel} aria-labelledby="payments-title">
      <h2 id="payments-title" className={s.title}>
        Payments
      </h2>
      <dl className={s.totals}>
        <div>
          <dt>Total</dt>
          <dd>{naira(summary.totalMinor, summary.currency)}</dd>
        </div>
        <div>
          <dt>Paid</dt>
          <dd>{naira(summary.paidMinor, summary.currency)}</dd>
        </div>
        <div>
          <dt>Remaining</dt>
          <dd>{naira(summary.remainingMinor, summary.currency)}</dd>
        </div>
      </dl>
      <ol className={s.parts}>
        {summary.installments.map((part) => (
          <li key={part.id} className={s.part}>
            <span>
              <span className={s.label}>{part.label}</span>
              <span className={s.meta}>
                {TRIGGER_LABEL[part.trigger]}
                {part.dueOn ? ` · ${part.dueOn}` : ""}
                {part.paidAt ? ` · paid ${new Date(part.paidAt).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}` : ""}
              </span>
            </span>
            <span className={s.amount}>{naira(part.amountMinor, summary.currency)}</span>
            <StatusChip tone={STATUS[part.status]!.tone}>{STATUS[part.status]!.label}</StatusChip>
          </li>
        ))}
      </ol>
      {checking ? (
        <Notice tone="info" title="Confirming your payment" live>
          <p>We&apos;re checking with Paystack. This page updates by itself.</p>
        </Notice>
      ) : null}
      {problem ? (
        <Notice tone="error" title="Payment not started" live>
          <p>{problem}</p>
        </Notice>
      ) : null}
      {summary.next && summary.next.payable ? (
        <button type="button" className={s.pay} onClick={() => void pay()} disabled={busy}>
          {busy ? "Opening Paystack…" : `Pay ${summary.next.label.toLowerCase()} · ${naira(summary.next.amountMinor, summary.currency)}`}
        </button>
      ) : null}
      {summary.next && summary.next.status === "NOT_DUE" ? <p className={s.meta}>You can pay early. We&apos;ll email you when it&apos;s due.</p> : null}
    </section>
  );
}
