import { Controller, HttpCode, Inject, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { AppError } from "../errors.js";
import { PAYMENT_DEPS } from "../tokens.js";
import { type PaymentDeps, receivePaystackWebhook } from "./payments.js";

/**
 * Paystack's webhook (TECH-02 §9, TECH-05 §6). Paystack calls the API
 * directly, without cookies; the signature over the raw body is the only
 * proof it came from Paystack. The reply is quick: the follow-up confirms the
 * transaction with Paystack's verify API in a job.
 */
@Controller("webhooks/paystack")
export class PaystackWebhookController {
  constructor(@Inject(PAYMENT_DEPS) private readonly deps: PaymentDeps) {}

  @Post()
  @HttpCode(200)
  async receive(@Req() request: Request) {
    const raw = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);
    const accepted = await receivePaystackWebhook(this.deps, raw, request.header("x-paystack-signature"), request.requestId ?? "webhook");
    if (!accepted) throw new AppError("FORBIDDEN", { context: { reason: "BAD_SIGNATURE" } });
    return { received: true };
  }
}
