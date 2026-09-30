import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Req, Res } from "@nestjs/common";
import {
  attachConfigurationFileSchema,
  createConfigurationSchema,
  emailDraftSchema,
  lowResolutionActionSchema,
  personalizationImportSchema,
  quoteRequestSchema,
  updateConfigurationSchema,
} from "@holypearls/contracts";
import { setGuestCookie } from "../identity/customer-access.controller.js";
import type { Request, Response } from "express";
import type { z } from "zod";
import { RateLimit } from "../platform/rate-limit.js";
import { FILE_DEPS, HELP_DEPS, type HelpDepsToken } from "../tokens.js";
import type { FileDeps } from "../files/files.js";
import { ZodValidationPipe } from "../validation.js";
import { attachDraftFile, createDraft, type DraftAccess, emailDraftLink, getDraft, importPersonalization, removeDraftFile, requestQuote, setLowResolutionAction, updateDraft } from "./drafts.js";

/** The browser's device key for drafts started without signing in (HttpOnly; never readable by scripts). */
export const DEVICE_COOKIE = "hp.device";
const DEVICE_COOKIE_DAYS = 90;

function deviceKey(request: Request): string | null {
  for (const part of (request.header("cookie") ?? "").split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === DEVICE_COOKIE) {
      const value = decodeURIComponent(rest.join("="));
      return /^[A-Za-z0-9-]{40,100}$/.test(value) ? value : null;
    }
  }
  return null;
}

/** Configuration drafts (COM-FR-010–014). Owners only; anyone else gets 404. */
@Controller("configurations")
export class ConfigurationsController {
  constructor(
    @Inject(HELP_DEPS) private readonly deps: HelpDepsToken,
    @Inject(FILE_DEPS) private readonly files: FileDeps,
  ) {}

  private async access(request: Request): Promise<DraftAccess> {
    return { actor: await request.getActor!(), deviceKey: deviceKey(request) };
  }

  @Post()
  @RateLimit("COMMERCIAL_WRITE")
  async create(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body(new ZodValidationPipe(createConfigurationSchema)) body: z.infer<typeof createConfigurationSchema>,
  ) {
    const { draft, newDeviceKey } = await createDraft(this.deps.db, await this.access(request), body);
    if (newDeviceKey) {
      response.cookie(DEVICE_COOKIE, newDeviceKey, {
        httpOnly: true,
        sameSite: "lax",
        secure: this.deps.webOrigin.startsWith("https:"),
        path: "/",
        maxAge: DEVICE_COOKIE_DAYS * 86_400_000,
      });
    }
    return draft;
  }

  @Get(":id")
  async get(@Req() request: Request, @Param("id", new ParseUUIDPipe()) id: string) {
    return getDraft(this.deps.db, await this.access(request), id);
  }

  /** Autosave. 409 VERSION_CONFLICT with the latest draft; 422 ANSWERS_CONFLICT lists answers a change would remove. */
  @Patch(":id")
  @RateLimit("COMMERCIAL_WRITE")
  async update(
    @Req() request: Request,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updateConfigurationSchema)) body: z.infer<typeof updateConfigurationSchema>,
  ) {
    return updateDraft(this.deps.db, await this.access(request), id, body);
  }

  /** Emails a link to this draft so a guest can come back on any device. */
  @Post(":id/email")
  @HttpCode(200)
  @RateLimit("CONTACT")
  async email(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(emailDraftSchema)) body: z.infer<typeof emailDraftSchema>,
  ) {
    const { draft, session } = await emailDraftLink(this.deps, await this.access(request), id, body.email);
    if (session) setGuestCookie(response, this.deps.webOrigin, session.token, session.expiresAt);
    return draft;
  }

  /** Attaches the customer's uploaded artwork, logo, reference or garment photo. */
  @Post(":id/files")
  @RateLimit("COMMERCIAL_WRITE")
  async attach(@Req() request: Request, @Param("id", new ParseUUIDPipe()) id: string, @Body(new ZodValidationPipe(attachConfigurationFileSchema)) body: z.infer<typeof attachConfigurationFileSchema>) {
    return attachDraftFile(this.deps.db, await this.access(request), id, body);
  }

  @Post(":id/files/:linkId/low-resolution")
  @HttpCode(200)
  @RateLimit("COMMERCIAL_WRITE")
  async lowResolution(
    @Req() request: Request,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Param("linkId", new ParseUUIDPipe()) linkId: string,
    @Body(new ZodValidationPipe(lowResolutionActionSchema)) body: z.infer<typeof lowResolutionActionSchema>,
  ) {
    return setLowResolutionAction(this.deps.db, await this.access(request), id, linkId, body.action);
  }

  @Delete(":id/files/:linkId")
  @RateLimit("COMMERCIAL_WRITE")
  async removeFile(@Req() request: Request, @Param("id", new ParseUUIDPipe()) id: string, @Param("linkId", new ParseUUIDPipe()) linkId: string) {
    return removeDraftFile(this.deps.db, await this.access(request), id, linkId);
  }

  /** Per-item personalization from a CSV upload, checked row by row. */
  @Post(":id/personalization")
  @HttpCode(200)
  @RateLimit("COMMERCIAL_WRITE")
  async personalization(@Req() request: Request, @Param("id", new ParseUUIDPipe()) id: string, @Body(new ZodValidationPipe(personalizationImportSchema)) body: z.infer<typeof personalizationImportSchema>) {
    return importPersonalization(this.files, await this.access(request), id, body.fileId);
  }

  /** Request Final Quote (COM-FR-061): keeps every answer and creates a quote for staff to review. */
  @Post(":id/quote-request")
  @HttpCode(200)
  @RateLimit("CONTACT")
  async quoteRequest(@Req() request: Request, @Param("id", new ParseUUIDPipe()) id: string, @Body(new ZodValidationPipe(quoteRequestSchema)) body: z.infer<typeof quoteRequestSchema>) {
    return requestQuote(this.deps, await this.access(request), id, body);
  }
}
