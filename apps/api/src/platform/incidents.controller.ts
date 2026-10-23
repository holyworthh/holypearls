import { Body, Controller, Get, HttpCode, Inject, Post, Req, UseGuards } from "@nestjs/common";
import {
  type IncidentState,
  type IncidentSwitchInput,
  incidentSwitchSchema,
  type RevokeGuestLinksInput,
  type RevokeSessionsInput,
  revokeGuestLinksSchema,
  revokeSessionsSchema,
} from "@holypearls/contracts";
import type { Database } from "@holypearls/db";
import type { Request } from "express";
import { revokeGuestLinks, revokeSessions } from "../identity/incidents.js";
import { StaffGuard } from "../identity/staff.guard.js";
import { paymentsPausedSince, setOnlinePayments } from "../payments/admin.js";
import { DATABASE } from "../tokens.js";
import { ZodValidationPipe } from "../validation.js";
import { incidentSwitches, setIncidentSwitch } from "./incidents.js";
import { RateLimit } from "./rate-limit.js";

const stateOf = (since: Date | null) => ({ on: since !== null, since: since?.toISOString() ?? null });

async function incidentState(db: Database): Promise<IncidentState> {
  const switches = await incidentSwitches(db);
  return { readOnly: stateOf(switches.readOnlySince), uploadsPaused: stateOf(switches.uploadsPausedSince), paymentsPaused: stateOf(await paymentsPausedSince(db)) };
}

/** Incident switches (T15-05; TECH-06 §14; Pen 123). SECURITY_ADMIN, each change with a recent authenticator check. */
@Controller("admin/incidents")
@UseGuards(StaffGuard("SECURITY_ADMIN"))
export class IncidentsAdminController {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  @Get()
  state(): Promise<IncidentState> {
    return incidentState(this.db);
  }

  @Post("switch")
  @HttpCode(200)
  @RateLimit("ADMIN_WRITE")
  async change(@Req() request: Request, @Body(new ZodValidationPipe(incidentSwitchSchema)) body: IncidentSwitchInput): Promise<IncidentState> {
    const actor = await request.getActor!();
    if (body.switch === "PAYMENTS_PAUSED") await setOnlinePayments(this.db, actor, !body.on);
    else await setIncidentSwitch(this.db, actor, body.switch, body.on);
    return incidentState(this.db);
  }

  @Post("revoke-sessions")
  @HttpCode(200)
  @RateLimit("ADMIN_WRITE")
  async sessions(@Req() request: Request, @Body(new ZodValidationPipe(revokeSessionsSchema)) body: RevokeSessionsInput) {
    return revokeSessions(this.db, await request.getActor!(), body);
  }

  @Post("revoke-guest-links")
  @HttpCode(200)
  @RateLimit("ADMIN_WRITE")
  async guestLinks(@Req() request: Request, @Body(new ZodValidationPipe(revokeGuestLinksSchema)) body: RevokeGuestLinksInput) {
    return revokeGuestLinks(this.db, await request.getActor!(), body);
  }
}
