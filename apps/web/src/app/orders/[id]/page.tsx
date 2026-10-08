import { type Order, orderSchema } from "@holypearls/contracts";
import { Notice, StatusChip } from "@holypearls/ui";
import { Check, CircleAlert, CreditCard, FileText, LifeBuoy, PackageOpen, Pencil, Receipt, RotateCcw, XCircle } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OrderRefresh } from "../../../components/orders/OrderRefresh";
import s from "../../../components/orders/tracking.module.css";
import { PaymentSummary } from "../../../components/sales/PaymentSummary";
import { SiteShell } from "../../../components/site/SiteShell";
import { naira } from "@holypearls/web-kit/money";
import { serverApi } from "../../../lib/server-api";
import { ORDER_SUMMARY as SUMMARY } from "../../../components/orders/status";

export const metadata: Metadata = { title: "Your order", robots: { index: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

type Item = Order["items"][number];
type Tone = "success" | "info" | "neutral" | "warning" | "error";


const PRODUCTION: Record<Item["status"], string> = {
  AWAITING_PREREQUISITE: "Not started",
  QUEUED: "Queued",
  IN_PRODUCTION: "In production",
  QUALITY_CHECK: "Quality Check",
  READY_AWAITING_RELEASE: "Ready",
  READY_TO_DISPATCH: "Ready",
  DISPATCHED: "Dispatched",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

const ITEM_CHIP: Record<Item["status"], { label: string; tone: Tone }> = {
  AWAITING_PREREQUISITE: { label: "PREPARING", tone: "neutral" },
  QUEUED: { label: "QUEUED", tone: "neutral" },
  IN_PRODUCTION: { label: "IN PRODUCTION", tone: "info" },
  QUALITY_CHECK: { label: "QUALITY CHECK", tone: "info" },
  READY_AWAITING_RELEASE: { label: "READY — AWAITING RELEASE", tone: "neutral" },
  READY_TO_DISPATCH: { label: "READY TO DISPATCH", tone: "success" },
  DISPATCHED: { label: "DISPATCHED", tone: "success" },
  DELIVERED: { label: "DELIVERED", tone: "success" },
  CANCELLED: { label: "CANCELLED", tone: "neutral" },
};

const SHIPMENT: Record<Order["shipments"][number]["status"], { label: string; tone: Tone }> = {
  PREPARING: { label: "PREPARING", tone: "neutral" },
  LABEL_CREATED: { label: "LABEL CREATED", tone: "neutral" },
  IN_TRANSIT: { label: "IN TRANSIT", tone: "info" },
  OUT_FOR_DELIVERY: { label: "OUT FOR DELIVERY", tone: "info" },
  DELIVERED: { label: "DELIVERED", tone: "success" },
  ATTEMPTED_DELIVERY: { label: "DELIVERY ATTEMPTED", tone: "warning" },
  EXCEPTION: { label: "DELAYED", tone: "warning" },
  RETURNED: { label: "RETURNED", tone: "neutral" },
};

const day = (iso: string) => new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", timeZone: "Africa/Lagos" });
const stamp = (iso: string) => new Date(iso).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" });

function proofCell(proof: Order["proofs"][number] | undefined) {
  if (!proof || proof.status === "NOT_REQUIRED") return "Not needed";
  const v = proof.versionNumber ? `V${proof.versionNumber} ` : "";
  return {
    PREPARING: "Being prepared",
    AWAITING_APPROVAL: `${v}awaiting you`,
    CHANGES_REQUESTED: "Your changes are being made",
    REVISION_IN_PROGRESS: "New version coming",
    APPROVED: `${v}approved`,
  }[proof.status];
}

/**
 * A customer's order (Pen 51 · aV63z desktop, Pen 27 · a5YAJ mobile;
 * FUL-FR-010–011, 040). In order: what needs the customer (only when true),
 * where each item stands, the timeline, then payment, shipments and records,
 * with the detailed activity history last. Opened by the account, the browser
 * that paid, or the order's secure link; anyone else gets 404.
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
  const proofAt = (position: number) => order.proofs.find((proof) => proof.itemPosition === position);
  const scheduled = order.payments;
  const live = order.items.filter((item) => item.status !== "CANCELLED");
  const cancelled = order.summaryStatus === "CANCELLED";

  // 1 · Needs you (FUL-FR-011): only what the customer must do, above everything else.
  const proofsWaiting = cancelled ? [] : order.proofs.filter((proof) => proof.status === "AWAITING_APPROVAL");
  const payNow = !cancelled && scheduled?.next && scheduled.next.status === "DUE" && scheduled.next.payable ? scheduled.next : null;
  const customerHolds = cancelled ? [] : order.items.filter((item) => item.hold?.whoActs === "CUSTOMER");
  const needs = proofsWaiting.length + (payNow ? 1 : 0) + customerHolds.length;
  const dispatched = live.filter((item) => item.status === "DISPATCHED" || item.status === "DELIVERED").length;

  // 3 · Timeline: a few real milestones only (FUL-FR-015, 040).
  const required = order.proofs.filter((proof) => proof.status !== "NOT_REQUIRED");
  const approved = required.filter((proof) => proof.status === "APPROVED").length;
  const deposit = scheduled?.installments.find((part) => part.trigger === "ON_ACCEPTANCE" || part.trigger === "BEFORE_PRODUCTION");
  const balance = scheduled?.installments.find((part) => part.trigger === "BEFORE_DISPATCH");
  const started = live.some((item) => !["AWAITING_PREREQUISITE", "QUEUED"].includes(item.status));
  const made = live.length > 0 && live.every((item) => ["READY_AWAITING_RELEASE", "READY_TO_DISPATCH", "DISPATCHED", "DELIVERED"].includes(item.status));
  const making = live.filter((item) => item.status === "IN_PRODUCTION").length;
  const checking = live.filter((item) => item.status === "QUALITY_CHECK").length;
  const steps: { title: string; meta: string; state: "done" | "now" | "todo" }[] = [
    { title: order.quote ? `Quote V${order.quote.version} accepted` : "Order placed", meta: day(order.placedAt), state: "done" },
    ...(scheduled
      ? deposit
        ? [{ title: `${deposit.label} · ${naira(deposit.amountMinor)}`, meta: deposit.status === "PAID" && deposit.paidAt ? `Paid ${day(deposit.paidAt)}` : "Due now", state: deposit.status === "PAID" ? ("done" as const) : ("now" as const) }]
        : []
      : [{ title: "Paid", meta: order.receipts[0] ? day(order.receipts[0].paidAt) : day(order.placedAt), state: "done" as const }]),
    ...(required.length
      ? [{ title: `Proofs · ${approved} of ${required.length} approved`, meta: proofsWaiting.length ? `${proofsWaiting.length} waiting for you` : approved === required.length ? "All approved" : "Being prepared", state: approved === required.length ? ("done" as const) : ("now" as const) }]
      : []),
    {
      title: "Production + Quality Check",
      meta: made ? "Made and checked" : started ? [making ? `${making} in production` : null, checking ? `${checking} in Quality Check` : null].filter(Boolean).join(" · ") || "Under way" : "Starts once proofs and payment are in",
      state: made ? "done" : started ? "now" : "todo",
    },
    ...(balance ? [{ title: `${balance.label} · ${naira(balance.amountMinor)}`, meta: balance.status === "PAID" && balance.paidAt ? `Paid ${day(balance.paidAt)}` : "Due before dispatch", state: balance.status === "PAID" ? ("done" as const) : made ? ("now" as const) : ("todo" as const) }] : []),
    { title: "Dispatch + delivery", meta: order.deliverTo ?? "Delivery details on your order", state: dispatched === live.length && live.length > 0 ? "done" : dispatched ? "now" : "todo" },
  ];

  const chip = SUMMARY[order.summaryStatus];
  const counts = [`${order.items.length} item${order.items.length === 1 ? "" : "s"}`, needs ? `${needs} need${needs === 1 ? "s" : ""} you` : null, cancelled ? null : dispatched ? `${dispatched} dispatched` : "nothing dispatched yet"].filter(Boolean).join(" · ");

  return (
    <SiteShell>
      <OrderRefresh waiting={!cancelled && order.summaryStatus !== "DELIVERED"} />
      <div className={s.page}>
        <header className={s.head}>
          <div className={s.headText}>
            <p className={s.eyebrow}>
              ORDER {order.number}
              {order.quote ? ` · QUOTE ${order.quote.reference} V${order.quote.version}` : ""} · PLACED {day(order.placedAt).toUpperCase()}
            </p>
            <h1 className={s.title}>{cancelled ? "Your order is cancelled" : order.summaryStatus === "BALANCE_REQUIRED" ? "Balance required" : order.summaryStatus === "ON_HOLD" ? "Your order is on hold" : "Your order"}</h1>
            <p className={s.sub}>{counts}</p>
          </div>
          <StatusChip tone={chip.tone}>{chip.label}</StatusChip>
        </header>

        <div className={s.split}>
          <div className={s.main}>
            {order.cancellation ? (
              <Notice tone="neutral" title={`Cancelled ${day(order.cancellation.at)}${order.cancellation.by === "STAFF" ? " by HolyPearls" : ""}`}>
                {BigInt(order.cancellation.refundDueMinor) > 0n ? `Our finance team will refund ${naira(order.cancellation.refundDueMinor)} to your original payment method. You'll get an email when it's done.` : "Nothing was paid, so there's nothing to refund."}
              </Notice>
            ) : null}

            {needs ? (
              <section className={s.needs} aria-labelledby="needs-title">
                <h2 id="needs-title" className={s.sectionTitle}>
                  Needs you
                </h2>
                <div className={s.cards}>
                  {proofsWaiting.map((proof) => {
                    const item = order.items[proof.itemPosition - 1];
                    return (
                      <article key={proof.id} className={s.attention}>
                        <p className={s.kicker}>
                          <CircleAlert size={18} aria-hidden="true" />
                          NEEDS YOUR APPROVAL
                        </p>
                        <h3 className={s.attTitle}>
                          {item?.productName ?? `Item ${proof.itemPosition}`} — Proof V{proof.versionNumber}
                        </h3>
                        <p className={s.attBody}>{live.length > 1 ? "This item is waiting on your decision. Everything else keeps moving." : "Production starts after you approve it."}</p>
                        <a className={s.action} href={`/orders/${order.id}/proofs/${proof.id}`}>
                          Review proof
                        </a>
                      </article>
                    );
                  })}
                  {payNow ? (
                    <article className={s.attention}>
                      <p className={s.kicker}>
                        <CreditCard size={18} aria-hidden="true" />
                        PAYMENT · {payNow.trigger === "BEFORE_DISPATCH" ? "BEFORE DISPATCH" : "DUE NOW"}
                      </p>
                      <h3 className={s.attTitle}>
                        {payNow.label} {naira(payNow.amountMinor)}
                      </h3>
                      <p className={s.attBody}>{payNow.trigger === "BEFORE_DISPATCH" ? (made ? "Your order is made and checked. It ships once the balance clears." : "Finished items ship once the balance clears.") : "Production starts once this is paid."}</p>
                      <a className={s.action} href="#payments-title">
                        Pay {payNow.label.toLowerCase()}
                      </a>
                    </article>
                  ) : null}
                  {customerHolds.map((item) => (
                    <article key={item.productName + item.summary} className={s.attention}>
                      <p className={s.kicker}>
                        <CircleAlert size={18} aria-hidden="true" />
                        ON HOLD · YOUR ACTION NEEDED
                      </p>
                      <h3 className={s.attTitle}>{item.productName}</h3>
                      <p className={s.attBody}>
                        {item.hold!.explanation}
                        {item.hold!.timingImpactDays ? ` This may add ${item.hold!.timingImpactDays} working day${item.hold!.timingImpactDays === 1 ? "" : "s"}.` : ""}
                      </p>
                      <a className={s.action} href={`/contact?topic=order&order=${encodeURIComponent(order.number)}`}>
                        Reply to us
                      </a>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            <section className={s.panel} aria-labelledby="items-title">
              <h2 id="items-title" className={s.sectionTitle}>
                Where each item stands
              </h2>
              <table className={s.items}>
                <thead>
                  <tr>
                    <th scope="col">Item</th>
                    <th scope="col">Proof</th>
                    <th scope="col">Production</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item, index) => {
                    const proof = proofAt(index + 1);
                    const needsYou = proof?.status === "AWAITING_APPROVAL" && item.status !== "CANCELLED";
                    const status = item.hold ? { label: "ON HOLD", tone: "warning" as const } : needsYou ? { label: "NEEDS YOU", tone: "warning" as const } : ITEM_CHIP[item.status];
                    return (
                      <tr key={`${item.productName}-${index}`}>
                        <td>
                          <span className={s.itemName}>{item.productName}</span>
                          <span className={s.itemQty}>
                            {item.quantity.toLocaleString("en-NG")} pcs · {naira(item.totalMinor)}
                          </span>
                        </td>
                        <td data-label="Proof">{proofCell(proof)}</td>
                        <td data-label="Production">{PRODUCTION[item.status]}</td>
                        <td>
                          <StatusChip tone={status.tone}>{status.label}</StatusChip>
                          {item.hold ? <span className={s.note}>{item.hold.explanation}</span> : item.status === "READY_AWAITING_RELEASE" ? <span className={s.note}>Released when the balance is paid.</span> : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>

            {cancelled ? null : (
              <section className={s.panel} aria-labelledby="timeline-title">
                <h2 id="timeline-title" className={s.sectionTitle}>
                  Timeline
                </h2>
                <ol className={s.timeline}>
                  {steps.map((step) => (
                    <li key={step.title} className={`${s.step} ${s[step.state]}`} aria-current={step.state === "now" ? "step" : undefined}>
                      <span className={s.rail} aria-hidden="true">
                        <span className={s.dot}>{step.state === "done" ? <Check size={12} strokeWidth={3} /> : null}</span>
                        <span className={s.line} />
                      </span>
                      <span className={s.stepText}>
                        <span className={s.stepTitle}>
                          {step.title}
                          <span className="hp-visually-hidden">{step.state === "done" ? " (done)" : step.state === "now" ? " (now)" : " (next)"}</span>
                        </span>
                        <span className={s.stepMeta}>{step.meta}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            <section className={s.panel} aria-label="Activity history">
              <details className={s.activity}>
                <summary>Activity history ({order.activity.length})</summary>
                <ol>
                  {order.activity.map((entry, index) => (
                    <li key={`${entry.at}-${index}`}>
                      <time dateTime={entry.at}>{stamp(entry.at)}</time>
                      <span>{entry.text}</span>
                    </li>
                  ))}
                </ol>
              </details>
            </section>
          </div>

          <aside className={s.side}>
            {scheduled ? (
              <PaymentSummary orderId={order.id} summary={scheduled} />
            ) : (
              <section className={s.panel} aria-labelledby="payments-title">
                <h2 id="payments-title" className={s.sectionTitle}>
                  Payment
                </h2>
                <div className={s.state}>
                  <div className={s.row}>
                    <span>Paid</span>
                    <strong>{naira(order.totals.totalMinor)}</strong>
                  </div>
                  {order.receipts[0] ? <p className={s.muted}>Paid {day(order.receipts[0].paidAt)}</p> : null}
                </div>
              </section>
            )}

            <section className={s.panel} aria-labelledby="shipments-title">
              <h2 id="shipments-title" className={s.sectionTitle}>
                Shipments
              </h2>
              {order.shipments.length ? (
                order.shipments.map((shipment, index) => (
                  <article key={shipment.id} className={s.state} aria-label={`Shipment ${index + 1} of ${order.shipments.length}`}>
                    <div className={s.row}>
                      <strong>
                        Shipment {index + 1} of {order.shipments.length}
                      </strong>
                      <StatusChip tone={SHIPMENT[shipment.status].tone}>{SHIPMENT[shipment.status].label}</StatusChip>
                    </div>
                    <p className={s.muted}>{shipment.items.map((line) => `${line.name} ×${line.quantity.toLocaleString("en-NG")}`).join(" · ")}</p>
                    <p className={s.muted}>{shipment.destination}</p>
                    <p className={s.muted}>
                      {shipment.trackingNumber ? `${shipment.carrier ? `${shipment.carrier} · ` : ""}Tracking ${shipment.trackingNumber}` : "Tracking appears at dispatch"}
                      {shipment.deliveredAt ? ` · Delivered ${day(shipment.deliveredAt)}` : shipment.dispatchedAt ? ` · Dispatched ${day(shipment.dispatchedAt)}` : ""}
                    </p>
                    <details className={s.activity}>
                      <summary>Shipment history</summary>
                      <ol>
                        {shipment.history.map((event, eventIndex) => (
                          <li key={`${event.at}-${eventIndex}`}>
                            <time dateTime={event.at}>{stamp(event.at)}</time>
                            <span>{SHIPMENT[event.status].label}</span>
                          </li>
                        ))}
                      </ol>
                    </details>
                  </article>
                ))
              ) : (
                <p className={s.muted}>
                  <PackageOpen size={16} aria-hidden="true" /> {cancelled ? "Nothing will be shipped." : "Not yet dispatched. Tracking appears here at dispatch."}
                </p>
              )}
            </section>

            <section className={s.panel} aria-labelledby="records-title">
              <h2 id="records-title" className={s.sectionTitle}>
                Records and support
              </h2>
              <ul className={s.links}>
                {order.quote ? (
                  <li>
                    <a href={`/quotes/${order.quote.id}`}>
                      <FileText size={18} aria-hidden="true" />
                      Accepted quote V{order.quote.version}
                    </a>
                  </li>
                ) : null}
                {order.proofs
                  .filter((proof) => proof.status !== "NOT_REQUIRED" && proof.versionNumber)
                  .map((proof) => (
                    <li key={proof.id}>
                      <a href={`/orders/${order.id}/proofs/${proof.id}`}>
                        <FileText size={18} aria-hidden="true" />
                        {order.items[proof.itemPosition - 1]?.productName ?? `Item ${proof.itemPosition}`} · proof V{proof.versionNumber}
                      </a>
                    </li>
                  ))}
                {order.receipts.map((receipt) => (
                  <li key={receipt.id}>
                    <a href={`/orders/${order.id}/receipts/${receipt.id}`}>
                      <Receipt size={18} aria-hidden="true" />
                      Receipt {receipt.number} · {naira(receipt.amountMinor)}
                    </a>
                  </li>
                ))}
                {order.reorderable.map((position) => (
                  <li key={`reorder-${position}`}>
                    <a href={`/orders/${order.id}/items/${position}/reorder`}>
                      <RotateCcw size={18} aria-hidden="true" />
                      Order {order.items[position - 1]?.productName ?? "this"} again
                    </a>
                  </li>
                ))}
                {dispatched ? (
                  <li>
                    <a href={`/orders/${order.id}/problem`}>
                      <CircleAlert size={18} aria-hidden="true" />
                      Report a problem
                    </a>
                  </li>
                ) : null}
                {order.canChangeScope ? (
                  <li>
                    <a href={`/orders/${order.id}/change`}>
                      <Pencil size={18} aria-hidden="true" />
                      Change what you ordered
                    </a>
                  </li>
                ) : null}
                {cancelled ? null : (
                  <li>
                    <a href={`/orders/${order.id}/cancel`}>
                      <XCircle size={18} aria-hidden="true" />
                      {order.cancel.allowed ? "Cancel this order" : "Ask about cancelling"}
                    </a>
                  </li>
                )}
                <li>
                  <a href={`/contact?topic=order&order=${encodeURIComponent(order.number)}`}>
                    <LifeBuoy size={18} aria-hidden="true" />
                    Get help with this order
                  </a>
                </li>
              </ul>
              {order.problems.length ? (
                <>
                  <h3 className={s.stepTitle}>Problems you reported</h3>
                  {order.problems.map((problem) => (
                    <p key={problem.id} className={s.muted}>
                      {problem.number} · {problem.item} · {problem.status === "CLOSED" ? "closed" : problem.status === "TRIAGED" ? "being looked at" : "received"}
                    </p>
                  ))}
                </>
              ) : null}
              {order.changeRequests.length ? (
                <>
                  <h3 className={s.stepTitle}>Changes you asked for</h3>
                  {order.changeRequests.map((request) => (
                    <p key={request.id} className={s.muted}>
                      {request.item ? `${request.item}: ` : ""}
                      {request.description} · {request.status === "OPEN" || request.status === "UNDER_REVIEW" ? "being reviewed" : request.status === "ACCEPTED" ? "accepted" : "declined"}
                      {request.staffNote ? ` · ${request.staffNote}` : ""}
                    </p>
                  ))}
                </>
              ) : null}
            </section>
          </aside>
        </div>
      </div>
    </SiteShell>
  );
}
