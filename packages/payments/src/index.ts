import { createHmac, timingSafeEqual } from "node:crypto";

/*
 * The payment provider behind one interface (TECH-05, ADR-011). Paystack is
 * the only provider at launch; the fake gateway in packages/testkit lets every
 * rule be tested without calling it. Card details never reach HolyPearls:
 * the customer pays on Paystack's hosted checkout (TECH-05 §15).
 */

export type PaymentChannel = "card" | "bank_transfer" | "ussd" | "apple_pay";

export interface InitializeInput {
  /** HPPAY-<uuid>, unique per attempt (TECH-05 §5). */
  reference: string;
  /** Whole minor units (kobo or cents), worked out by the server. */
  amountMinor: bigint;
  currency: "NGN" | "USD";
  email: string;
  channels: PaymentChannel[];
  /** Where Paystack sends the customer back to; not proof of payment. */
  callbackUrl: string;
  /** IDs only: the intent and the order or quote reference. */
  metadata: Record<string, string>;
}

export interface InitializeResult {
  accessCode: string;
  authorizationUrl: string;
}

/**
 * Paystack's answer for one transaction. `pending` covers everything that
 * isn't final yet (ongoing, pending, processing, queued).
 */
export interface VerifyResult {
  status: "success" | "failed" | "abandoned" | "pending" | "not_found";
  amountMinor: bigint | null;
  currency: string | null;
  channel: string | null;
  paidAt: Date | null;
  /** The provider's own wording, for staff (PAY-FR-010). */
  gatewayResponse: string | null;
  /** The provider's raw status word, kept with each check. */
  providerStatus: string | null;
}

/** One refund as Paystack reports it (TECH-05 §11). Anything not final yet is `pending`. */
export interface RefundResult {
  providerRefundId: string;
  status: "pending" | "processed" | "failed";
  /** The provider's raw status word, kept with each check. */
  providerStatus: string;
  amountMinor: bigint | null;
}

export interface RefundInput {
  /** The original attempt's HPPAY reference. */
  reference: string;
  amountMinor: bigint;
  currency: "NGN" | "USD";
  /** Staff's reason, kept with the refund at Paystack. */
  note: string;
}

export interface PaymentGateway {
  readonly name: string;
  initialize(input: InitializeInput): Promise<InitializeResult>;
  verify(reference: string): Promise<VerifyResult>;
  /** Asks for a full or partial refund. Throws RefundRefusedError when Paystack says no; any other error means the outcome is unknown. */
  refund(input: RefundInput): Promise<RefundResult>;
  refundStatus(providerRefundId: string): Promise<RefundResult>;
  /** The refunds Paystack holds for a transaction, to find one whose request had no clear answer. */
  listRefunds(reference: string): Promise<RefundResult[]>;
  /** True when the webhook's signature header matches its raw body. */
  verifyWebhook(rawBody: Buffer, signature: string | undefined): boolean;
}

/** The provider couldn't create the transaction at all (TECH-05 §5: the attempt fails, the intent reopens). */
export class PaymentStartError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentStartError";
  }
}

/** Paystack answered and refused the refund (for example, more than is left): it was not created. */
export class RefundRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RefundRefusedError";
  }
}

/** Paystack's refund status words: processed and failed are final; pending, processing and needs-attention aren't. */
export function refundStatusWord(word: string | null | undefined): RefundResult["status"] {
  if (word === "processed") return "processed";
  if (word === "failed") return "failed";
  return "pending";
}

/** HMAC SHA-512 of the raw body with the secret key, as Paystack signs webhooks (TECH-02 §9). */
export function paystackSignature(secretKey: string, rawBody: Buffer): string {
  return createHmac("sha512", secretKey).update(rawBody).digest("hex");
}

export function signatureMatches(secretKey: string, rawBody: Buffer, signature: string | undefined): boolean {
  if (!signature || !/^[0-9a-f]{128}$/i.test(signature)) return false;
  const expected = Buffer.from(paystackSignature(secretKey, rawBody), "hex");
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}

const PENDING_WORDS = new Set(["ongoing", "pending", "processing", "queued"]);

/** Paystack's transaction status, in the words the payment rules use. */
export function paystackStatus(word: string | null | undefined): VerifyResult["status"] {
  if (word === "success") return "success";
  if (word === "failed" || word === "reversed") return "failed";
  if (word === "abandoned") return "abandoned";
  if (word && PENDING_WORDS.has(word)) return "pending";
  return "pending";
}

interface PaystackEnvelope<T> {
  status: boolean;
  message?: string;
  data?: T;
}

export interface PaystackOptions {
  secretKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

/** Paystack's transaction API (initialize and verify) and webhook signatures. */
export class PaystackGateway implements PaymentGateway {
  readonly name = "paystack";
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: PaystackOptions) {
    this.baseUrl = options.baseUrl ?? "https://api.paystack.co";
    this.fetcher = options.fetch ?? fetch;
  }

  /** True for a test-mode key (sk_test_). */
  get testMode() {
    return this.options.secretKey.startsWith("sk_test_");
  }

  private async call<T>(method: "GET" | "POST", path: string, body?: object): Promise<{ httpStatus: number; envelope: PaystackEnvelope<T> }> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      method,
      headers: { authorization: `Bearer ${this.options.secretKey}`, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(this.options.timeoutMs ?? 15_000),
    });
    const envelope = (await response.json().catch(() => ({ status: false, message: "Unreadable response" }))) as PaystackEnvelope<T>;
    return { httpStatus: response.status, envelope };
  }

  async initialize(input: InitializeInput): Promise<InitializeResult> {
    const result = await this.call<{ access_code: string; authorization_url: string }>("POST", "/transaction/initialize", {
        email: input.email,
        amount: input.amountMinor.toString(),
        currency: input.currency,
        reference: input.reference,
        callback_url: input.callbackUrl,
        channels: input.channels,
        metadata: input.metadata,
    });
    const data = result.envelope.data;
    if (!result.envelope.status || !data?.access_code || !data.authorization_url) {
      const message = `Paystack initialization failed (${result.httpStatus}): ${result.envelope.message ?? "no message"}`;
      // A lost response or duplicate reference may already represent a transaction.
      if (result.httpStatus >= 400 && result.httpStatus < 500 && result.httpStatus !== 409 && !/duplicate|already|reference.*exist/i.test(result.envelope.message ?? "")) throw new PaymentStartError(message);
      throw new Error(message);
    }
    return { accessCode: data.access_code, authorizationUrl: data.authorization_url };
  }

  async verify(reference: string): Promise<VerifyResult> {
    const { httpStatus, envelope } = await this.call<{
      status: string;
      amount: number;
      currency: string;
      channel: string | null;
      paid_at: string | null;
      gateway_response: string | null;
    }>("GET", `/transaction/verify/${encodeURIComponent(reference)}`);
    if (httpStatus === 404 || (httpStatus === 400 && /not found/i.test(envelope.message ?? ""))) {
      return { status: "not_found", amountMinor: null, currency: null, channel: null, paidAt: null, gatewayResponse: envelope.message ?? null, providerStatus: null };
    }
    // Anything else unexpected is thrown, so the job retries rather than guessing (PAY-FR-009).
    if (!envelope.status || !envelope.data) throw new Error(`Paystack verify failed (${httpStatus}): ${envelope.message ?? "no message"}`);
    const data = envelope.data;
    return {
      status: paystackStatus(data.status),
      amountMinor: BigInt(data.amount),
      currency: data.currency,
      channel: data.channel ?? null,
      paidAt: data.paid_at ? new Date(data.paid_at) : null,
      gatewayResponse: data.gateway_response ?? null,
      providerStatus: data.status,
    };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const { httpStatus, envelope } = await this.call<PaystackRefund>("POST", "/refund", {
      transaction: input.reference,
      amount: input.amountMinor.toString(),
      currency: input.currency,
      merchant_note: input.note.slice(0, 200),
    });
    if (envelope.status && envelope.data) return refundResult(envelope.data);
    // A clear "no" from Paystack: nothing was created. A server error or timeout stays unknown (thrown as is).
    if (httpStatus >= 400 && httpStatus < 500) throw new RefundRefusedError(envelope.message ?? `Paystack refused the refund (${httpStatus})`);
    throw new Error(`Paystack refund failed (${httpStatus}): ${envelope.message ?? "no message"}`);
  }

  async refundStatus(providerRefundId: string): Promise<RefundResult> {
    const { httpStatus, envelope } = await this.call<PaystackRefund>("GET", `/refund/${encodeURIComponent(providerRefundId)}`);
    if (!envelope.status || !envelope.data) throw new Error(`Paystack refund check failed (${httpStatus}): ${envelope.message ?? "no message"}`);
    return refundResult(envelope.data);
  }

  async listRefunds(reference: string): Promise<RefundResult[]> {
    const { httpStatus, envelope } = await this.call<PaystackRefund[]>("GET", `/refund?transaction=${encodeURIComponent(reference)}&perPage=100`);
    if (!envelope.status || !Array.isArray(envelope.data)) throw new Error(`Paystack refund list failed (${httpStatus}): ${envelope.message ?? "no message"}`);
    return envelope.data.map(refundResult);
  }

  verifyWebhook(rawBody: Buffer, signature: string | undefined): boolean {
    return signatureMatches(this.options.secretKey, rawBody, signature);
  }
}

interface PaystackRefund {
  id: number | string;
  status: string;
  amount?: number | string | null;
}

const refundResult = (data: PaystackRefund): RefundResult => ({
  providerRefundId: String(data.id),
  status: refundStatusWord(data.status),
  providerStatus: data.status,
  amountMinor: data.amount === undefined || data.amount === null ? null : BigInt(data.amount),
});

/** The gateway for this environment, or null when no key is set (payments then show as not available). */
export function createPaymentGateway(env: { PAYSTACK_SECRET_KEY?: string }): PaymentGateway | null {
  return env.PAYSTACK_SECRET_KEY ? new PaystackGateway({ secretKey: env.PAYSTACK_SECRET_KEY }) : null;
}
