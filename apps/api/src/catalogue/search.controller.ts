import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import { createSearchPhraseSchema, searchClickSchema, searchQuerySchema, searchTargetQuerySchema } from "@holypearls/contracts";
import { and, eq, schema, sql } from "@holypearls/db";
import type { Request, Response } from "express";
import type { z } from "zod";
import { AppError } from "../errors.js";
import type { FileDeps } from "../files/files.js";
import { assertStaff, StaffGuard } from "../identity/staff.guard.js";
import { RateLimit } from "../platform/rate-limit.js";
import { FILE_DEPS } from "../tokens.js";
import { ZodValidationPipe } from "../validation.js";
import { sitemapContent } from "./content.js";
import { createSearchPhrase, deleteSearchPhrase, listSearchPhrases, recordSearchClick, search, searchReport, searchTargets } from "./search.js";
import { visibleProduct } from "./storefront.js";

/** Search results (Pen 07, 10). Never cached publicly: results pages are private (PUB-SEO-008). */
@Controller("search")
export class SearchController {
  constructor(@Inject(FILE_DEPS) private readonly deps: FileDeps) {}

  @Get()
  @RateLimit("SEARCH")
  results(@Query(new ZodValidationPipe(searchQuerySchema)) query: z.infer<typeof searchQuerySchema>, @Res({ passthrough: true }) response: Response) {
    response.setHeader("cache-control", "no-store");
    response.setHeader("x-robots-tag", "noindex");
    return search(this.deps.db, query);
  }

  /** Search analytics: which result was chosen (PRD-01 §11). */
  @Post("clicks")
  @HttpCode(204)
  @RateLimit("SEARCH")
  async click(@Body(new ZodValidationPipe(searchClickSchema)) body: z.infer<typeof searchClickSchema>) {
    await recordSearchClick(this.deps.db, body);
  }
}

/** Search phrases and the search report, for catalogue or content staff (PUB-FR-007; PRD-01 §11). */
@Controller("admin/search")
@UseGuards(StaffGuard())
export class SearchAdminController {
  constructor(@Inject(FILE_DEPS) private readonly deps: FileDeps) {}

  private async staff(request: Request) {
    const actor = assertStaff(await request.getActor!());
    if (!actor.staff.permissions.has("CATALOGUE_MANAGE") && !actor.staff.permissions.has("CONTENT_MANAGE")) {
      throw new AppError("FORBIDDEN", { context: { permission: "CATALOGUE_MANAGE or CONTENT_MANAGE" } });
    }
    return actor;
  }

  @Get("phrases")
  async phrases(@Req() request: Request) {
    await this.staff(request);
    return { entries: await listSearchPhrases(this.deps.db) };
  }

  @Post("phrases")
  @RateLimit("ADMIN_WRITE")
  async addPhrase(@Req() request: Request, @Body(new ZodValidationPipe(createSearchPhraseSchema)) body: z.infer<typeof createSearchPhraseSchema>) {
    const actor = await this.staff(request);
    const created = await createSearchPhrase(this.deps.db, actor, body);
    await this.deps.jobs.send("search.refresh", { v: 1, requestId: actor.requestId });
    return created;
  }

  @Delete("phrases/:id")
  @HttpCode(204)
  @RateLimit("ADMIN_WRITE")
  async removePhrase(@Req() request: Request, @Param("id", new ParseUUIDPipe()) id: string) {
    const actor = await this.staff(request);
    await deleteSearchPhrase(this.deps.db, actor, id);
    await this.deps.jobs.send("search.refresh", { v: 1, requestId: actor.requestId });
  }

  @Get("targets")
  async targets(@Req() request: Request, @Query(new ZodValidationPipe(searchTargetQuerySchema)) query: z.infer<typeof searchTargetQuerySchema>) {
    await this.staff(request);
    return { entries: await searchTargets(this.deps.db, query.q) };
  }

  @Get("report")
  async report(@Req() request: Request) {
    await this.staff(request);
    return searchReport(this.deps.db);
  }
}

/** Always-public pages, for the sitemap. */
const STATIC_PATHS = ["/", "/products", "/projects", "/our-work", "/resources", "/contact"];

/** The XML sitemap's pages (PUB-SEO-009): published and indexable only; private routes never appear. */
@Controller("seo")
export class SeoController {
  constructor(@Inject(FILE_DEPS) private readonly deps: FileDeps) {}

  @Get("sitemap")
  @RateLimit("PUBLIC_READ")
  async sitemap(@Res({ passthrough: true }) response: Response) {
    response.setHeader("cache-control", "public, max-age=300");
    const db = this.deps.db;
    const [products, categories, pages] = await Promise.all([
      db
        .select({ slug: schema.products.slug, updatedAt: schema.products.updatedAt })
        .from(schema.products)
        .innerJoin(schema.categories, eq(schema.categories.id, schema.products.categoryId))
        .where(visibleProduct()),
      db
        .select({ slug: schema.categories.slug, updatedAt: schema.categories.updatedAt })
        .from(schema.categories)
        .where(
          and(
            eq(schema.categories.status, "PUBLISHED"),
            sql`(${schema.categories.parentId} is null or exists (select 1 from categories p where p.id = ${schema.categories.parentId} and p.status = 'PUBLISHED'))`,
          ),
        ),
      sitemapContent(db),
    ]);
    const newest = [...products, ...categories].reduce((latest, row) => (row.updatedAt > latest ? row.updatedAt : latest), new Date(0));
    return {
      entries: [
        ...STATIC_PATHS.map((path) => ({ path, updatedAt: newest.toISOString() })),
        ...categories.map((row) => ({ path: `/categories/${row.slug}`, updatedAt: row.updatedAt.toISOString() })),
        ...products.map((row) => ({ path: `/products/${row.slug}`, updatedAt: row.updatedAt.toISOString() })),
        ...pages,
      ],
    };
  }
}
