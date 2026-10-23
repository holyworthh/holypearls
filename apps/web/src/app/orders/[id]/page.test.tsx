import type { Order, PaymentSummary as Summary } from "@holypearls/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";
import OrderPage from "./page";
import { PaymentSummary } from "../../../components/sales/PaymentSummary";

const api = vi.hoisted(() => vi.fn());
vi.mock("../../../lib/server-api", () => ({ serverApi: api }));
vi.mock("../../../components/site/SiteShell", () => ({ SiteShell: ({ children }: { children: ReactNode }) => children }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), notFound: () => { throw new Error("not found"); } }));
vi.mock("../../../lib/paystack", () => ({ openPaystack: vi.fn(), startInstallmentPayment: vi.fn() }));

const order: Order = {
  id: "0190c5b3-0000-7000-8000-000000000001", number: "TEST-ORDER", placedAt: "2026-10-10T10:00:00Z", paymentStatus: "PAYMENT_RESOLUTION_REQUIRED", summaryStatus: "CONFIRMED",
  items: [], totals: { goodsMinor: "10000", deliveryMinor: "0", vatMinor: "0", totalMinor: "10000", vatRateBps: 0 }, currency: "USD", contactName: "Test Customer", deliverTo: null,
  receipts: [{ id: "test-receipt", number: "TEST-RECEIPT", amountMinor: "10000", currency: "USD", paidAt: "2026-10-10T10:00:00Z", channel: null, paystackReference: "test-reference" }],
  payments: null, quote: null, proofs: [], changeRequests: [], cancellation: null, cancel: { allowed: false, blockedBy: null, refundMinor: "0" }, canChangeScope: false, shipments: [], problems: [], reorderable: [], activity: [],
};

it("shows an open payment review even when the direct order has a paid receipt", async () => {
  api.mockResolvedValue({ ok: true, data: order });
  const html = renderToStaticMarkup(await OrderPage({ params: Promise.resolve({ id: order.id }) }));
  expect(html).toContain("PAYMENT CHECK NEEDED");
  expect(html).toContain("contact");
  expect(html).toContain("$100");
  expect(html).not.toContain("₦");
});

it("uses the schedule currency for every amount and payment action", () => {
  const part = { id: "test-part", position: 1, label: "Balance", amountMinor: "10000", trigger: "BEFORE_DISPATCH" as const, dueOn: null, status: "DUE" as const, paidAt: null, payable: true };
  const summary: Summary = { currency: "USD", totalMinor: "20000", paidMinor: "10000", remainingMinor: "10000", next: part, installments: [part] };
  const html = renderToStaticMarkup(<PaymentSummary orderId={order.id} summary={summary} />);
  expect(html).toContain("$200");
  expect(html).toContain("Pay balance · $100");
  expect(html).not.toContain("₦");
});
