import { orderSchema } from "@holypearls/contracts";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ScopeChangeForm } from "../../../../components/orders/ScopeChangeForm";
import s from "../../../../components/orders/forms.module.css";
import { SiteShell } from "../../../../components/site/SiteShell";
import { serverApi } from "../../../../lib/server-api";

export const metadata: Metadata = { title: "Change what you ordered", robots: { index: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

/**
 * Scope change after a quote is accepted (Pen 127 · BKgfl; FUL-FR-052). It
 * opens a change request; the accepted quote is never edited, and a priced
 * change comes back as a new quote version to accept.
 */
export default async function ChangePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const result = await serverApi(`/v1/orders/${id}`, orderSchema);
  if (!result.ok) {
    if (result.status === 404 || result.status === 400) notFound();
    throw new Error(result.error.message);
  }
  const order = result.data;
  if (!order.canChangeScope || !order.quote) redirect(`/orders/${order.id}`);
  return (
    <SiteShell>
      <div className={s.page}>
        <div className={s.card}>
          <p className={s.eyebrow}>
            ORDER {order.number} · FROM ACCEPTED QUOTE {order.quote.reference} V{order.quote.version}
          </p>
          <h1 className={s.title}>Change what you ordered</h1>
          <div className={s.how}>
            <p className={s.blockedTitle}>How changes work</p>
            <p className={s.hint}>Your accepted quote V{order.quote.version} won&apos;t be edited. If the change affects the price, we&apos;ll send a new quote version to accept.</p>
          </div>
          <ScopeChangeForm orderId={order.id} />
        </div>
      </div>
    </SiteShell>
  );
}
