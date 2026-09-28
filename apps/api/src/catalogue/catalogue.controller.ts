import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import {
  addProductMediaSchema,
  adminProductQuerySchema,
  bulkProductStatusSchema,
  changeCategoryStatusSchema,
  changeProductStatusSchema,
  createCategorySchema,
  createProductSchema,
  reorderProductMediaSchema,
  setRelatedProductsSchema,
  updateCategorySchema,
  updateProductMediaSchema,
  updateProductSchema,
} from "@holypearls/contracts";
import type { Request } from "express";
import type { z } from "zod";
import type { ActorContext } from "../identity/actor.js";
import { StaffGuard } from "../identity/staff.guard.js";
import { RateLimit } from "../platform/rate-limit.js";
import { FILE_DEPS } from "../tokens.js";
import type { FileDeps } from "../files/files.js";
import { ZodValidationPipe } from "../validation.js";
import { changeCategoryStatus, createCategory, getCategory, listCategories, updateCategory } from "./categories.js";
import { addProductMedia, removeProductMedia, reorderProductMedia, updateProductMedia } from "./media.js";
import {
  bulkChangeStatus,
  changeProductStatus,
  createProduct,
  getProduct,
  listProducts,
  setRelatedProducts,
  updateProduct,
} from "./products.js";

const uuid = new ParseUUIDPipe();

/** Public pages refresh through cache tags (TECH-02 §6). */
const revalidate = (deps: FileDeps, actor: ActorContext, tags: string[]) => deps.jobs.send("cache.revalidate", { v: 1, requestId: actor.requestId, tags });

/** Catalogue admin (OPS-FR-001–004, Pen frames 96, 98 and 104). Staff without CATALOGUE_MANAGE get 403. */
@Controller("admin/catalogue/products")
@UseGuards(StaffGuard("CATALOGUE_MANAGE"))
export class CatalogueAdminController {
  constructor(@Inject(FILE_DEPS) private readonly deps: FileDeps) {}

  @Get()
  list(@Query(new ZodValidationPipe(adminProductQuerySchema)) query: z.infer<typeof adminProductQuerySchema>) {
    return listProducts(this.deps.db, query);
  }

  @Get(":id")
  get(@Param("id", uuid) id: string) {
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
    @Param("id", uuid) id: string,
    @Body(new ZodValidationPipe(updateProductSchema)) body: z.infer<typeof updateProductSchema>,
  ) {
    return updateProduct(this.deps.db, await request.getActor!(), id, body);
  }

  /** Publish, mark temporarily unavailable or archive. Audited; refreshes public pages. */
  @Post(":id/status")
  @HttpCode(200)
  @RateLimit("ADMIN_WRITE")
  async status(
    @Req() request: Request,
    @Param("id", uuid) id: string,
    @Body(new ZodValidationPipe(changeProductStatusSchema)) body: z.infer<typeof changeProductStatusSchema>,
  ) {
    const actor = await request.getActor!();
    return changeProductStatus(this.deps.db, actor, id, body.to, body.version, async (slug) => {
      await revalidate(this.deps, actor, [`product:${slug}`, "catalogue"]);
    });
  }

  /** The list's bulk actions: each product is checked and audited on its own. */
  @Post("bulk-status")
  @HttpCode(200)
  @RateLimit("ADMIN_WRITE")
  async bulkStatus(@Req() request: Request, @Body(new ZodValidationPipe(bulkProductStatusSchema)) body: z.infer<typeof bulkProductStatusSchema>) {
    const actor = await request.getActor!();
    return bulkChangeStatus(this.deps.db, actor, body.ids, body.to, async (slug) => {
      await revalidate(this.deps, actor, [`product:${slug}`, "catalogue"]);
    });
  }

  @Post(":id/media")
  @RateLimit("ADMIN_WRITE")
  async addMedia(@Req() request: Request, @Param("id", uuid) id: string, @Body(new ZodValidationPipe(addProductMediaSchema)) body: z.infer<typeof addProductMediaSchema>) {
    return addProductMedia(this.deps.db, await request.getActor!(), id, body);
  }

  @Patch(":id/media/:mediaId")
  @RateLimit("ADMIN_WRITE")
  async updateMedia(
    @Req() request: Request,
    @Param("id", uuid) id: string,
    @Param("mediaId", uuid) mediaId: string,
    @Body(new ZodValidationPipe(updateProductMediaSchema)) body: z.infer<typeof updateProductMediaSchema>,
  ) {
    return updateProductMedia(this.deps.db, await request.getActor!(), id, mediaId, body.alt);
  }

  @Delete(":id/media/:mediaId")
  @RateLimit("ADMIN_WRITE")
  async removeMedia(@Req() request: Request, @Param("id", uuid) id: string, @Param("mediaId", uuid) mediaId: string) {
    return removeProductMedia(this.deps.db, await request.getActor!(), id, mediaId);
  }

  @Put(":id/media-order")
  @RateLimit("ADMIN_WRITE")
  async reorderMedia(
    @Req() request: Request,
    @Param("id", uuid) id: string,
    @Body(new ZodValidationPipe(reorderProductMediaSchema)) body: z.infer<typeof reorderProductMediaSchema>,
  ) {
    return reorderProductMedia(this.deps.db, await request.getActor!(), id, body.mediaIds);
  }

  @Put(":id/related")
  @RateLimit("ADMIN_WRITE")
  async related(
    @Req() request: Request,
    @Param("id", uuid) id: string,
    @Body(new ZodValidationPipe(setRelatedProductsSchema)) body: z.infer<typeof setRelatedProductsSchema>,
  ) {
    return setRelatedProducts(this.deps.db, await request.getActor!(), id, body.productIds);
  }
}

/** Category admin (Pen frame 104). */
@Controller("admin/catalogue/categories")
@UseGuards(StaffGuard("CATALOGUE_MANAGE"))
export class CategoryAdminController {
  constructor(@Inject(FILE_DEPS) private readonly deps: FileDeps) {}

  @Get()
  list() {
    return listCategories(this.deps.db);
  }

  @Get(":id")
  get(@Param("id", uuid) id: string) {
    return getCategory(this.deps.db, id);
  }

  @Post()
  @RateLimit("ADMIN_WRITE")
  async create(@Req() request: Request, @Body(new ZodValidationPipe(createCategorySchema)) body: z.infer<typeof createCategorySchema>) {
    return createCategory(this.deps.db, await request.getActor!(), body);
  }

  @Patch(":id")
  @RateLimit("ADMIN_WRITE")
  async update(
    @Req() request: Request,
    @Param("id", uuid) id: string,
    @Body(new ZodValidationPipe(updateCategorySchema)) body: z.infer<typeof updateCategorySchema>,
  ) {
    return updateCategory(this.deps.db, await request.getActor!(), id, body);
  }

  @Post(":id/status")
  @HttpCode(200)
  @RateLimit("ADMIN_WRITE")
  async status(
    @Req() request: Request,
    @Param("id", uuid) id: string,
    @Body(new ZodValidationPipe(changeCategoryStatusSchema)) body: z.infer<typeof changeCategoryStatusSchema>,
  ) {
    const actor = await request.getActor!();
    return changeCategoryStatus(this.deps.db, actor, id, body.to, body.version, async (slug) => {
      await revalidate(this.deps, actor, [`category:${slug}`, "catalogue"]);
    });
  }
}
