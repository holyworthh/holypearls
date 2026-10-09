import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Put, Req, UseGuards } from "@nestjs/common";
import {
  addToCartSchema,
  cartQuoteRequestSchema,
  checkoutAddressSchema,
  checkoutBillingSchema,
  checkoutContactSchema,
  checkoutDeliverySchema,
  courierSettingsInputSchema,
  deliveryPriceInputSchema,
  deliveryZoneInputSchema,
  fixedZoneInputSchema,
  setPlacedForSchema,
} from "@holypearls/contracts";
import type { Database } from "@holypearls/db";
import type { Request } from "express";
import { z } from "zod";
import { deviceKey } from "../configuration/drafts.controller.js";
import { StaffGuard } from "../identity/staff.guard.js";
import { Idempotent } from "../platform/idempotency.js";
import { RateLimit } from "../platform/rate-limit.js";
import type { PaymentDeps } from "../payments/payments.js";
import { DATABASE, HELP_DEPS, type HelpDepsToken, PAYMENT_DEPS } from "../tokens.js";
import { ZodValidationPipe } from "../validation.js";
import { addToCart, type CartAccess, forgetSaved, getCart, removeFromCart, requestCartQuotes } from "./cart.js";
import { getCheckout, payCheckout, setAddress, setBilling, setContact, setDelivery, setPlacedFor, startCheckout } from "./checkout.js";
import { claimDeviceCommerce } from "./claim.js";
import { createZone, deleteZone, listZones, updateZone } from "./delivery.js";
import { CourierError } from "./courier.js";
import { getCourierSettings, saveCourierSettings } from "./courier-pricing.js";
import { AppError } from "../errors.js";
import { deliveryPriceQueue, requestDeliveryPrice, setDeliveryPrice } from "./delivery-price.js";

const uuid = new ParseUUIDPipe();
const versioned = <T extends z.ZodType>(schema: T) => new ZodValidationPipe(z.intersection(schema, z.object({ version: z.number().int() })));

/** Who's asking; a signed-in request that still has the browser's cookie claims the browser's cart first. */
async function access(db: Database, request: Request): Promise<CartAccess> {
  const access = { actor: await request.getActor!(), deviceKey: deviceKey(request) };
  await claimDeviceCommerce(db, access);
  return access;
}

/** The cart (COM-FR-080–081). Owned by the account, or by the browser before sign-in. */
@Controller("cart")
export class CartController {
  constructor(@Inject(HELP_DEPS) private readonly deps: HelpDepsToken) {}

  @Get()
  async get(@Req() request: Request) {
    return getCart(this.deps.db, await access(this.deps.db, request));
  }

  @Post("items")
  @HttpCode(200)
  @RateLimit("COMMERCIAL_WRITE")
  async add(@Req() request: Request, @Body(new ZodValidationPipe(addToCartSchema)) body: z.infer<typeof addToCartSchema>) {
    return addToCart(this.deps.db, await access(this.deps.db, request), body.configurationId);
  }

  @Delete("items/:id")
  @RateLimit("COMMERCIAL_WRITE")
  async remove(@Req() request: Request, @Param("id", uuid) id: string) {
    return removeFromCart(this.deps.db, await access(this.deps.db, request), id, { saveForLater: false });
  }

  /** "Save for later": the design goes back to the customer's saved drafts. */
  @Post("items/:id/save-for-later")
  @HttpCode(200)
  @RateLimit("COMMERCIAL_WRITE")
  async saveForLater(@Req() request: Request, @Param("id", uuid) id: string) {
    return removeFromCart(this.deps.db, await access(this.deps.db, request), id, { saveForLater: true });
  }

  @Delete("saved/:configurationId")
  @RateLimit("COMMERCIAL_WRITE")
  async forget(@Req() request: Request, @Param("configurationId", uuid) id: string) {
    return forgetSaved(this.deps.db, await access(this.deps.db, request), id);
  }

  /** "Submit quote items": the quote items become one quote request. */
  @Post("quote-request")
  @HttpCode(200)
  @RateLimit("CONTACT")
  async quote(@Req() request: Request, @Body(new ZodValidationPipe(cartQuoteRequestSchema)) body: z.infer<typeof cartQuoteRequestSchema>) {
    return requestCartQuotes(this.deps, await access(this.deps.db, request), body);
  }
}

/** Checkout (COM-FR-083–084). The server works out every amount (TECH-05 §1). */
@Controller("checkouts")
export class CheckoutController {
  private readonly db: Database;

  constructor(
    @Inject(PAYMENT_DEPS) private readonly deps: PaymentDeps,
    @Inject(HELP_DEPS) private readonly help: HelpDepsToken,
  ) {
    this.db = deps.db;
  }

  @Post()
  @HttpCode(200)
  @Idempotent()
  @RateLimit("COMMERCIAL_WRITE")
  async start(@Req() request: Request) {
    return startCheckout(this.deps, await access(this.db, request));
  }

  @Get(":id")
  async get(@Req() request: Request, @Param("id", uuid) id: string) {
    return getCheckout(this.deps, await access(this.db, request), id);
  }

  /**
   * "Pay" (TECH-05 §5): starts a payment attempt for the checkout's own total
   * and returns what Paystack's checkout needs. The same Idempotency-Key
   * returns the same attempt.
   */
  @Post(":id/payments")
  @HttpCode(200)
  @Idempotent()
  @RateLimit("COMMERCIAL_WRITE")
  async pay(@Req() request: Request, @Param("id", uuid) id: string) {
    return payCheckout(this.deps, await access(this.db, request), id);
  }

  @Put(":id/contact")
  @RateLimit("COMMERCIAL_WRITE")
  async contact(@Req() request: Request, @Param("id", uuid) id: string, @Body(versioned(checkoutContactSchema)) body: z.infer<typeof checkoutContactSchema> & { version: number }) {
    return setContact(this.deps, await access(this.db, request), id, body);
  }

  @Put(":id/address")
  @RateLimit("COMMERCIAL_WRITE")
  async address(@Req() request: Request, @Param("id", uuid) id: string, @Body(versioned(checkoutAddressSchema)) body: z.infer<typeof checkoutAddressSchema> & { version: number }) {
    return setAddress(this.deps, await access(this.db, request), id, body);
  }

  @Put(":id/delivery")
  @RateLimit("COMMERCIAL_WRITE")
  async delivery(@Req() request: Request, @Param("id", uuid) id: string, @Body(versioned(checkoutDeliverySchema)) body: z.infer<typeof checkoutDeliverySchema> & { version: number }) {
    return setDelivery(this.deps, await access(this.db, request), id, body);
  }

  /** Who the order is for: an organization and location, or null (T10-03). */
  @Put(":id/placed-for")
  @RateLimit("COMMERCIAL_WRITE")
  async placedFor(@Req() request: Request, @Param("id", uuid) id: string, @Body(new ZodValidationPipe(setPlacedForSchema)) body: z.infer<typeof setPlacedForSchema>) {
    return setPlacedFor(this.deps, await access(this.db, request), id, body);
  }

  @Put(":id/billing")
  @RateLimit("COMMERCIAL_WRITE")
  async billing(@Req() request: Request, @Param("id", uuid) id: string, @Body(versioned(checkoutBillingSchema)) body: z.infer<typeof checkoutBillingSchema> & { version: number }) {
    const actor = await request.getActor!();
    const checkout = await setBilling(this.deps, await access(this.db, request), id, body);
    // An address outside the zones: staff are asked for the delivery price (owner, 2026-10-05).
    await requestDeliveryPrice(this.help, id, actor.now, actor.requestId);
    return checkout;
  }
}

/** Courier prices through Shipbubble (T08-05). PRICING_MANAGE; audited. */
@Controller("admin/courier-settings")
@UseGuards(StaffGuard("PRICING_MANAGE"))
export class CourierSettingsAdminController {
  constructor(@Inject(PAYMENT_DEPS) private readonly deps: PaymentDeps) {}

  @Get()
  get() {
    return getCourierSettings(this.deps.db, this.deps.courier ?? null);
  }

  @Put()
  @RateLimit("ADMIN_WRITE")
  async save(@Req() request: Request, @Body(new ZodValidationPipe(courierSettingsInputSchema)) body: z.infer<typeof courierSettingsInputSchema>) {
    return saveCourierSettings(this.deps.db, this.deps.courier ?? null, await request.getActor!(), body);
  }

  /** Shipbubble's package categories, for the settings form. */
  @Get("categories")
  async categories() {
    if (!this.deps.courier) return { categories: [] };
    try {
      return { categories: await this.deps.courier.categories() };
    } catch (error) {
      if (error instanceof CourierError) throw new AppError("RULE_FAILED", { message: error.message, context: { reason: "COURIER_UNAVAILABLE" } });
      throw error;
    }
  }
}

/** Delivery prices for addresses outside the zones (owner, 2026-10-05). PRICING_MANAGE; audited. */
@Controller("admin/delivery-prices")
@UseGuards(StaffGuard("PRICING_MANAGE"))
export class DeliveryPricesAdminController {
  constructor(@Inject(HELP_DEPS) private readonly deps: HelpDepsToken) {}

  @Get()
  async list(@Req() request: Request) {
    return deliveryPriceQueue(this.deps, (await request.getActor!()).now);
  }

  @Post(":checkoutId")
  @HttpCode(200)
  @RateLimit("ADMIN_WRITE")
  async set(@Req() request: Request, @Param("checkoutId", uuid) id: string, @Body(new ZodValidationPipe(deliveryPriceInputSchema)) body: z.infer<typeof deliveryPriceInputSchema>) {
    return setDeliveryPrice(this.deps, await request.getActor!(), id, body);
  }
}

/** Delivery zones and rates (OPS-FR-100–101, Pen 108). PRICING_MANAGE; every change audited. */
@Controller("admin/delivery-zones")
@UseGuards(StaffGuard("PRICING_MANAGE"))
export class DeliveryZonesAdminController {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  @Get()
  list() {
    return listZones(this.db);
  }

  @Post()
  @RateLimit("ADMIN_WRITE")
  async create(@Req() request: Request, @Body(new ZodValidationPipe(deliveryZoneInputSchema)) body: z.infer<typeof deliveryZoneInputSchema>) {
    return createZone(this.db, await request.getActor!(), body);
  }

  /** Area zones send the full zone; the rest-of-Nigeria and International rows send only pricing. */
  @Patch(":id")
  @RateLimit("ADMIN_WRITE")
  async update(@Req() request: Request, @Param("id", uuid) id: string, @Body(new ZodValidationPipe(z.union([deliveryZoneInputSchema, fixedZoneInputSchema]))) body: z.infer<typeof deliveryZoneInputSchema> | z.infer<typeof fixedZoneInputSchema>) {
    return updateZone(this.db, await request.getActor!(), id, body);
  }

  @Delete(":id")
  @HttpCode(204)
  @RateLimit("ADMIN_WRITE")
  async remove(@Req() request: Request, @Param("id", uuid) id: string) {
    await deleteZone(this.db, await request.getActor!(), id);
  }
}
