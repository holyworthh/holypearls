import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import {
  adminProductQuerySchema,
  changeProductStatusSchema,
  createProductSchema,
  updateProductSchema,
} from "@holypearls/contracts";
import type { Request } from "express";
import type { z } from "zod";
import { StaffGuard } from "../identity/staff.guard.js";
import { RateLimit } from "../platform/rate-limit.js";
import { FILE_DEPS } from "../tokens.js";
import type { FileDeps } from "../files/files.js";
import { ZodValidationPipe } from "../validation.js";
import { changeProductStatus, createProduct, getProduct, listProducts, updateProduct } from "./products.js";

/** Catalogue admin (OPS-FR-001–004, Pen frames 96 and 98). Staff without CATALOGUE_MANAGE get 403. */
@Controller("admin/catalogue/products")
@UseGuards(StaffGuard("CATALOGUE_MANAGE"))
export class CatalogueAdminController {
  constructor(@Inject(FILE_DEPS) private readonly deps: FileDeps) {}

  @Get()
  list(@Query(new ZodValidationPipe(adminProductQuerySchema)) query: z.infer<typeof adminProductQuerySchema>) {
    return listProducts(this.deps.db, query);
  }

  @Get(":id")
  get(@Param("id", new ParseUUIDPipe()) id: string) {
    return getProduct(this.deps.db, id);
  }

  @Post()
  @RateLimit("ADMIN_WRITE")
  async create(@Req() request: Request, @Body(new ZodValidationPipe(createProductSchema)) body: z.infer<typeof createProductSchema>) {
    return createProduct(this.deps.db, await request.getActor!(), body);
  }

  @Patch(":id")
  @RateLimit("ADMIN_WRITE")
  async update(
    @Req() request: Request,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updateProductSchema)) body: z.infer<typeof updateProductSchema>,
  ) {
    return updateProduct(this.deps.db, await request.getActor!(), id, body);
  }

  /** Publish, unpublish, mark temporarily unavailable or archive. Audited; refreshes public pages. */
  @Post(":id/status")
  @HttpCode(200)
  @RateLimit("ADMIN_WRITE")
  async status(
    @Req() request: Request,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(changeProductStatusSchema)) body: z.infer<typeof changeProductStatusSchema>,
  ) {
    const actor = await request.getActor!();
    return changeProductStatus(this.deps.db, actor, id, body.to, body.version, async (slug) => {
      await this.deps.jobs.send("cache.revalidate", { v: 1, requestId: actor.requestId, tags: [`product:${slug}`, "catalogue"] });
    });
  }
}
