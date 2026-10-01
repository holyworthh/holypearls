import { receiptSchema } from "@holypearls/contracts";
import { ButtonLink } from "@holypearls/ui";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteShell } from "../../../../../components/site/SiteShell";
import { naira, percent } from "../../../../../lib/money";
import { serverApi } from "../../../../../lib/server-api";
import styles from "../../order.module.css";

export const metadata: Metadata = { title: "Receipt", robots: { index: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

const CHANNEL: Record<string, string> = { card: "Card", bank_transfer: "Bank transfer", ussd: "USSD", apple_pay: "Apple Pay", bank: "Bank" };

/**
 * A receipt (PAY-FR-006, TECH-05 §9), made from the receipt record; the PDF is
 * made from the same record. No Pen frame: built from the order page's
 * patterns (recorded in docs/reports/T04-05.md).
 */
export default async function ReceiptPage({ params }: { params: Promise<{ id: string; receiptId: string }> }) {
  const { id, receiptId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^[0-9a-f-]{36}$/.test(receiptId)) notFound();
  const result = await serverApi(`/v1/orders/${id}/receipts/${receiptId}`, receiptSchema);
  if (!result.ok) {
    if (result.status === 404 || result.status === 400) notFound();
    throw new Error(result.error.message);
  }
  const receipt = result.data;
  const paid = new Date(receipt.paidAt).toLocaleString("en-NG", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" });

  return (
    <SiteShell>
      <main id="main" className={styles.page}>
        <div className={styles.column}>
          <p className={styles.eyebrow}>{receipt.orderNumber ? `ORDER ${receipt.orderNumber}` : "PAYMENT"}</p>
          <h1 className={styles.title}>Receipt {receipt.number}</h1>
          <section className={styles.receipt} aria-label="Receipt details">
            <dl className={styles.facts}>
              <dt>Paid</dt>
              <dd>{paid}</dd>
              <dt>Paid by</dt>
              <dd>
                {receipt.payer.name} · {receipt.payer.email}
              </dd>
              <dt>Method</dt>
              <dd>{receipt.channel ? (CHANNEL[receipt.channel] ?? receipt.channel) : "Paystack"}</dd>
              <dt>Paystack reference</dt>
              <dd>{receipt.paystackReference}</dd>
            </dl>
            <table className={styles.lines}>
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col" className={styles.num}>
                    Qty
                  </th>
                  <th scope="col" className={styles.num}>
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {receipt.lines.map((line) => (
                  <tr key={line.label}>
                    <td>{line.label}</td>
                    <td className={styles.num}>{line.quantity?.toLocaleString("en-NG") ?? ""}</td>
                    <td className={styles.num}>{naira(line.totalMinor)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                {receipt.totals ? (
                  <>
                    <tr>
                      <td colSpan={2}>Subtotal</td>
                      <td className={styles.num}>{naira(receipt.totals.goodsMinor)}</td>
                    </tr>
                    {receipt.totals.deliveryMinor ? (
                      <tr>
                        <td colSpan={2}>Delivery</td>
                        <td className={styles.num}>{naira(receipt.totals.deliveryMinor)}</td>
                      </tr>
                    ) : null}
                    <tr>
                      <td colSpan={2}>VAT {percent(receipt.totals.vatRateBps)}</td>
                      <td className={styles.num}>{naira(receipt.totals.vatMinor)}</td>
                    </tr>
                  </>
                ) : null}
                <tr className={styles.paid}>
                  <td colSpan={2}>Paid</td>
                  <td className={styles.num}>{naira(receipt.amountMinor)}</td>
                </tr>
              </tfoot>
            </table>
          </section>
          <div className={styles.actions}>
            <ButtonLink href={`/api/v1/orders/${id}/receipts/${receipt.id}/pdf`} download>
              Download PDF
            </ButtonLink>
            <ButtonLink href={`/orders/${id}`} variant="secondary">
              Back to your order
            </ButtonLink>
          </div>
        </div>
      </main>
    </SiteShell>
  );
}
