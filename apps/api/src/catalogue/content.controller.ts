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
import { and, eq, inArray, schema } from "@holypearls/db";
import type { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../errors.js";
import type { FileDeps } from "../files/files.js";
import type { ActorContext } from "../identity/actor.js";
import { StaffGuard } from "../identity/staff.guard.js";
import { RateLimit } from "../platform/rate-limit.js";
import { FILE_DEPS, HELP_DEPS, type HelpDepsToken } from "../tokens.js";
import { ZodValidationPipe } from "../validation.js";
import {
  changeContentStatus,
  createContentPage,
  createPreviewLink,
  getAdminContentPage,
  listAdminContent,
  type PublishedChange,
  publicContentIndex,
  previewContentPage,
  previewMediaAllowed,
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
  constructor(
    @Inject(FILE_DEPS) private readonly deps: FileDeps,
    @Inject(HELP_DEPS) private readonly help: HelpDepsToken,
  ) {}

  /** A staff preview of a draft (declared before ":type/:slug"). Private, never cached. */
  @Get("preview/:token")
  @RateLimit("PUBLIC_READ")
  async preview(@Req() request: Request, @Param("token") token: string, @Res({ passthrough: true }) response: Response) {
    response.setHeader("cache-control", "private, no-store");
    response.setHeader("x-robots-tag", "noindex, nofollow");
    return previewContentPage(this.deps.db, this.help.sealKey, token, (await request.getActor!()).now);
  }

  @Get("preview/:token/media/:fileId/:kind")
  @RateLimit("PUBLIC_READ")
  async previewMedia(@Req() request: Request, @Param("token") token: string, @Param("fileId", uuid) fileId: string, @Param("kind") kind: string, @Res() response: Response) {
    if (!(await previewMediaAllowed(this.deps.db, this.help.sealKey, token, fileId, (await request.getActor!()).now))) throw new AppError("NOT_FOUND");
    await sendRendition(this.deps, fileId, kind, response);
  }

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

/** Sends a media-library image's preview or thumbnail, never cached. */
async function sendRendition(deps: FileDeps, fileId: string, kind: string, response: Response) {
  if (kind !== "preview" && kind !== "thumbnail") throw new AppError("NOT_FOUND");
  const [file] = await deps.db
    .select({ id: schema.files.id, bucket: schema.files.bucket })
    .from(schema.files)
    .where(and(eq(schema.files.id, fileId), inArray(schema.files.purpose, ["CONTENT_MEDIA", "PRODUCT_MEDIA"])));
  if (!file) throw new AppError("NOT_FOUND");
  const [rendition] = await deps.db
    .select()
    .from(schema.fileRenditions)
    .where(and(eq(schema.fileRenditions.fileId, fileId), eq(schema.fileRenditions.kind, kind === "preview" ? "PREVIEW" : "THUMBNAIL")));
  if (!rendition) throw new AppError("NOT_FOUND");
  const store = file.bucket === "public" ? deps.publicStorage : deps.storage;
  const body = await store.read(rendition.storageKey).catch(() => null);
  if (!body) throw new AppError("NOT_FOUND");
  response.setHeader("content-type", rendition.contentType);
  response.setHeader("cache-control", "private, no-store");
  response.setHeader("x-content-type-options", "nosniff");
  response.send(body);
}

/** The content editor (Pen 106 · X3mMi). CONTENT_MANAGE; every change is audited. */
@Controller("admin/content")
@UseGuards(StaffGuard("CONTENT_MANAGE"))
export class ContentAdminController {
  constructor(
    @Inject(FILE_DEPS) private readonly deps: FileDeps,
    @Inject(HELP_DEPS) private readonly help: HelpDepsToken,
  ) {}

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

  /**
   * Draft images for the editor. Staff see any media-library image here,
   * published or not; it's never cached as a public asset.
   */
  @Get("media/:fileId/:kind")
  async media(@Param("fileId", uuid) fileId: string, @Param("kind") kind: string, @Res() response: Response) {
    await sendRendition(this.deps, fileId, kind, response);
  }

  /** A signed link that shows this draft on the customer site for an hour (owner, 2026-10-05). */
  @Post(":id/preview-link")
  @HttpCode(200)
  @RateLimit("ADMIN_WRITE")
  async previewLink(@Req() request: Request, @Param("id", uuid) id: string) {
    return createPreviewLink(this.deps.db, this.help, id, (await this.actor(request)).now);
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
