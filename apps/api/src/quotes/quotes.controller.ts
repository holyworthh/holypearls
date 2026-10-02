import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { quoteSettingsInputSchema, saveQuoteVersionSchema } from "@holypearls/contracts";
import type { Request } from "express";
import { z } from "zod";
import { AppError } from "../errors.js";
import { StaffGuard } from "../identity/staff.guard.js";
import { Idempotent } from "../platform/idempotency.js";
import { RateLimit } from "../platform/rate-limit.js";
import { HELP_DEPS, type HelpDepsToken } from "../tokens.js";
import { ZodValidationPipe } from "../validation.js";
import {
  createQuoteVersion,
  discardQuoteVersion,
  getAdminProject,
  getAdminQuote,
  getQuoteSettings,
  listQuotes,
  listRequests,
  saveQuoteSettings,
  saveQuoteVersion,
  sendQuoteVersion,
  startReview,
} from "./quotes.js";

const uuid = new ParseUUIDPipe();
const versionBody = new ZodValidationPipe(z.object({ version: z.number().int() }));

function expectedVersion(value: string | undefined) {
  const parsed = Number(value);
  if (!value || !Number.isInteger(parsed)) throw new AppError("VALIDATION_FAILED", { fieldErrors: { version: "Send the version you started from." } });
  return parsed;
}

/** The staff request queue: submitted projects and configuration quote requests (OPS-FR-030, Pen 124B). QUOTE_MANAGE; admin app only (ADR-017). */
@Controller("admin")
@UseGuards(StaffGuard("QUOTE_MANAGE"))
export class RequestsAdminController {
  constructor(@Inject(HELP_DEPS) private readonly deps: HelpDepsToken) {}

  @Get("requests")
  requests(@Query("view") view?: string) {
    return listRequests(this.deps.db, { view });
  }

  @Get("projects/:id")
  project(@Param("id", uuid) id: string) {
    return getAdminProject(this.deps.db, id);
  }

  /** SUBMITTED → UNDER_REVIEW (TECH-01 §4). */
  @Post("projects/:id/start-review")
  @HttpCode(200)
  @RateLimit("ADMIN_WRITE")
  async startReview(@Req() request: Request, @Param("id", uuid) id: string) {
    return startReview(this.deps.db, await request.getActor!(), id);
  }
}

/** The quote builder (OPS-FR-031–034, 040, Pen 111). QUOTE_MANAGE; admin app only (ADR-017). */
@Controller("admin/quotes")
@UseGuards(StaffGuard("QUOTE_MANAGE"))
export class QuotesAdminController {
  constructor(@Inject(HELP_DEPS) private readonly deps: HelpDepsToken) {}

  @Get()
  list(@Query("status") status?: string) {
    return listQuotes(this.deps.db, { status });
  }

  @Get(":id")
  get(@Param("id", uuid) id: string) {
    return getAdminQuote(this.deps.db, id);
  }

  /** New version: copies the latest as a draft, or starts the first from the admin defaults. */
  @Post(":id/versions")
  @HttpCode(200)
  @RateLimit("ADMIN_WRITE")
  async create(@Req() request: Request, @Param("id", uuid) id: string) {
    return createQuoteVersion(this.deps.db, await request.getActor!(), id);
  }

  /** Saves a draft. 409 for a sent version (it can't change) or a stale save. */
  @Put(":id/versions/:versionId")
  @RateLimit("ADMIN_WRITE")
  async save(@Req() request: Request, @Param("id", uuid) id: string, @Param("versionId", uuid) versionId: string, @Body(new ZodValidationPipe(saveQuoteVersionSchema)) body: z.infer<typeof saveQuoteVersionSchema>) {
    return saveQuoteVersion(this.deps.db, await request.getActor!(), id, versionId, body);
  }

  @Delete(":id/versions/:versionId")
  @RateLimit("ADMIN_WRITE")
  async discard(@Req() request: Request, @Param("id", uuid) id: string, @Param("versionId", uuid) versionId: string, @Query("version") version?: string) {
    return discardQuoteVersion(this.deps.db, await request.getActor!(), id, versionId, expectedVersion(version));
  }

  /** Send: the version becomes SENT and can never change; the customer gets the quote's secure link. */
  @Post(":id/versions/:versionId/send")
  @HttpCode(200)
  @Idempotent()
  @RateLimit("ADMIN_WRITE")
  async send(@Req() request: Request, @Param("id", uuid) id: string, @Param("versionId", uuid) versionId: string, @Body(versionBody) body: { version: number }) {
    return sendQuoteVersion(this.deps, await request.getActor!(), id, versionId, body.version);
  }
}

/** The quote defaults: validity, reminder and payment schedule (QUOTE-FR-006, TECH-05 §4). Saving needs a recent authenticator check. */
@Controller("admin/quote-settings")
@UseGuards(StaffGuard("QUOTE_MANAGE"))
export class QuoteSettingsAdminController {
  constructor(@Inject(HELP_DEPS) private readonly deps: HelpDepsToken) {}

  @Get()
  get() {
    return getQuoteSettings(this.deps.db);
  }

  @Put()
  @RateLimit("ADMIN_WRITE")
  async save(@Req() request: Request, @Body(new ZodValidationPipe(quoteSettingsInputSchema)) body: z.infer<typeof quoteSettingsInputSchema>) {
    return saveQuoteSettings(this.deps.db, await request.getActor!(), body);
  }
}
