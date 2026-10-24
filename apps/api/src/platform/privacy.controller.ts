import { Body, Controller, HttpCode, Inject, Post, Req, Res, UseGuards } from "@nestjs/common";
import { type PrivacyErase, type PrivacyLookup, type PrivacyPerson, privacyEraseSchema, privacyLookupSchema } from "@holypearls/contracts";
import type { Database } from "@holypearls/db";
import type { Request, Response } from "express";
import { StaffGuard } from "../identity/staff.guard.js";
import { DATABASE } from "../tokens.js";
import { ZodValidationPipe } from "../validation.js";
import { Idempotent } from "./idempotency.js";
import { erasePerson, exportPerson, lookupPerson } from "./privacy.js";
import { RateLimit } from "./rate-limit.js";

/**
 * Privacy requests (T15-03; TECH-06 §12; Pen 129). The email is in the body,
 * never the address, so it stays out of URLs and logs. Export is not
 * idempotent-cached: its response is personal data.
 */
@Controller("admin/privacy")
@UseGuards(StaffGuard("EXPORT_PERSONAL_DATA"))
export class PrivacyController {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  @Post("lookup")
  @HttpCode(200)
  @RateLimit("ADMIN_WRITE")
  async lookup(@Req() request: Request, @Body(new ZodValidationPipe(privacyLookupSchema)) body: PrivacyLookup): Promise<PrivacyPerson> {
    return lookupPerson(this.db, await request.getActor!(), body.email);
  }

  @Post("export")
  @HttpCode(200)
  @RateLimit("ADMIN_WRITE")
  async export(@Req() request: Request, @Res({ passthrough: true }) response: Response, @Body(new ZodValidationPipe(privacyLookupSchema)) body: PrivacyLookup) {
    const actor = await request.getActor!();
    const data = await exportPerson(this.db, actor, body.email);
    response.setHeader("content-disposition", `attachment; filename="holypearls-person-${actor.now.toISOString().slice(0, 10)}.json"`);
    response.setHeader("cache-control", "no-store");
    // Amounts are bigint in the database; the file carries them as strings.
    return JSON.parse(JSON.stringify(data, (_key, value) => (typeof value === "bigint" ? value.toString() : value)));
  }

  @Post("erase")
  @HttpCode(200)
  @RateLimit("ADMIN_WRITE")
  @Idempotent()
  async erase(@Req() request: Request, @Body(new ZodValidationPipe(privacyEraseSchema)) body: PrivacyErase): Promise<PrivacyPerson> {
    return erasePerson(this.db, await request.getActor!(), body.email);
  }
}
