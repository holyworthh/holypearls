import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Req, Res } from "@nestjs/common";
import { acceptQuoteSchema, customerQuoteRequestSchema, declineQuoteSchema } from "@holypearls/contracts";
import type { Request, Response } from "express";
import type { z } from "zod";
import { deviceKey } from "../configuration/drafts.controller.js";
import { loadOrderFor } from "../orders/orders.js";
import { Idempotent } from "../platform/idempotency.js";
import { RateLimit } from "../platform/rate-limit.js";
import { PAYMENT_DEPS } from "../tokens.js";
import type { PaymentDeps } from "../payments/payments.js";
import { ZodValidationPipe } from "../validation.js";
import { acceptQuote, declineQuote, getCustomerQuote, payInstallment, type QuoteAccess, requestQuoteChange, requestUpdatedQuote } from "./customer.js";

const uuid = new ParseUUIDPipe();

async function access(request: Request): Promise<QuoteAccess> {
  return { actor: await request.getActor!(), deviceKey: deviceKey(request) };
}

/**
 * The customer's quote (QUOTE-FR-002–008): view, accept, request changes, ask,
 * decline, request an updated quote. The quote's link, its account, or whoever
 * can open its project or design; anyone else gets 404. Never cached.
 */
@Controller("quotes")
export class CustomerQuotesController {
  constructor(@Inject(PAYMENT_DEPS) private readonly deps: PaymentDeps) {}

  private get notify() {
    return { db: this.deps.db, jobs: this.deps.jobs, sealKey: this.deps.sealKey, webOrigin: this.deps.webOrigin };
  }

  @Get(":id")
  async get(@Req() request: Request, @Res({ passthrough: true }) response: Response, @Param("id", uuid) id: string) {
    response.setHeader("cache-control", "private, no-store");
    return getCustomerQuote(this.deps.db, await access(request), id);
  }

  /** Accept (QUOTE-FR-007–008): needs a recent email code; pressing twice returns the same order. */
  @Post(":id/accept")
  @HttpCode(200)
  @Idempotent()
  @RateLimit("COMMERCIAL_WRITE")
  async accept(@Req() request: Request, @Param("id", uuid) id: string, @Body(new ZodValidationPipe(acceptQuoteSchema)) body: z.infer<typeof acceptQuoteSchema>) {
    return acceptQuote(this.notify, await access(request), id, body);
  }

  @Post(":id/requests")
  @HttpCode(200)
  @RateLimit("CONTACT")
  async request(@Req() request: Request, @Param("id", uuid) id: string, @Body(new ZodValidationPipe(customerQuoteRequestSchema)) body: z.infer<typeof customerQuoteRequestSchema>) {
    return requestQuoteChange(this.deps.db, await access(request), id, body);
  }

  @Post(":id/decline")
  @HttpCode(200)
  @RateLimit("COMMERCIAL_WRITE")
  async decline(@Req() request: Request, @Param("id", uuid) id: string, @Body(new ZodValidationPipe(declineQuoteSchema)) body: z.infer<typeof declineQuoteSchema>) {
    return declineQuote(this.deps.db, await access(request), id, body.reason);
  }

  /** "Request updated quote" on an expired quote (QUOTE-FR-006). */
  @Post(":id/request-update")
  @HttpCode(200)
  @RateLimit("CONTACT")
  async update(@Req() request: Request, @Param("id", uuid) id: string) {
    return requestUpdatedQuote(this.deps.db, await access(request), id);
  }
}

/** Paying the next installment of an order from a quote (PAY-FR-001–004). Same access as the order. */
@Controller("orders")
export class OrderPaymentsController {
  constructor(@Inject(PAYMENT_DEPS) private readonly deps: PaymentDeps) {}

  @Post(":id/installments/:installmentId/payments")
  @HttpCode(200)
  @Idempotent()
  @RateLimit("COMMERCIAL_WRITE")
  async pay(@Req() request: Request, @Param("id", uuid) id: string, @Param("installmentId", uuid) installmentId: string) {
    const actor = await request.getActor!();
    const order = await loadOrderFor(this.deps.db, { actor, deviceKey: deviceKey(request) }, id);
    return payInstallment(this.deps, actor, order, installmentId);
  }
}
