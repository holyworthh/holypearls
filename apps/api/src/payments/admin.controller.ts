import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { paymentSettingsInputSchema, type PaymentSettingsInput, type ResolveReview, resolveReviewSchema } from "@holypearls/contracts";
import type { Request } from "express";
import { StaffGuard } from "../identity/staff.guard.js";
import { RateLimit } from "../platform/rate-limit.js";
import { PAYMENT_DEPS } from "../tokens.js";
import { ZodValidationPipe } from "../validation.js";
import { getIntent, getPaymentSettings, getReview, listPayments, listReviews, resolveReview, savePaymentSettings } from "./admin.js";
import type { PaymentDeps } from "./payments.js";

const uuid = new ParseUUIDPipe();

/**
 * Payments admin (T04-05; OPS-FR-041, 044–047). Reading needs PAYMENT_VIEW;
 * resolving reviews and changing settings need PAYMENT_MANAGE (settings also a
 * recent authenticator check). Served only through the admin app (ADR-017).
 */
@Controller("admin/payments")
export class PaymentsAdminController {
  constructor(@Inject(PAYMENT_DEPS) private readonly deps: PaymentDeps) {}

  private get notify() {
    return { db: this.deps.db, jobs: this.deps.jobs, sealKey: this.deps.sealKey, webOrigin: this.deps.webOrigin };
  }

  @Get()
  @UseGuards(StaffGuard("PAYMENT_VIEW"))
  list(@Query("status") status?: string, @Query("q") q?: string, @Query("cursor") cursor?: string) {
    return listPayments(this.deps.db, { status, q, cursor });
  }

  @Get("intents/:id")
  @UseGuards(StaffGuard("PAYMENT_VIEW"))
  intent(@Param("id", uuid) id: string) {
    return getIntent(this.deps.db, id);
  }

  @Get("reviews")
  @UseGuards(StaffGuard("PAYMENT_VIEW"))
  reviews(@Query("status") status?: string) {
    return listReviews(this.deps.db, status === "RESOLVED" ? "RESOLVED" : "OPEN");
  }

  @Get("reviews/:id")
  @UseGuards(StaffGuard("PAYMENT_VIEW"))
  review(@Param("id", uuid) id: string) {
    return getReview(this.deps.db, id);
  }

  /** A decision on a review: keep a payment, or return the intent to open. Audited; Paystack records are never deleted. */
  @Post("reviews/:id/resolve")
  @HttpCode(200)
  @UseGuards(StaffGuard("PAYMENT_MANAGE"))
  @RateLimit("ADMIN_WRITE")
  async resolve(@Req() request: Request, @Param("id", uuid) id: string, @Body(new ZodValidationPipe(resolveReviewSchema)) body: ResolveReview) {
    return resolveReview({ db: this.deps.db, notify: this.notify }, await request.getActor!(), id, body);
  }

  @Get("settings")
  @UseGuards(StaffGuard("PAYMENT_VIEW"))
  settings() {
    return getPaymentSettings(this.deps.db, this.deps.gateway !== null);
  }

  /** Switch methods and pause payments (TECH-05 §13). Needs a recent authenticator check. */
  @Put("settings")
  @UseGuards(StaffGuard("PAYMENT_MANAGE"))
  @RateLimit("ADMIN_WRITE")
  async save(@Req() request: Request, @Body(new ZodValidationPipe(paymentSettingsInputSchema)) body: PaymentSettingsInput) {
    return savePaymentSettings(this.deps.db, await request.getActor!(), body, this.deps.gateway !== null);
  }
}
