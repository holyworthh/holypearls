import { Body, Controller, Get, HttpCode, Inject, Param, ParseIntPipe, ParseUUIDPipe, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import { bookCourierSchema, createShipmentSchema, newProblemSchema, problemReplySchema, reorderSchema, triageProblemSchema, updateShipmentSchema } from "@holypearls/contracts";
import type { Request, Response } from "express";
import type { z } from "zod";
import { AppError } from "../errors.js";
import { DEVICE_COOKIE, deviceKey } from "../configuration/drafts.controller.js";
import { StaffGuard } from "../identity/staff.guard.js";
import type { PaymentDeps } from "../payments/payments.js";
import { Idempotent } from "../platform/idempotency.js";
import { RateLimit } from "../platform/rate-limit.js";
import { PAYMENT_DEPS } from "../tokens.js";
import { ZodValidationPipe } from "../validation.js";
import { bookCourier, receiveShipbubbleWebhook } from "./courier-booking.js";
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

  /** T08-06: book a courier-priced order's shipment with Shipbubble. */
  @Post(":id/courier")
  @HttpCode(200)
  @Idempotent()
  @RateLimit("ADMIN_WRITE")
  async book(@Req() request: Request, @Param("id", uuid) id: string, @Body(new ZodValidationPipe(bookCourierSchema)) body: z.infer<typeof bookCourierSchema>) {
    return bookCourier({ ...notifyOf(this.deps), courier: this.deps.courier ?? null }, await request.getActor!(), id, body);
  }
}

/**
 * Shipbubble's webhook (T08-06). Shipbubble calls the API directly, without
 * cookies; the signature over the raw body is the only proof it came from
 * Shipbubble.
 */
@Controller("webhooks/shipbubble")
export class ShipbubbleWebhookController {
  constructor(@Inject(PAYMENT_DEPS) private readonly deps: PaymentDeps) {}

  @Post()
  @HttpCode(200)
  async receive(@Req() request: Request) {
    const raw = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);
    const accepted = await receiveShipbubbleWebhook({ ...notifyOf(this.deps), courier: this.deps.courier ?? null }, raw, request.header("x-ship-signature"), request.requestId ?? "webhook");
    if (!accepted) throw new AppError("FORBIDDEN", { context: { reason: "BAD_SIGNATURE" } });
    return { received: true };
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
