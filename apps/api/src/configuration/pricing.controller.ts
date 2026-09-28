import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Put, Req, UseGuards } from "@nestjs/common";
import {
  priceRequestSchema,
  priceRuleInputSchema,
  saveCompatibilitySchema,
  saveProductRulesSchema,
  taxSettingInputSchema,
} from "@holypearls/contracts";
import type { Database } from "@holypearls/db";
import type { Request } from "express";
import { z } from "zod";
import { addPriceRule, addTaxSetting, getProductRules, listPriceRules, listTaxSettings, saveCompatibility, saveProductRules } from "../catalogue/rules.js";
import { StaffGuard } from "../identity/staff.guard.js";
import { RateLimit } from "../platform/rate-limit.js";
import { DATABASE } from "../tokens.js";
import { ZodValidationPipe } from "../validation.js";
import { priceProduct, pricePublishedProduct } from "./pricing.js";

const uuid = new ParseUUIDPipe();
const slugPipe = new ZodValidationPipe(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80));

/** Product rules, compatibility, prices and VAT (OPS-FR-010–019). PRICING_MANAGE; every change audited. */
@Controller("admin/pricing")
@UseGuards(StaffGuard("PRICING_MANAGE"))
export class PricingAdminController {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  @Get("products/:id/rules")
  rules(@Param("id", uuid) id: string) {
    return getProductRules(this.db, id);
  }

  @Put("products/:id/rules")
  @RateLimit("ADMIN_WRITE")
  async saveRules(@Req() request: Request, @Param("id", uuid) id: string, @Body(new ZodValidationPipe(saveProductRulesSchema)) body: z.infer<typeof saveProductRulesSchema>) {
    return saveProductRules(this.db, await request.getActor!(), id, body.rules, body.version);
  }

  @Put("products/:id/compatibility")
  @RateLimit("ADMIN_WRITE")
  async saveCompatibility(@Req() request: Request, @Param("id", uuid) id: string, @Body(new ZodValidationPipe(saveCompatibilitySchema)) body: z.infer<typeof saveCompatibilitySchema>) {
    return saveCompatibility(this.db, await request.getActor!(), id, body.rules, body.version);
  }

  @Get("products/:id/prices")
  async prices(@Req() request: Request, @Param("id", uuid) id: string) {
    return listPriceRules(this.db, id, (await request.getActor!()).now);
  }

  @Post("products/:id/prices")
  @RateLimit("ADMIN_WRITE")
  async addPrice(@Req() request: Request, @Param("id", uuid) id: string, @Body(new ZodValidationPipe(priceRuleInputSchema)) body: z.infer<typeof priceRuleInputSchema>) {
    const actor = await request.getActor!();
    return addPriceRule(this.db, actor, id, body, actor.now);
  }

  /** Staff try a configuration against the rules, including unpublished products. */
  @Post("products/:id/calculate")
  @HttpCode(200)
  @RateLimit("ADMIN_WRITE")
  async calculate(@Req() request: Request, @Param("id", uuid) id: string, @Body(new ZodValidationPipe(priceRequestSchema)) body: z.infer<typeof priceRequestSchema>) {
    return priceProduct(this.db, id, body, (await request.getActor!()).now);
  }

  @Get("vat")
  async vat(@Req() request: Request) {
    return listTaxSettings(this.db, (await request.getActor!()).now);
  }

  @Post("vat")
  @RateLimit("ADMIN_WRITE")
  async addVat(@Req() request: Request, @Body(new ZodValidationPipe(taxSettingInputSchema)) body: z.infer<typeof taxSettingInputSchema>) {
    const actor = await request.getActor!();
    return addTaxSetting(this.db, actor, body, actor.now);
  }
}

/**
 * Public price calculation (COM-FR-004/005). The browser may show the result
 * as an estimate; checkout recalculates on the server (TECH-05 §1).
 */
@Controller("catalogue/products")
export class PublicPricingController {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  @Post(":slug/price")
  @HttpCode(200)
  @RateLimit("SEARCH")
  async price(@Req() request: Request, @Param("slug", slugPipe) slug: string, @Body(new ZodValidationPipe(priceRequestSchema)) body: z.infer<typeof priceRequestSchema>) {
    return pricePublishedProduct(this.db, slug, body, (await request.getActor!()).now);
  }
}
