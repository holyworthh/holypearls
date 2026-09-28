import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Req, Res } from "@nestjs/common";
import { createConfigurationSchema, emailDraftSchema, updateConfigurationSchema } from "@holypearls/contracts";
import type { Request, Response } from "express";
import type { z } from "zod";
import { RateLimit } from "../platform/rate-limit.js";
import { HELP_DEPS, type HelpDepsToken } from "../tokens.js";
import { ZodValidationPipe } from "../validation.js";
import { createDraft, type DraftAccess, emailDraftLink, getDraft, updateDraft } from "./drafts.js";

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
  constructor(@Inject(HELP_DEPS) private readonly deps: HelpDepsToken) {}

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
  async email(@Req() request: Request, @Param("id", new ParseUUIDPipe()) id: string, @Body(new ZodValidationPipe(emailDraftSchema)) body: z.infer<typeof emailDraftSchema>) {
    return emailDraftLink(this.deps, await this.access(request), id, body.email);
  }
}
