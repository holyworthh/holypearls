import { Body, Controller, Get, HttpCode, Inject, Param, ParseIntPipe, ParseUUIDPipe, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import { createShipmentSchema, newProblemSchema, problemReplySchema, reorderSchema, triageProblemSchema, updateShipmentSchema } from "@holypearls/contracts";
import type { Request, Response } from "express";
import type { z } from "zod";
import { DEVICE_COOKIE, deviceKey } from "../configuration/drafts.controller.js";
import { StaffGuard } from "../identity/staff.guard.js";
import type { PaymentDeps } from "../payments/payments.js";
import { Idempotent } from "../platform/idempotency.js";
import { RateLimit } from "../platform/rate-limit.js";
import { PAYMENT_DEPS } from "../tokens.js";
import { ZodValidationPipe } from "../validation.js";
import { getProblem, problemQueue, replyToProblem, reportProblem, triageProblem } from "./problems.js";
import { reorder, reorderCheck } from "./reorder.js";
import { createShipment, orderShipping, shippingQueue, updateShipment } from "./shipments.js";

const uuid = new ParseUUIDPipe();
const position = new ParseIntPipe();
const access = async (request: Request) => ({ actor: await request.getActor!(), deviceKey: deviceKey(request) });
const DEVICE_COOKIE_DAYS = 90;

function notifyOf(deps: PaymentDeps) {
  return { db: deps.db, jobs: deps.jobs, sealKey: deps.sealKey, webOrigin: deps.webOrigin };
}

/** Shipments (OPS-FR-070–073). FULFILMENT_MANAGE. */
@Controller("admin/shipments")
@UseGuards(StaffGuard("FULFILMENT_MANAGE"))
export class ShipmentsAdminController {
  constructor(@Inject(PAYMENT_DEPS) private readonly deps: PaymentDeps) {}

  @Get()
  queue() {
    return shippingQueue(this.deps.db);
  }

  @Get("orders/:orderId")
  order(@Param("orderId", uuid) orderId: string) {
    return orderShipping(this.deps.db, orderId);
  }

  @Post("orders/:orderId")
  @HttpCode(200)
  @Idempotent()
  @RateLimit("ADMIN_WRITE")
  async create(@Req() request: Request, @Param("orderId", uuid) orderId: string, @Body(new ZodValidationPipe(createShipmentSchema)) body: z.infer<typeof createShipmentSchema>) {
    return createShipment(this.deps.db, await request.getActor!(), orderId, body);
  }

  @Post(":id/status")
  @HttpCode(200)
  @RateLimit("ADMIN_WRITE")
  async status(@Req() request: Request, @Param("id", uuid) id: string, @Body(new ZodValidationPipe(updateShipmentSchema)) body: z.infer<typeof updateShipmentSchema>) {
    return updateShipment(notifyOf(this.deps), await request.getActor!(), id, body);
  }
}

/** Problem report triage (Pen 129). CUSTOMER_SUPPORT. */
@Controller("admin/problems")
@UseGuards(StaffGuard("CUSTOMER_SUPPORT"))
export class ProblemsAdminController {
  constructor(@Inject(PAYMENT_DEPS) private readonly deps: PaymentDeps) {}

  @Get()
  list(@Query("view") view?: string) {
    return problemQueue(this.deps.db, view);
  }

  @Get(":id")
  get(@Param("id", uuid) id: string) {
    return getProblem(this.deps.db, id);
  }

  @Post(":id/triage")
  @HttpCode(200)
  @RateLimit("ADMIN_WRITE")
  async triage(@Req() request: Request, @Param("id", uuid) id: string, @Body(new ZodValidationPipe(triageProblemSchema)) body: z.infer<typeof triageProblemSchema>) {
    return triageProblem(this.deps.db, await request.getActor!(), id, body);
  }

  @Post(":id/replies")
  @HttpCode(200)
  @RateLimit("ADMIN_WRITE")
  async reply(@Req() request: Request, @Param("id", uuid) id: string, @Body(new ZodValidationPipe(problemReplySchema)) body: z.infer<typeof problemReplySchema>) {
    return replyToProblem(notifyOf(this.deps), await request.getActor!(), id, body);
  }
}

/** The customer's side: report a problem and reorder (FUL-FR-060–062, 070). Same access as the order; anyone else gets 404. */
@Controller("orders/:orderId")
export class CustomerAfterDeliveryController {
  constructor(@Inject(PAYMENT_DEPS) private readonly deps: PaymentDeps) {}

  @Post("problems")
  @HttpCode(200)
  @Idempotent()
  @RateLimit("CONTACT")
  async report(@Req() request: Request, @Param("orderId", uuid) orderId: string, @Body(new ZodValidationPipe(newProblemSchema)) body: z.infer<typeof newProblemSchema>) {
    return reportProblem(notifyOf(this.deps), await access(request), orderId, body);
  }

  @Get("items/:position/reorder")
  async check(@Req() request: Request, @Res({ passthrough: true }) response: Response, @Param("orderId", uuid) orderId: string, @Param("position", position) itemPosition: number) {
    response.setHeader("cache-control", "private, no-store");
    return reorderCheck(this.deps.db, await access(request), orderId, itemPosition);
  }

  @Post("items/:position/reorder")
  @HttpCode(200)
  @Idempotent()
  @RateLimit("COMMERCIAL_WRITE")
  async reorder(@Req() request: Request, @Res({ passthrough: true }) response: Response, @Param("orderId", uuid) orderId: string, @Param("position", position) itemPosition: number, @Body(new ZodValidationPipe(reorderSchema)) body: z.infer<typeof reorderSchema>) {
    const result = await reorder(this.deps.db, await access(request), orderId, itemPosition, body.mode);
    if (result.newDeviceKey) {
      response.cookie(DEVICE_COOKIE, result.newDeviceKey, { httpOnly: true, sameSite: "lax", secure: this.deps.webOrigin.startsWith("https:"), path: "/", maxAge: DEVICE_COOKIE_DAYS * 86_400_000 });
    }
    return { configurationId: result.configurationId, next: result.next };
  }
}
