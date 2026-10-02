import { orderSchema } from "@holypearls/contracts";
import { StatusChip } from "@holypearls/ui";
import { Check, Truck } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PaymentSummary } from "../../../components/sales/PaymentSummary";
import { SiteShell } from "../../../components/site/SiteShell";
import { naira } from "../../../lib/money";
import { serverApi } from "../../../lib/server-api";
import styles from "./order.module.css";

export const metadata: Metadata = { title: "Your order", robots: { index: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  AWAITING_PREREQUISITE: "PREPARING YOUR PROOF",
  QUEUED: "QUEUED",
  IN_PRODUCTION: "IN PRODUCTION",
  QUALITY_CHECK: "QUALITY CHECK",
  READY_AWAITING_RELEASE: "READY",
  READY_TO_DISPATCH: "READY TO DISPATCH",
  DISPATCHED: "DISPATCHED",
  DELIVERED: "DELIVERED",
  CANCELLED: "CANCELLED",
};

const day = (iso: string) => new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", timeZone: "Africa/Lagos" });

/**
 * A customer's order (Pen 52 · fuUCR, confirmation part; COM-FR-085). Opened by
 * the account, the browser that paid, or the order's secure link; anyone else
 * gets 404. Full tracking (holds, shipments, changes) arrives with T07-03.
 */
export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const result = await serverApi(`/v1/orders/${id}`, orderSchema);
  if (!result.ok) {
    if (result.status === 404 || result.status === 400) notFound();
    throw new Error(result.error.message);
  }
  const order = result.data;
  const paidOn = order.receipts[0] ? day(order.receipts[0].paidAt) : day(order.placedAt);
  // An order from a quote is placed when it's accepted and paid on its schedule (T05-05).
  const scheduled = order.payments;
  const fullyPaid = !scheduled || scheduled.next === null;
  const firstPaid = scheduled ? scheduled.installments.find((part) => part.status === "PAID") : null;
  const lead = order.items.reduce<{ min: number; max: number } | null>((widest, item) => (item.leadDays ? { min: Math.max(widest?.min ?? 0, item.leadDays.min), max: Math.max(widest?.max ?? 0, item.leadDays.max) } : widest), null);
  const stages = [
    scheduled
      ? { label: firstPaid ? "Deposit paid" : "Accepted", note: firstPaid?.paidAt ? day(firstPaid.paidAt) : day(order.placedAt), state: "done" }
      : { label: "Paid", note: paidOn, state: "done" },
    { label: "Proof", note: "Now", state: "now" },
    { label: "Production", note: "Next", state: "todo" },
    { label: "Quality Check", note: "", state: "todo" },
    { label: "Dispatch", note: lead ? `Est. ${lead.min}–${lead.max} working days after proof` : "Confirmed with your proof", state: "todo" },
  ] as const;

  return (
    <SiteShell>
      <div className={styles.page}>
        <div className={styles.column}>
          <p className={styles.eyebrow}>
            ORDER {order.number} · {scheduled ? `PLACED ${day(order.placedAt).toUpperCase()}${order.quote ? ` · QUOTE ${order.quote.reference} V${order.quote.version}` : ""}` : `PAID ${paidOn.toUpperCase()}`}
          </p>
          <h1 className={styles.title}>{fullyPaid ? "Your order is confirmed" : "Your order is placed"}</h1>
          {scheduled ? <PaymentSummary orderId={order.id} summary={scheduled} /> : null}

          {order.items.map((item) => (
            <div key={`${item.productName}-${item.summary}`} className={styles.card}>
              <span className={styles.thumb} aria-hidden="true" />
              <div className={styles.text}>
                <p className={styles.name}>
                  {item.productName} · {item.quantity.toLocaleString("en-NG")}
                </p>
                <p className={styles.meta}>{item.summary}</p>
                <p className={styles.meta}>{scheduled ? "Total" : "Paid"} {naira(item.totalMinor)}</p>
              </div>
              <StatusChip tone="info">{STATUS_LABEL[item.status] ?? item.status}</StatusChip>
            </div>
          ))}

          <ol className={styles.tracker} aria-label="Order progress">
            {stages.map((stage) => (
              <li key={stage.label} className={styles[stage.state]} aria-current={stage.state === "now" ? "step" : undefined}>
                <span className={styles.dot} aria-hidden="true">
                  {stage.state === "done" ? <Check size={14} strokeWidth={2.5} /> : stage.state === "now" ? <span className={styles.nowDot} /> : null}
                </span>
                <span className={styles.stage}>{stage.label}</span>
                {stage.note ? <span className={styles.note}>{stage.note}</span> : null}
              </li>
            ))}
          </ol>

          <div className={styles.card}>
            <Truck size={22} strokeWidth={2} aria-hidden="true" />
            <div className={styles.text}>
              <p className={styles.next}>{order.deliverTo ? `Delivering to ${order.deliverTo}` : "Delivery details on your order"}</p>
              <p className={styles.meta}>We&apos;ll send your proof by email. Nothing is printed until you approve it.</p>
            </div>
          </div>

          {order.proofs.some((proof) => proof.status !== "NOT_REQUIRED") ? (
            <nav className={styles.links} aria-label="Proofs">
              {order.proofs
                .filter((proof) => proof.status !== "NOT_REQUIRED")
                .map((proof) => {
                  const item = order.items[proof.itemPosition - 1];
                  const label = proof.status === "AWAITING_APPROVAL" ? `Review proof V${proof.versionNumber}` : proof.status === "APPROVED" ? `Approved proof V${proof.versionNumber}` : "Proof being prepared";
                  return (
                    <a key={proof.id} href={`/orders/${order.id}/proofs/${proof.id}`}>
                      {item?.productName ?? `Item ${proof.itemPosition}`}: {label}
                    </a>
                  );
                })}
            </nav>
          ) : null}

          <nav className={styles.links} aria-label="Order links">
            {order.receipts.map((receipt) => (
              <a key={receipt.id} href={`/orders/${order.id}/receipts/${receipt.id}`}>
                Receipt {receipt.number}
              </a>
            ))}
            <a href={`/contact?topic=order&order=${encodeURIComponent(order.number)}`}>Get help</a>
          </nav>
        </div>
      </div>
    </SiteShell>
  );
}
