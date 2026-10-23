import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from "@nestjs/common";
import { type IssueRefund, issueRefundSchema } from "@holypearls/contracts";
import type { Request } from "express";
import { z } from "zod";
import { StaffGuard } from "../identity/staff.guard.js";
import { Idempotent } from "../platform/idempotency.js";
import { RateLimit } from "../platform/rate-limit.js";
import { PAYMENT_DEPS } from "../tokens.js";
import { ZodValidationPipe } from "../validation.js";
import type { PaymentDeps } from "./payments.js";
import { issueRefund, listRefunds, refundablePayment } from "./refunds.js";

const uuid = new ParseUUIDPipe();
const optionalUuid = new ZodValidationPipe(z.string().uuid().optional());

/** Refunds (T13-05; OPS-FR-043; Pen 121). REFUND_ISSUE throughout; issuing also needs MFA in the last 15 minutes and an Idempotency-Key (TECH-02 §4). */
@Controller("admin/refunds")
@UseGuards(StaffGuard("REFUND_ISSUE"))
export class RefundsController {
  constructor(@Inject(PAYMENT_DEPS) private readonly deps: PaymentDeps) {}

  @Get()
  list() {
    return listRefunds(this.deps.db);
  }

  @Get("payments/:attemptId")
  payment(@Param("attemptId", uuid) attemptId: string, @Query("review", optionalUuid) review?: string) {
    return refundablePayment(this.deps.db, attemptId, review ?? null);
  }

  @Post()
  @RateLimit("ADMIN_WRITE")
  @Idempotent()
  async issue(@Req() request: Request, @Body(new ZodValidationPipe(issueRefundSchema)) body: IssueRefund) {
    return issueRefund(this.deps, await request.getActor!(), body);
  }
}
