import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Put, Query, Req, Res, UseGuards } from "@nestjs/common";
import {
  adminContentQuerySchema,
  changeContentStatusSchema,
  contentHref,
  contentIndexQuerySchema,
  contentTypeSchema,
  createContentPageSchema,
  publishContentPageSchema,
  updateContentPageSchema,
} from "@holypearls/contracts";
import type { Request, Response } from "express";
import { z } from "zod";
import type { FileDeps } from "../files/files.js";
import type { ActorContext } from "../identity/actor.js";
import { StaffGuard } from "../identity/staff.guard.js";
import { RateLimit } from "../platform/rate-limit.js";
import { FILE_DEPS } from "../tokens.js";
import { ZodValidationPipe } from "../validation.js";
import {
  changeContentStatus,
  createContentPage,
  getAdminContentPage,
  listAdminContent,
  type PublishedChange,
  publicContentIndex,
  publicContentPage,
  publishContentPage,
  updateContentPage,
} from "./content.js";
import { publicChange } from "./public-change.js";

const PUBLIC_CACHE = "public, max-age=60, stale-while-revalidate=300";
const slugPipe = new ZodValidationPipe(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80));
const uuid = new ParseUUIDPipe();

/** Project pages, guides, case studies and About, as published (PUB-FR-011–013). */
@Controller("content")
export class ContentController {
  constructor(@Inject(FILE_DEPS) private readonly deps: FileDeps) {}

  @Get()
  @RateLimit("PUBLIC_READ")
  async index(@Query(new ZodValidationPipe(contentIndexQuerySchema)) query: z.infer<typeof contentIndexQuerySchema>, @Res({ passthrough: true }) response: Response) {
    response.setHeader("cache-control", PUBLIC_CACHE);
    return { entries: await publicContentIndex(this.deps.db, query.type) };
  }

  @Get(":type/:slug")
  @RateLimit("PUBLIC_READ")
  page(
    @Param("type", new ZodValidationPipe(contentTypeSchema)) type: z.infer<typeof contentTypeSchema>,
    @Param("slug", slugPipe) slug: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader("cache-control", PUBLIC_CACHE);
    return publicContentPage(this.deps.db, type, slug);
  }
}

/** Cache tags for a page, including its old address when publishing moved it. */
const tagsFor = (change: PublishedChange) => [
  "content",
  `content:${change.type}`,
  `page:${contentHref(change.type, change.slug)}`,
  ...(change.previousSlug ? [`page:${contentHref(change.type, change.previousSlug)}`] : []),
];

/** The content editor (Pen 106 · X3mMi). CONTENT_MANAGE; every change is audited. */
@Controller("admin/content")
@UseGuards(StaffGuard("CONTENT_MANAGE"))
export class ContentAdminController {
  constructor(@Inject(FILE_DEPS) private readonly deps: FileDeps) {}

  private async actor(request: Request): Promise<ActorContext> {
    return request.getActor!();
  }

  @Get()
  async list(@Query(new ZodValidationPipe(adminContentQuerySchema)) query: z.infer<typeof adminContentQuerySchema>) {
    return { entries: await listAdminContent(this.deps.db, query.type) };
  }

  @Post()
  @RateLimit("ADMIN_WRITE")
  async create(@Req() request: Request, @Body(new ZodValidationPipe(createContentPageSchema)) body: z.infer<typeof createContentPageSchema>) {
    return createContentPage(this.deps.db, await this.actor(request), body);
  }

  @Get(":id")
  get(@Param("id", uuid) id: string) {
    return getAdminContentPage(this.deps.db, id);
  }

  @Put(":id")
  @RateLimit("ADMIN_WRITE")
  async update(@Req() request: Request, @Param("id", uuid) id: string, @Body(new ZodValidationPipe(updateContentPageSchema)) body: z.infer<typeof updateContentPageSchema>) {
    return updateContentPage(this.deps.db, await this.actor(request), id, body);
  }

  @Post(":id/publish")
  @HttpCode(200)
  @RateLimit("ADMIN_WRITE")
  async publish(@Req() request: Request, @Param("id", uuid) id: string, @Body(new ZodValidationPipe(publishContentPageSchema)) body: z.infer<typeof publishContentPageSchema>) {
    const actor = await this.actor(request);
    const { page, change } = await publishContentPage(this.deps.db, actor, id, body.version);
    await publicChange(this.deps.jobs, actor, tagsFor(change));
    return page;
  }

  @Post(":id/status")
  @HttpCode(200)
  @RateLimit("ADMIN_WRITE")
  async status(@Req() request: Request, @Param("id", uuid) id: string, @Body(new ZodValidationPipe(changeContentStatusSchema)) body: z.infer<typeof changeContentStatusSchema>) {
    const actor = await this.actor(request);
    const { page, change } = await changeContentStatus(this.deps.db, actor, id, body.to, body.version);
    await publicChange(this.deps.jobs, actor, tagsFor(change));
    return page;
  }
}
