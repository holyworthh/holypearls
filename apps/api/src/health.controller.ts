import { Controller, Get, Inject, Res } from "@nestjs/common";
import type { HealthReady } from "@holypearls/contracts";
import type { Database } from "@holypearls/db";
import { sql } from "@holypearls/db";
import type { Response } from "express";
import type { Logger } from "pino";
import { DATABASE, LOGGER } from "./tokens.js";

const READY_TIMEOUT_MS = 2000;

/** TECH-07 §8. Outside /v1; readiness checks the database only, never outside services. */
@Controller("health")
export class HealthController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  @Get("live")
  live() {
    return { status: "ok" as const };
  }

  @Get("ready")
  async ready(@Res({ passthrough: true }) response: Response): Promise<HealthReady> {
    try {
      await Promise.race([
        this.db.execute(sql`select 1`),
        new Promise((_, reject) => setTimeout(() => reject(new Error("database check timed out")), READY_TIMEOUT_MS)),
      ]);
      return { status: "ok", checks: { database: "ok" } };
    } catch (error) {
      this.logger.warn({ err: error }, "readiness check failed");
      response.status(503);
      return { status: "unavailable", checks: { database: "unavailable" } };
    }
  }
}
