import { type InitializeInput, type PaymentGateway, PaymentStartError, signatureMatches, paystackSignature, type VerifyResult } from "@holypearls/payments";

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
    const transaction = this.transactions.get(reference);
    if (!transaction) return { status: "not_found", amountMinor: null, currency: null, channel: null, paidAt: null, gatewayResponse: "Transaction reference not found", providerStatus: null };
    return transaction.result;
  }

  verifyWebhook(rawBody: Buffer, signature: string | undefined) {
    return signatureMatches(FAKE_SECRET, rawBody, signature);
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
  webhook(event: string, reference: string, options: { id?: number; signedWith?: string } = {}) {
    const body = Buffer.from(JSON.stringify({ event, data: { id: options.id ?? Math.floor(Math.random() * 1e9), reference, status: event === "charge.success" ? "success" : "failed" } }));
    return { body, signature: paystackSignature(options.signedWith ?? FAKE_SECRET, body) };
  }
}
