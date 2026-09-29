import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Put, Query, Req, Res, UseGuards } from "@nestjs/common";
import {
  merchandisingListKeySchema,
  publicProductQuerySchema,
  publishHubSchema,
  searchSuggestionQuerySchema,
  saveHubDraftSchema,
  saveMerchandisingListSchema,
} from "@holypearls/contracts";
import { and, eq, schema } from "@holypearls/db";
import type { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../errors.js";
import type { FileDeps } from "../files/files.js";
import { StaffGuard } from "../identity/staff.guard.js";
import { RateLimit } from "../platform/rate-limit.js";
import { FILE_DEPS } from "../tokens.js";
import { ZodValidationPipe } from "../validation.js";
import { publicChange } from "./public-change.js";
import { typeahead } from "./search.js";
import { getAdminHub, getMerchandisingLists, publishHub, saveHubDraft, saveMerchandisingList } from "./merchandising.js";
import { listPublicProducts, publicCategoryTree, publicHub, publicMediaFile, publicProduct, storefrontNavigation } from "./storefront.js";

/** Public reads can sit in shared caches briefly; publishing also refreshes the web app's tagged cache. */
const PUBLIC_CACHE = "public, max-age=60, stale-while-revalidate=300";
const slugPipe = new ZodValidationPipe(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80));

/** The public catalogue (PUB-FR-004, 008–010). Anyone may read; only published records are returned. */
@Controller("catalogue")
export class StorefrontController {
  constructor(@Inject(FILE_DEPS) private readonly deps: FileDeps) {}

  @Get("navigation")
  @RateLimit("PUBLIC_READ")
  navigation(@Res({ passthrough: true }) response: Response) {
    response.setHeader("cache-control", PUBLIC_CACHE);
    return storefrontNavigation(this.deps.db);
  }

  @Get("categories")
  @RateLimit("PUBLIC_READ")
  async categories(@Res({ passthrough: true }) response: Response) {
    response.setHeader("cache-control", PUBLIC_CACHE);
    return { categories: await publicCategoryTree(this.deps.db) };
  }

  @Get("products")
  @RateLimit("PUBLIC_READ")
  products(
    @Query(new ZodValidationPipe(publicProductQuerySchema)) query: z.infer<typeof publicProductQuerySchema>,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader("cache-control", PUBLIC_CACHE);
    return listPublicProducts(this.deps.db, query);
  }

  /** Typeahead (Pen 09): limited as SEARCH, since it runs on every keystroke. */
  @Get("suggest")
  @RateLimit("SEARCH")
  suggest(
    @Query(new ZodValidationPipe(searchSuggestionQuerySchema)) query: z.infer<typeof searchSuggestionQuerySchema>,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader("cache-control", PUBLIC_CACHE);
    return typeahead(this.deps.db, query.q);
  }

  @Get("products/:slug")
  @RateLimit("PUBLIC_READ")
  product(@Param("slug", slugPipe) slug: string, @Res({ passthrough: true }) response: Response) {
    response.setHeader("cache-control", PUBLIC_CACHE);
    return publicProduct(this.deps.db, slug);
  }

  @Get("hubs/:slug")
  @RateLimit("PUBLIC_READ")
  hub(@Param("slug", slugPipe) slug: string, @Res({ passthrough: true }) response: Response) {
    response.setHeader("cache-control", PUBLIC_CACHE);
    return publicHub(this.deps.db, slug);
  }
}

/** Public product and category images. Each file ID's bytes never change, so they cache for a year. */
@Controller("media")
export class PublicMediaController {
  constructor(@Inject(FILE_DEPS) private readonly deps: FileDeps) {}

  @Get(":fileId/:kind")
  @RateLimit("PUBLIC_READ")
  async media(@Param("fileId", new ParseUUIDPipe()) fileId: string, @Param("kind") kind: string, @Res() response: Response) {
    if (kind !== "preview" && kind !== "thumbnail") throw new AppError("NOT_FOUND");
    await publicMediaFile(this.deps.db, fileId);
    const [rendition] = await this.deps.db
      .select()
      .from(schema.fileRenditions)
      .where(and(eq(schema.fileRenditions.fileId, fileId), eq(schema.fileRenditions.kind, kind === "preview" ? "PREVIEW" : "THUMBNAIL")));
    if (!rendition) throw new AppError("NOT_FOUND");
    const body = await this.deps.publicStorage.read(rendition.storageKey).catch(() => null);
    if (!body) throw new AppError("NOT_FOUND");
    response.setHeader("content-type", rendition.contentType);
    response.setHeader("cache-control", "public, max-age=31536000, immutable");
    response.setHeader("x-content-type-options", "nosniff");
    response.send(body);
  }
}

/** Category hub editing (Pen 105) and admin-managed lists. CATALOGUE_MANAGE; audited. */
@Controller("admin/catalogue")
@UseGuards(StaffGuard("CATALOGUE_MANAGE"))
export class MerchandisingAdminController {
  constructor(@Inject(FILE_DEPS) private readonly deps: FileDeps) {}

  @Get("categories/:id/hub")
  hub(@Param("id", new ParseUUIDPipe()) id: string) {
    return getAdminHub(this.deps.db, id);
  }

  @Put("categories/:id/hub")
  @RateLimit("ADMIN_WRITE")
  async saveHub(
    @Req() request: Request,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(saveHubDraftSchema)) body: z.infer<typeof saveHubDraftSchema>,
  ) {
    return saveHubDraft(this.deps.db, await request.getActor!(), id, body.hub, body.version);
  }

  @Post("categories/:id/hub/publish")
  @HttpCode(200)
  @RateLimit("ADMIN_WRITE")
  async publish(
    @Req() request: Request,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(publishHubSchema)) body: z.infer<typeof publishHubSchema>,
  ) {
    const actor = await request.getActor!();
    return publishHub(this.deps.db, actor, id, body.version, async (slug) => {
      await publicChange(this.deps.jobs, actor, [`category:${slug}`, "catalogue"]);
    });
  }

  @Get("lists")
  lists() {
    return getMerchandisingLists(this.deps.db);
  }

  @Put("lists/:key")
  @RateLimit("ADMIN_WRITE")
  async saveList(
    @Req() request: Request,
    @Param("key", new ZodValidationPipe(merchandisingListKeySchema)) key: z.infer<typeof merchandisingListKeySchema>,
    @Body(new ZodValidationPipe(saveMerchandisingListSchema)) body: z.infer<typeof saveMerchandisingListSchema>,
  ) {
    const actor = await request.getActor!();
    const result = await saveMerchandisingList(this.deps.db, actor, key, body.productIds, body.version);
    await publicChange(this.deps.jobs, actor, ["catalogue"]);
    return result;
  }
}
