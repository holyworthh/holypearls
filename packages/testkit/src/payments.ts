import { type InitializeInput, type PaymentGateway, PaymentStartError, type RefundInput, RefundRefusedError, type RefundResult, signatureMatches, paystackSignature, type VerifyResult } from "@holypearls/payments";

const FAKE_SECRET = "sk_test_fake_gateway_for_tests_only";

interface FakeTransaction {
  input: InitializeInput;
  result: VerifyResult;
}

/**
 * A payment provider for tests (TECH-05 §16): no network, and the test
 * decides what Paystack would say. Webhooks are signed the way Paystack signs
 * them, with a fake secret, so the real signature check runs.
 */
export class FakeGateway implements PaymentGateway {
  readonly name = "fake";
  readonly transactions = new Map<string, FakeTransaction>();
  /** Set to make the next initialize fail as if Paystack refused it. */
  failNextInitialize = false;
  verifyCalls = 0;
  /** The next this many verify calls time out, as if Paystack did not answer. */
  verifyFailures = 0;
  /** Refunds Paystack holds, by its refund id, with the transaction they belong to. */
  readonly refunds = new Map<string, RefundResult & { reference: string; input: RefundInput }>();
  /** The next refund request: refused (Paystack says no) or lost (created at Paystack, but no answer reached us). */
  nextRefund: "refuse" | "lose" | null = null;
  private refundIds = 3_018_000;

  async initialize(input: InitializeInput) {
    if (this.failNextInitialize) {
      this.failNextInitialize = false;
      throw new PaymentStartError("Fake gateway refused the transaction");
    }
    this.transactions.set(input.reference, {
      input,
      result: { status: "abandoned", amountMinor: input.amountMinor, currency: input.currency, channel: null, paidAt: null, gatewayResponse: null, providerStatus: "abandoned" },
    });
    return { accessCode: `fake-${input.reference}`, authorizationUrl: `https://checkout.paystack.com/fake-${input.reference}` };
  }

  async verify(reference: string): Promise<VerifyResult> {
    this.verifyCalls += 1;
    if (this.verifyFailures > 0) {
      this.verifyFailures -= 1;
      throw new Error("Paystack timed out");
    }
    const transaction = this.transactions.get(reference);
    if (!transaction) return { status: "not_found", amountMinor: null, currency: null, channel: null, paidAt: null, gatewayResponse: "Transaction reference not found", providerStatus: null };
    return transaction.result;
  }

  verifyWebhook(rawBody: Buffer, signature: string | undefined) {
    return signatureMatches(FAKE_SECRET, rawBody, signature);
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const outcome = this.nextRefund;
    this.nextRefund = null;
    if (outcome === "refuse") throw new RefundRefusedError("Transaction has been fully reversed");
    const transaction = this.transactions.get(input.reference);
    if (!transaction || transaction.result.status !== "success") throw new RefundRefusedError("Transaction not found or not successful");
    const refund = { providerRefundId: String((this.refundIds += 1)), status: "pending" as const, providerStatus: "pending", amountMinor: input.amountMinor, reference: input.reference, input };
    this.refunds.set(refund.providerRefundId, refund);
    if (outcome === "lose") throw new Error("Paystack refund request timed out");
    return this.view(refund);
  }

  async refundStatus(providerRefundId: string): Promise<RefundResult> {
    const refund = this.refunds.get(providerRefundId);
    if (!refund) throw new Error(`No fake refund ${providerRefundId}`);
    return this.view(refund);
  }

  async listRefunds(reference: string): Promise<RefundResult[]> {
    return [...this.refunds.values()].filter((refund) => refund.reference === reference).map((refund) => this.view(refund));
  }

  /** What Paystack will report for this refund from now on. */
  settleRefund(providerRefundId: string, status: RefundResult["status"]) {
    const refund = this.refunds.get(providerRefundId);
    if (!refund) throw new Error(`No fake refund ${providerRefundId}`);
    Object.assign(refund, { status, providerStatus: status });
  }

  private view(refund: RefundResult): RefundResult {
    return { providerRefundId: refund.providerRefundId, status: refund.status, providerStatus: refund.providerStatus, amountMinor: refund.amountMinor };
  }

  /** A refund webhook as Paystack sends it: the refund's id and the original transaction's reference. */
  refundWebhook(event: "refund.pending" | "refund.processed" | "refund.failed", providerRefundId: string) {
    const refund = this.refunds.get(providerRefundId);
    const body = Buffer.from(JSON.stringify({ event, data: { id: Number(providerRefundId), status: event.slice("refund.".length), transaction_reference: refund?.reference ?? null, amount: Number(refund?.amountMinor ?? 0) } }));
    return { body, signature: paystackSignature(FAKE_SECRET, body) };
  }

  /** What Paystack will report for this reference from now on. Defaults to what was asked for. */
  settle(reference: string, outcome: { status: VerifyResult["status"]; amountMinor?: bigint; currency?: string; channel?: string }) {
    const transaction = this.transactions.get(reference);
    if (!transaction) throw new Error(`No fake transaction ${reference}`);
    transaction.result = {
      status: outcome.status,
      amountMinor: outcome.amountMinor ?? transaction.input.amountMinor,
      currency: outcome.currency ?? transaction.input.currency,
      channel: outcome.channel ?? "card",
      paidAt: outcome.status === "success" ? new Date() : null,
      gatewayResponse: outcome.status === "success" ? "Approved" : outcome.status === "failed" ? "Declined" : null,
      providerStatus: outcome.status,
    };
  }

  /** A webhook body and signature as Paystack would send them. */
  webhook(event: string, reference: string, options: { id?: number; signedWith?: string; data?: object } = {}) {
    const body = Buffer.from(JSON.stringify({ event, data: { id: options.id ?? Math.floor(Math.random() * 1e9), reference, status: event === "charge.success" ? "success" : "failed", ...options.data } }));
    return { body, signature: paystackSignature(options.signedWith ?? FAKE_SECRET, body) };
  }
}
