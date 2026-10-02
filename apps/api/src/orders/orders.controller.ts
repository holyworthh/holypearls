import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Req, Res } from "@nestjs/common";
import { cancelOrderSchema, findOrderSchema } from "@holypearls/contracts";
import type { Database } from "@holypearls/db";
import type { Request, Response } from "express";
import { deviceKey } from "../configuration/drafts.controller.js";
import type { PaymentDeps } from "../payments/payments.js";
import { Idempotent } from "../platform/idempotency.js";
import { RateLimit } from "../platform/rate-limit.js";
import { DATABASE, PAYMENT_DEPS } from "../tokens.js";
import { ZodValidationPipe } from "../validation.js";
import type { z } from "zod";
import { cancelOrder, findOrder } from "./tracking.js";
import { getOrder, getReceipt, type OrderAccess } from "./orders.js";
import { receiptPdf } from "./receipt-pdf.js";

const uuid = new ParseUUIDPipe();

async function access(request: Request): Promise<OrderAccess> {
  return { actor: await request.getActor!(), deviceKey: deviceKey(request) };
}

/**
 * A customer's order and its receipts (COM-FR-085, PAY-FR-006). The account,
 * the browser that paid, or the order's secure link; anyone else gets 404.
 * Private, never cached (TECH-02 §6).
 */
@Controller("orders")
export class OrdersController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(PAYMENT_DEPS) private readonly deps: PaymentDeps,
  ) {}

  private get notify() {
    return { db: this.deps.db, jobs: this.deps.jobs, sealKey: this.deps.sealKey, webOrigin: this.deps.webOrigin };
  }

  /** Find my order (FUL-FR-033): emails the order's secure link to the checkout address. Rate-limited per address. */
  @Post("find")
  @HttpCode(200)
  @RateLimit("GUEST_LINK_VERIFY")
  async find(@Req() request: Request, @Body(new ZodValidationPipe(findOrderSchema)) body: z.infer<typeof findOrderSchema>) {
    return findOrder(this.notify, body, (await request.getActor!()).requestId);
  }

  /** Cancel before production (FUL-FR-050). */
  @Post(":id/cancel")
  @HttpCode(200)
  @Idempotent()
  @RateLimit("COMMERCIAL_WRITE")
  async cancel(@Req() request: Request, @Param("id", uuid) id: string, @Body(new ZodValidationPipe(cancelOrderSchema)) body: z.infer<typeof cancelOrderSchema>) {
    return cancelOrder(this.notify, await access(request), id, body);
  }

  @Get(":id")
  async get(@Req() request: Request, @Res({ passthrough: true }) response: Response, @Param("id", uuid) id: string) {
    response.setHeader("cache-control", "private, no-store");
    return getOrder(this.db, await access(request), id);
  }

  @Get(":id/receipts/:receiptId")
  async receipt(@Req() request: Request, @Res({ passthrough: true }) response: Response, @Param("id", uuid) id: string, @Param("receiptId", uuid) receiptId: string) {
    response.setHeader("cache-control", "private, no-store");
    return getReceipt(this.db, await access(request), id, receiptId);
  }

  /** The receipt as a PDF download, made from the same record as the page. */
  @Get(":id/receipts/:receiptId/pdf")
  async receiptPdf(@Req() request: Request, @Res() response: Response, @Param("id", uuid) id: string, @Param("receiptId", uuid) receiptId: string) {
    const receipt = await getReceipt(this.db, await access(request), id, receiptId);
    response.setHeader("cache-control", "private, no-store");
    response.setHeader("content-type", "application/pdf");
    response.setHeader("content-disposition", `attachment; filename="${receipt.number}.pdf"`);
    response.send(Buffer.from(receiptPdf(receipt)));
  }
}
