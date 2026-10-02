import { orderSchema } from "@holypearls/contracts";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import s from "../../../../components/orders/forms.module.css";
import { ProblemForm } from "../../../../components/orders/ProblemForm";
import { SiteShell } from "../../../../components/site/SiteShell";
import { serverApi } from "../../../../lib/server-api";

export const metadata: Metadata = { title: "Report a problem", robots: { index: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

/**
 * Report a problem (Pen 129 · K8asLI / xV8w0; FUL-FR-070). Same access as the
 * order: a guest's link opens only that order; anyone else gets 404.
 */
export default async function ProblemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const result = await serverApi(`/v1/orders/${id}`, orderSchema);
  if (!result.ok) {
    if (result.status === 404 || result.status === 400) notFound();
    throw new Error(result.error.message);
  }
  const order = result.data;
  return (
    <SiteShell>
      <div className={s.page}>
        <div className={s.card}>
          <p className={s.eyebrow}>
            ORDER {order.number} · {order.summaryStatus.replaceAll("_", " ")}
          </p>
          <h1 className={s.title}>Report a problem</h1>
          <ProblemForm orderId={order.id} items={order.items.map((item, index) => ({ position: index + 1, label: `${item.productName} × ${item.quantity.toLocaleString("en-NG")}`, quantity: item.quantity }))} />
        </div>
      </div>
    </SiteShell>
  );
}
