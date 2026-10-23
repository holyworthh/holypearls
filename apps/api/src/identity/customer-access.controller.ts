import { Public } from "./identified.guard.js";
import { Body, Controller, Delete, HttpCode, Inject, Param, ParseUUIDPipe, Post, Req, Res, UseGuards } from "@nestjs/common";
import {
  redeemGuestLinkSchema,
  requestEmailCodeSchema,
  verifyEmailCodeSchema,
} from "@holypearls/contracts";
import type { Request, Response } from "express";
import type { z } from "zod";
import { RateLimit } from "../platform/rate-limit.js";
import { HELP_DEPS, type HelpDepsToken } from "../tokens.js";
import { ZodValidationPipe } from "../validation.js";
import { GUEST_SESSION_COOKIE, redeemGuestLink, requestEmailCode, revokeGuestLink, verifyEmailCode } from "./customers.js";
import { StaffGuard } from "./staff.guard.js";

/** Sets the guest session cookie: HttpOnly, SameSite=Lax, this domain only (TECH-03 §4–5). */
export function setGuestCookie(response: Response, webOrigin: string, token: string, expiresAt: Date) {
  response.cookie(GUEST_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: webOrigin.startsWith("https:"),
    path: "/",
    expires: expiresAt,
  });
}

/** Guest links and email codes (TECH-03 §5). */
@Controller()
export class CustomerAccessController {
  constructor(@Inject(HELP_DEPS) private readonly deps: HelpDepsToken) {}

  /** Exchanges a link secret for a guest session; the page then moves to a clean URL. */
  @Post("guest-links/redeem")
  @Public()
  @HttpCode(200)
  @RateLimit("GUEST_LINK_VERIFY")
  async redeem(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body(new ZodValidationPipe(redeemGuestLinkSchema)) body: z.infer<typeof redeemGuestLinkSchema>,
  ) {
    const actor = await request.getActor!();
    const result = await redeemGuestLink(this.deps.db, body.secret, actor.now);
    setGuestCookie(response, this.deps.webOrigin, result.session.token, result.session.expiresAt);
    // Pages opened by guest link never send their address onwards (TECH-03 §5).
    response.setHeader("referrer-policy", "no-referrer");
    return { purpose: result.purpose, targetId: result.targetId, redirectTo: result.redirectTo };
  }

  @Delete("guest-session")
  @Public()
  @HttpCode(200)
  endGuestSession(@Res({ passthrough: true }) response: Response) {
    response.clearCookie(GUEST_SESSION_COOKIE, { path: "/" });
    return { ended: true as const };
  }

  @Post("email-codes")
  @Public()
  @RateLimit("GUEST_LINK_VERIFY")
  async requestCode(
    @Req() request: Request,
    @Body(new ZodValidationPipe(requestEmailCodeSchema)) body: z.infer<typeof requestEmailCodeSchema>,
  ) {
    const actor = await request.getActor!();
    const sent = await requestEmailCode(this.deps, actor, body.purpose, actor.now);
    return { sentTo: sent.sentTo, expiresAt: sent.expiresAt.toISOString() };
  }

  @Post("email-codes/verify")
  @Public()
  @HttpCode(200)
  @RateLimit("GUEST_LINK_VERIFY")
  async verifyCode(
    @Req() request: Request,
    @Body(new ZodValidationPipe(verifyEmailCodeSchema)) body: z.infer<typeof verifyEmailCodeSchema>,
  ) {
    const actor = await request.getActor!();
    const result = await verifyEmailCode(this.deps.db, this.deps.sealKey, actor, body.purpose, body.code, actor.now);
    return { verifiedAt: result.verifiedAt.toISOString() };
  }

  /** Staff turn a guest link off (TECH-03 §5). Audited. */
  @Post("admin/guest-links/:id/revoke")
  @HttpCode(200)
  @UseGuards(StaffGuard("CUSTOMER_SUPPORT"))
  @RateLimit("ADMIN_WRITE")
  async revoke(@Req() request: Request, @Param("id", new ParseUUIDPipe()) id: string) {
    const actor = await request.getActor!();
    await revokeGuestLink(this.deps.db, actor, id, actor.now);
    return { revoked: true as const };
  }
}
