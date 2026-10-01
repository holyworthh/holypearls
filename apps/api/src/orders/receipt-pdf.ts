import type { Receipt } from "@holypearls/contracts";
import * as mupdf from "mupdf";

/*
 * The receipt as a PDF (PAY-FR-006, TECH-05 §9), made from the receipt record
 * every time, so it always matches the page. MuPDF lays out a small HTML
 * document and writes it as PDF. Its built-in font has no naira sign, so
 * amounts read "NGN 47,300.00", as on bank statements.
 */

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function amount(minor: string, currency: string) {
  const value = BigInt(minor);
  const whole = value / 100n;
  const fraction = (value % 100n).toString().padStart(2, "0");
  return `${currency} ${whole.toLocaleString("en-NG")}.${fraction}`;
}

const date = (iso: string) => new Date(iso).toLocaleString("en-NG", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" });

const CHANNEL: Record<string, string> = { card: "Card", bank_transfer: "Bank transfer", ussd: "USSD", apple_pay: "Apple Pay", bank: "Bank" };

export function receiptHtml(receipt: Receipt): string {
  const rows = receipt.lines
    .map((line) => `<tr><td>${escape(line.label)}</td><td class="n">${line.quantity ?? ""}</td><td class="n">${amount(line.totalMinor, receipt.currency)}</td></tr>`)
    .join("");
  const totals = receipt.totals
    ? `<tr><td colspan="2">Subtotal</td><td class="n">${amount(receipt.totals.goodsMinor, receipt.currency)}</td></tr>` +
      (receipt.totals.deliveryMinor ? `<tr><td colspan="2">Delivery</td><td class="n">${amount(receipt.totals.deliveryMinor, receipt.currency)}</td></tr>` : "") +
      `<tr><td colspan="2">VAT ${(receipt.totals.vatRateBps / 100).toLocaleString("en-NG")}%</td><td class="n">${amount(receipt.totals.vatMinor, receipt.currency)}</td></tr>`
    : "";
  return `<html><head><style>
    body { font-family: sans-serif; font-size: 10pt; color: #17150F; margin: 0; }
    h1 { font-size: 18pt; margin: 0 0 4pt; }
    .muted { color: #4A453B; }
    table { width: 100%; border-collapse: collapse; margin-top: 12pt; }
    td { padding: 5pt 0; border-bottom: 0.5pt solid #E6E6E1; vertical-align: top; }
    td.n { text-align: right; white-space: nowrap; padding-left: 12pt; }
    tr.total td { font-weight: bold; border-bottom: none; padding-top: 8pt; }
    dl { margin: 12pt 0 0; }
    dt { color: #4A453B; margin-top: 6pt; }
    dd { margin: 0; }
  </style></head><body>
    <p class="muted">HolyPearls</p>
    <h1>Receipt ${escape(receipt.number)}</h1>
    <p class="muted">Payment received ${escape(date(receipt.paidAt))}</p>
    <dl>
      ${receipt.orderNumber ? `<dt>Order</dt><dd>${escape(receipt.orderNumber)}</dd>` : ""}
      <dt>Paid by</dt><dd>${escape(receipt.payer.name)} · ${escape(receipt.payer.email)}</dd>
      <dt>Method</dt><dd>${escape(receipt.channel ? (CHANNEL[receipt.channel] ?? receipt.channel) : "Paystack")}</dd>
      <dt>Paystack reference</dt><dd>${escape(receipt.paystackReference)}</dd>
    </dl>
    <table>${rows}${totals}<tr class="total"><td colspan="2">Paid</td><td class="n">${amount(receipt.amountMinor, receipt.currency)}</td></tr></table>
    <p class="muted">This receipt is generated from HolyPearls' payment record. Keep it for your records.</p>
  </body></html>`;
}

/** A4 PDF bytes for the receipt. */
export function receiptPdf(receipt: Receipt): Uint8Array {
  const source = mupdf.Document.openDocument(Buffer.from(receiptHtml(receipt), "utf8"), "text/html");
  // A4 in points, with the page margin applied by the layout box.
  source.layout(595 - 96, 842 - 96, 10);
  const buffer = new mupdf.Buffer();
  const writer = new mupdf.DocumentWriter(buffer, "pdf", "");
  for (let index = 0; index < source.countPages(); index += 1) {
    const page = source.loadPage(index);
    const device = writer.beginPage([0, 0, 595, 842]);
    page.run(device, mupdf.Matrix.translate(48, 48));
    writer.endPage();
  }
  writer.close();
  return buffer.asUint8Array();
}
