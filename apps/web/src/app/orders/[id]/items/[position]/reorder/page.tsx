import { reorderCheckSchema } from "@holypearls/contracts";
import { StatusChip } from "@holypearls/ui";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import s from "../../../../../../components/orders/forms.module.css";
import { ReorderActions } from "../../../../../../components/orders/ReorderActions";
import { SiteShell } from "../../../../../../components/site/SiteShell";
import { naira } from "@holypearls/web-kit/money";
import { serverApi } from "../../../../../../lib/server-api";

export const metadata: Metadata = { title: "Order again", robots: { index: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

/**
 * Order again (Pen 128 · yeNYa: exact FqGmL / ErX5p, states ecICs;
 * FUL-FR-061–062). Each part of what was made is compared with today's
 * catalogue; exact reorder only when every part is still the same.
 */
export default async function ReorderPage({ params }: { params: Promise<{ id: string; position: string }> }) {
  const { id, position } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^\d{1,3}$/.test(position)) notFound();
  const result = await serverApi(`/v1/orders/${id}/items/${position}/reorder`, reorderCheckSchema);
  if (!result.ok) {
    if (result.status === 404 || result.status === 400) notFound();
    throw new Error(result.error.message);
  }
  const check = result.data;
  return (
    <SiteShell>
      <div className={s.page}>
        <div className={s.card}>
          <p className={s.eyebrow}>ORDER {check.orderNumber}</p>
          <h1 className={s.title}>Order again</h1>
          <p className={s.lead}>
            {check.productName} × {check.quantity.toLocaleString("en-NG")}
          </p>
          {check.rows.length ? (
            <dl className={s.facts}>
              {check.rows.map((row) => (
                <div key={row.label} className={s.factRow}>
                  <dt>{row.label}</dt>
                  <dd>
                    <StatusChip tone={row.same ? "success" : "warning"}>{row.same ? "Same" : "Changed"}</StatusChip>
                    {row.note ? <span className={s.hint}> {row.note}</span> : null}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
          {check.exact.available ? (
            <dl className={s.facts}>
              <dt>Exact reorder</dt>
              <dd>Available</dd>
              <dt>Price</dt>
              <dd>{check.priceMinor ? `${naira(check.priceMinor)} (today's price)` : "Priced in your cart"}</dd>
              <dt>Proof</dt>
              <dd>{check.proof === "SKIPPED" ? "Skipped — the product rule allows it" : "Required — the product rule doesn't allow skipping"}</dd>
            </dl>
          ) : (
            <div className={s.blocked} role="status">
              <p className={s.blockedTitle}>Exact reorder isn&apos;t available</p>
              <p className={s.hint}>{check.exact.reason}</p>
            </div>
          )}
          <ReorderActions orderId={check.orderId} position={check.position} exact={check.exact.available} withChanges={check.withChanges} />
        </div>
      </div>
    </SiteShell>
  );
}
