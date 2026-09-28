import "reflect-metadata";
import { type INestApplication, Module, RequestMethod, type Type } from "@nestjs/common";
import { APP_FILTER, NestFactory } from "@nestjs/core";
import type { Database } from "@holypearls/db";
import type { Logger } from "pino";
import { ErrorShapeFilter } from "./errors.js";
import { HealthController } from "./health.controller.js";
import { requestContext } from "./request-context.js";
import { DATABASE, LOGGER } from "./tokens.js";
import { ERROR_CODES } from "@holypearls/contracts";
import type { Request, Response } from "express";

export interface CreateAppOptions {
  db: Database;
  logger: Logger;
  /** Extra controllers; tests use this to exercise the conventions on a throwaway route. */
  controllers?: Type[];
}

export async function createApp(options: CreateAppOptions): Promise<INestApplication> {
  @Module({
    controllers: [HealthController, ...(options.controllers ?? [])],
    providers: [
      { provide: DATABASE, useValue: options.db },
      { provide: LOGGER, useValue: options.logger },
      { provide: APP_FILTER, useFactory: (logger: Logger) => new ErrorShapeFilter(logger), inject: [LOGGER] },
    ],
  })
  class AppModule {}

  const app = await NestFactory.create(AppModule, {
    logger: {
      log: (message: unknown) => options.logger.info({ nest: true }, String(message)),
      error: (message: unknown) => options.logger.error({ nest: true }, String(message)),
      warn: (message: unknown) => options.logger.warn({ nest: true }, String(message)),
      debug: (message: unknown) => options.logger.debug({ nest: true }, String(message)),
      verbose: (message: unknown) => options.logger.trace({ nest: true }, String(message)),
    },
  });
  app.use(requestContext(options.logger));
  // TECH-02 §1: every API route lives under /v1; health checks stay at the root (TECH-07 §8).
  app.setGlobalPrefix("v1", {
    exclude: [
      { path: "health/live", method: RequestMethod.GET },
      { path: "health/ready", method: RequestMethod.GET },
    ],
  });
  await app.init();
  // Paths outside every route (including outside /v1) still get the error shape, not HTML.
  app.use((request: Request, response: Response) => {
    response.status(404).json({ code: "NOT_FOUND", message: ERROR_CODES.NOT_FOUND.message, requestId: request.requestId ?? "unknown" });
  });
  return app;
}
