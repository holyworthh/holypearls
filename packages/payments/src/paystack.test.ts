import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PaymentStartError, PaystackGateway, paystackSignature, paystackStatus, signatureMatches } from "./index.js";

const reply = (status: number, body: object) => async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("Paystack adapter", () => {
  it("signs webhooks with HMAC SHA-512 and rejects anything else (TECH-02 §9)", () => {
    const body = Buffer.from(JSON.stringify({ event: "charge.success", data: { reference: "HPPAY-1" } }));
    const signature = paystackSignature("sk_test_secret", body);
    expect(signatureMatches("sk_test_secret", body, signature)).toBe(true);
    expect(signatureMatches("sk_test_other", body, signature)).toBe(false);
    expect(signatureMatches("sk_test_secret", Buffer.from(`${body.toString()} `), signature)).toBe(false);
    expect(signatureMatches("sk_test_secret", body, undefined)).toBe(false);
    expect(signatureMatches("sk_test_secret", body, "abc")).toBe(false);
  });

  it("maps Paystack's status words, treating unfinished ones as pending", () => {
    expect(paystackStatus("success")).toBe("success");
    expect(paystackStatus("failed")).toBe("failed");
    expect(paystackStatus("reversed")).toBe("failed");
    expect(paystackStatus("abandoned")).toBe("abandoned");
    for (const word of ["ongoing", "pending", "processing", "queued", "something-new"]) expect(paystackStatus(word)).toBe("pending");
  });

  it("sends the server's amount in minor units with the chosen channels", async () => {
    let sent: Record<string, unknown> = {};
    const gateway = new PaystackGateway({
      secretKey: "sk_test_x",
      fetch: async (_url, init) => {
        sent = JSON.parse(String(init?.body));
        return reply(200, { status: true, data: { access_code: "AC", authorization_url: "https://checkout.paystack.com/AC" } })();
      },
    });
    const result = await gateway.initialize({ reference: "HPPAY-1", amountMinor: 6093750n, currency: "NGN", email: "a@b.co", channels: ["card", "bank_transfer"], callbackUrl: "https://x/cb", metadata: { intentId: "i" } });
    expect(result).toEqual({ accessCode: "AC", authorizationUrl: "https://checkout.paystack.com/AC" });
    expect(sent).toMatchObject({ amount: "6093750", currency: "NGN", reference: "HPPAY-1", channels: ["card", "bank_transfer"] });
  });

  it("distinguishes a definite refusal from an ambiguous initialization failure", async () => {
    const refused = new PaystackGateway({ secretKey: "sk_test_x", fetch: reply(400, { status: false, message: "Invalid key" }) });
    await expect(refused.initialize({ reference: "r", amountMinor: 1n, currency: "NGN", email: "a@b.co", channels: ["card"], callbackUrl: "https://x", metadata: {} })).rejects.toBeInstanceOf(PaymentStartError);
    const down = new PaystackGateway({ secretKey: "sk_test_x", fetch: async () => { throw new Error("ECONNRESET"); } });
    await expect(down.initialize({ reference: "r", amountMinor: 1n, currency: "NGN", email: "a@b.co", channels: ["card"], callbackUrl: "https://x", metadata: {} })).rejects.not.toBeInstanceOf(PaymentStartError);
  });

  it("reads verify results and reports unknown references as not_found", async () => {
    const paid = new PaystackGateway({ secretKey: "sk_test_x", fetch: reply(200, { status: true, data: { status: "success", amount: 500000, currency: "NGN", channel: "card", paid_at: "2026-10-01T10:00:00.000Z", gateway_response: "Approved" } }) });
    expect(await paid.verify("HPPAY-1")).toMatchObject({ status: "success", amountMinor: 500000n, currency: "NGN", channel: "card", gatewayResponse: "Approved" });
    const missing = new PaystackGateway({ secretKey: "sk_test_x", fetch: reply(400, { status: false, message: "Transaction reference not found" }) });
    expect((await missing.verify("HPPAY-2")).status).toBe("not_found");
    const broken = new PaystackGateway({ secretKey: "sk_test_x", fetch: reply(500, { status: false, message: "Server error" }) });
    await expect(broken.verify("HPPAY-3")).rejects.toThrow(/verify failed/);
  });  it.each([503, 409])("keeps HTTP %i initialization outcomes eligible for reconciliation", async status => {
    const gateway = new PaystackGateway({ secretKey: "sk_test_x", fetch: reply(status, { status: false, message: "Provider unavailable or reference already exists" }) });
    await expect(gateway.initialize({ reference: "r", amountMinor: 1n, currency: "NGN", email: "a@b.co", channels: ["card"], callbackUrl: "https://x", metadata: {} })).rejects.not.toBeInstanceOf(PaymentStartError);
  });


});

/** Against Paystack's test mode (TECH-05 §16). Runs only with a test secret key, never a live one. */
const testKey = process.env.PAYSTACK_SECRET_KEY?.startsWith("sk_test_") ? process.env.PAYSTACK_SECRET_KEY : undefined;

describe.skipIf(!testKey)("Paystack test mode", () => {
  it("initializes a transaction and verifies it as not yet paid", async () => {
    const gateway = new PaystackGateway({ secretKey: testKey! });
    const reference = `HPPAY-${randomUUID()}`;
    const started = await gateway.initialize({
      reference,
      amountMinor: 150000n,
      currency: "NGN",
      email: "test-customer@holypearls.dev",
      channels: ["card", "bank_transfer", "ussd"],
      callbackUrl: "https://holypearls.dev/checkout/test/processing",
      metadata: { intentId: "test", source: "paystack.test.ts" },
    });
    expect(started.accessCode).toBeTruthy();
    expect(started.authorizationUrl).toMatch(/^https:\/\/checkout\.paystack\.com\//);
    const verified = await gateway.verify(reference);
    expect(["abandoned", "pending"]).toContain(verified.status);
    expect(verified.amountMinor).toBe(150000n);
    expect(verified.currency).toBe("NGN");
    expect((await gateway.verify(`HPPAY-${randomUUID()}`)).status).toBe("not_found");
  });
});
