import type { AccountDraft, AccountOrder, AccountQuote, AccountReceipt } from "@holypearls/contracts";
import { StatusChip } from "@holypearls/ui";
import { naira } from "@holypearls/web-kit/money";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import styles from "../../app/account/account.module.css";
import { day } from "../../lib/format";
import { ORDER_SUMMARY, PAYMENT_STATUS } from "../orders/status";

/* History rows shared by the account overview and the full lists (Pen frame 92; T09-01b). */

type Tone = "success" | "info" | "neutral" | "warning" | "error" | "action";

const chipLabel = (status: string) => status.replaceAll("_", " ");
const DRAFT_TONE: Record<string, Tone> = { PRICE_READY: "success", ESTIMATE_READY: "info", QUOTE_REQUIRED: "warning", CONSULTATION_REQUIRED: "warning" };
const QUOTE_TONE: Record<string, Tone> = { READY: "action", ACCEPTED: "success", REVISION_REQUESTED: "info", PENDING_REVIEW: "info", SUBMITTED: "info", UNDER_REVIEW: "info", QUOTED: "action", ORDERED: "success", COMPLETED: "success" };

const savedAgo = (iso: string, now: number) => {
  const days = Math.floor((now - Date.parse(iso)) / 86_400_000);
  return days <= 0 ? "SAVED TODAY" : days === 1 ? "SAVED YESTERDAY" : `SAVED ${days} DAYS AGO`;
};
const shortDay = (iso: string) => new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", timeZone: "Africa/Lagos" });

export function Row({ refText, title, chips, action }: { refText: string; title: string; chips?: ReactNode; action: { label: string; href: string } }) {
  return (
    <li className={styles.row}>
      <div className={styles.rowText}>
        <span className={styles.ref}>{refText}</span>
        <p className={styles.rowTitle}>{title}</p>
      </div>
      {chips ? <div className={styles.chips}>{chips}</div> : null}
      <a className={styles.action} href={action.href}>
        {action.label}
        <ArrowRight aria-hidden size={16} />
      </a>
    </li>
  );
}

export function Section({ id, title, empty, children }: { id: string; title: string; empty: string; children: ReactNode[] }) {
  return (
    <section id={id} className={styles.card} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className={styles.cardTitle}>
        {title}
      </h2>
      {children.length ? <ul className={styles.rows}>{children}</ul> : <p className={styles.empty}>{empty}</p>}
    </section>
  );
}

export const draftRow = (draft: AccountDraft, now: number) => (
  <Row
    key={draft.id}
    refText={`${draft.kind === "PROJECT" ? "PROJECT DRAFT" : "DRAFT"} · ${savedAgo(draft.savedAt, now)}`}
    title={`${draft.title} · ${draft.detail}`}
    chips={<StatusChip tone={DRAFT_TONE[draft.status] ?? "neutral"}>{chipLabel(draft.status)}</StatusChip>}
    action={{ label: "Resume", href: draft.href }}
  />
);

export const quoteRow = (quote: AccountQuote) => {
  const isQuote = quote.kind === "QUOTE";
  const action = !isQuote ? "View" : quote.status === "READY" ? "Review" : quote.status === "EXPIRED" ? "Ask for an update" : "View";
  return (
    <Row
      key={quote.id}
      refText={isQuote ? `QUOTE ${quote.reference}${quote.version ? ` · V${quote.version}` : ""}` : `PROJECT ${quote.reference}`}
      title={quote.validUntil && quote.status === "READY" ? `${quote.title} · valid until ${shortDay(quote.validUntil)}` : quote.title}
      chips={<StatusChip tone={QUOTE_TONE[quote.status] ?? "neutral"}>{chipLabel(quote.status)}</StatusChip>}
      action={{ label: action, href: quote.href }}
    />
  );
};

export const orderRow = (order: AccountOrder) => {
  const status = ORDER_SUMMARY[order.summaryStatus];
  const payment = order.paymentStatus ? PAYMENT_STATUS[order.paymentStatus] : null;
  return (
    <Row
      key={order.id}
      refText={`ORDER ${order.number}`}
      title={order.title}
      chips={
        <>
          <StatusChip tone={status.tone}>{status.label}</StatusChip>
          {payment ? <StatusChip tone={payment.tone}>{payment.label}</StatusChip> : null}
        </>
      }
      action={{ label: "View", href: `/orders/${order.id}` }}
    />
  );
};

export const receiptRow = (receipt: AccountReceipt) => (
  <Row
    key={receipt.id}
    refText={`RECEIPT ${receipt.number} · ${shortDay(receipt.paidAt)}`}
    title={`${naira(receipt.amountMinor, receipt.currency)} · Paystack ${receipt.paystackReference} · ${day(receipt.paidAt)}`}
    action={{ label: "Download", href: receipt.orderId ? `/orders/${receipt.orderId}/receipts/${receipt.id}` : "/account/receipts" }}
  />
);
