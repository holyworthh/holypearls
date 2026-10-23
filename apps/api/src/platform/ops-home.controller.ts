import { Controller, Get, Inject, Req, UseGuards } from "@nestjs/common";
import type { Database } from "@holypearls/db";
import type { Request } from "express";
import { StaffGuard } from "../identity/staff.guard.js";
import { DATABASE } from "../tokens.js";
import { opsHome } from "./ops-home.js";

/** The admin home's work queues (T13-03; PRD-06 §17; Pen 95). Any staff member; each sees only their queues. */
@Controller("admin/home")
@UseGuards(StaffGuard())
export class OpsHomeController {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  @Get()
  async home(@Req() request: Request) {
    const actor = await request.getActor!();
    return opsHome(this.db, actor.type === "user" && actor.staff ? actor.staff.permissions : new Set(), actor.now);
  }
}
