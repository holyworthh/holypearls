import { Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from "@nestjs/common";
import { type NotificationEntry, type NotificationPage, notificationQuerySchema } from "@holypearls/contracts";
import type { Request } from "express";
import type { z } from "zod";
import { AppError } from "../errors.js";
import { requireUser } from "../identity/actor.js";
import { StaffGuard } from "../identity/staff.guard.js";
import { HELP_DEPS, type HelpDepsToken } from "../tokens.js";
import { ZodValidationPipe } from "../validation.js";
import { Idempotent } from "./idempotency.js";
import { findNotification, listNotifications, queueEmail, resendNotification } from "./notifications.js";
import { RateLimit } from "./rate-limit.js";

/** Admin notification log and resend (CUSTOMER_SUPPORT, Pen frame 102). */
@Controller("admin/notifications")
@UseGuards(StaffGuard("CUSTOMER_SUPPORT"))
export class NotificationsController {
  constructor(@Inject(HELP_DEPS) private readonly deps: HelpDepsToken) {}

  @Get()
  list(@Query(new ZodValidationPipe(notificationQuerySchema)) query: z.infer<typeof notificationQuerySchema>): Promise<NotificationPage> {
    return listNotifications(this.deps.db, query);
  }

  @Get(":id")
  async get(@Param("id", new ParseUUIDPipe()) id: string): Promise<NotificationEntry> {
    const entry = await findNotification(this.deps.db, id);
    if (!entry) throw new AppError("NOT_FOUND");
    return entry;
  }

  /** Resending creates a new record; the old one is kept. */
  @Post(":id/resend")
  @HttpCode(200)
  @RateLimit("ADMIN_WRITE")
  @Idempotent()
  async resend(@Req() request: Request, @Param("id", new ParseUUIDPipe()) id: string): Promise<NotificationEntry> {
    return resendNotification(this.deps, await request.getActor!(), id);
  }

  /** Sends a test email to the signed-in staff member, to check the email set-up. */
  @Post("test")
  @HttpCode(200)
  @RateLimit("ADMIN_WRITE")
  async test(@Req() request: Request): Promise<NotificationEntry> {
    const actor = requireUser(await request.getActor!());
    const id = await queueEmail(this.deps, this.deps.db, {
      template: "test_email",
      to: actor.session.email,
      data: { requestedBy: actor.staff?.displayName ?? actor.session.name },
      requestId: actor.requestId,
    });
    return (await findNotification(this.deps.db, id!))!;
  }
}
