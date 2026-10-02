import { orderSchema } from "@holypearls/contracts";
import { ButtonLink, StatusChip } from "@holypearls/ui";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CancelForm } from "../../../../components/orders/CancelForm";
import s from "../../../../components/orders/forms.module.css";
import { SiteShell } from "../../../../components/site/SiteShell";
import { naira } from "../../../../lib/money";
import { serverApi } from "../../../../lib/server-api";

export const metadata: Metadata = { title: "Cancel your order", robots: { index: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

/**
 * Cancel an order (Pen 127 · AnFEQ allowed, C6TAE blocked; FUL-FR-050–051).
 * Before production the customer can cancel and the refund is shown; after
 * that it can't be done online and they contact us.
 */
export default async function CancelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const result = await serverApi(`/v1/orders/${id}`, orderSchema);
  if (!result.ok) {
    if (result.status === 404 || result.status === 400) notFound();
    throw new Error(result.error.message);
  }
  const order = result.data;
  const what = order.items.length === 1 ? `${order.items[0]!.productName.toUpperCase()} × ${order.items[0]!.quantity.toLocaleString("en-NG")}` : `${order.items.length} ITEMS`;
  const refund = BigInt(order.cancel.refundMinor);
  const channel = order.receipts[0]?.channel;
  return (
    <SiteShell>
      <div className={s.page}>
        <div className={s.card}>
          <p className={s.eyebrow}>
            ORDER {order.number} · {what}
          </p>
          <h1 className={s.title}>{order.cancel.allowed ? "Cancel this order?" : "Cancel this order"}</h1>
          <StatusChip tone={order.cancel.allowed ? "neutral" : "info"}>{order.summaryStatus}</StatusChip>
          {order.cancel.allowed ? (
            <>
              <dl className={s.facts}>
                <dt>Paid</dt>
                <dd>{refund > 0n ? `${naira(order.cancel.refundMinor)}${channel ? ` (${channel[0]!.toUpperCase()}${channel.slice(1)})` : ""}` : "Nothing yet"}</dd>
                <dt>Refund</dt>
                <dd>{refund > 0n ? `${naira(order.cancel.refundMinor)} to the original payment method` : "Nothing to refund"}</dd>
              </dl>
              {refund > 0n ? <p className={s.hint}>Refunds are issued by our finance team through Paystack. Banks usually take a few working days.</p> : null}
              <CancelForm orderId={order.id} />
            </>
          ) : (
            <>
              <div className={s.blocked} role="status">
                <p className={s.blockedTitle}>{order.cancel.blockedBy === "CANCELLED" ? "This order is already cancelled" : "Cancellation isn't available"}</p>
                <p className={s.hint}>
                  {order.cancel.blockedBy === "PAYMENT_IN_PROGRESS"
                    ? "A payment on this order is being processed. Try again once it has finished."
                    : order.cancel.blockedBy === "CANCELLED"
                      ? "Nothing else to do here."
                      : order.cancel.blockedBy === "DISPATCHED"
                        ? "Part of this order has already been dispatched, so it can't be cancelled online. Contact us to talk about your options."
                        : "Production has started, so this order can't be cancelled online. Contact us to talk about your options."}
                </p>
              </div>
              <div className={s.actions}>
                {order.cancel.blockedBy === "CANCELLED" ? null : <ButtonLink href={`/contact?topic=cancellation&order=${encodeURIComponent(order.number)}`}>Contact support</ButtonLink>}
                <ButtonLink href={`/orders/${order.id}`} variant="secondary">
                  Back to order
                </ButtonLink>
              </div>
              {order.cancel.blockedBy === "CANCELLED" ? null : <p className={s.hint}>Your message includes this order automatically.</p>}
            </>
          )}
        </div>
      </div>
    </SiteShell>
  );
}
