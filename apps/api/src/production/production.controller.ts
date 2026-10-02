import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import { moveItemSchema, placeHoldSchema, qcResultInputSchema, resolveHoldSchema } from "@holypearls/contracts";
import type { Request } from "express";
import type { z } from "zod";
import { StaffGuard } from "../identity/staff.guard.js";
import type { PaymentDeps } from "../payments/payments.js";
import { RateLimit } from "../platform/rate-limit.js";
import { PAYMENT_DEPS } from "../tokens.js";
import { ZodValidationPipe } from "../validation.js";
import { getProductionItem, moveItem, placeHold, productionBoard, recordQcResult, resolveHold } from "./production.js";

const uuid = new ParseUUIDPipe();

/** The production board and item updates (OPS-FR-060–064). PRODUCTION_MANAGE. */
@Controller("admin/production")
@UseGuards(StaffGuard("PRODUCTION_MANAGE"))
export class ProductionAdminController {
  constructor(@Inject(PAYMENT_DEPS) private readonly deps: PaymentDeps) {}

  private get notify() {
    return { db: this.deps.db, jobs: this.deps.jobs, sealKey: this.deps.sealKey, webOrigin: this.deps.webOrigin };
  }

  @Get()
  board() {
    return productionBoard(this.deps.db);
  }

  @Get("items/:id")
  item(@Param("id", uuid) id: string) {
    return getProductionItem(this.deps.db, id);
  }

  @Post("items/:id/moves")
  @HttpCode(200)
  @RateLimit("ADMIN_WRITE")
  async move(@Req() request: Request, @Param("id", uuid) id: string, @Body(new ZodValidationPipe(moveItemSchema)) body: z.infer<typeof moveItemSchema>) {
    return moveItem(this.deps.db, await request.getActor!(), id, body);
  }

  @Post("items/:id/qc")
  @HttpCode(200)
  @RateLimit("ADMIN_WRITE")
  async qc(@Req() request: Request, @Param("id", uuid) id: string, @Body(new ZodValidationPipe(qcResultInputSchema)) body: z.infer<typeof qcResultInputSchema>) {
    return recordQcResult(this.notify, await request.getActor!(), id, body);
  }

  @Post("items/:id/hold")
  @HttpCode(200)
  @RateLimit("ADMIN_WRITE")
  async hold(@Req() request: Request, @Param("id", uuid) id: string, @Body(new ZodValidationPipe(placeHoldSchema)) body: z.infer<typeof placeHoldSchema>) {
    return placeHold(this.notify, await request.getActor!(), id, body);
  }

  @Post("items/:id/hold/resolve")
  @HttpCode(200)
  @RateLimit("ADMIN_WRITE")
  async resolve(@Req() request: Request, @Param("id", uuid) id: string, @Body(new ZodValidationPipe(resolveHoldSchema)) body: z.infer<typeof resolveHoldSchema>) {
    return resolveHold(this.notify, await request.getActor!(), id, body);
  }
}
