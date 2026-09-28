import "reflect-metadata";
import { Module, RequestMethod, type Type } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { IdentityAdapter } from "@holypearls/auth";
import { ERROR_CODES } from "@holypearls/contracts";
import type { Database } from "@holypearls/db";
import type { Jobs } from "@holypearls/jobs";
import type { NextFunction, Request, Response } from "express";
import type { Logger } from "pino";
import { ErrorShapeFilter } from "./errors.js";
import { HealthController } from "./health.controller.js";
import { actorResolver } from "./identity/actor.js";
import { AdminController } from "./identity/admin.controller.js";
import { authRoutes } from "./identity/auth-routes.js";
import { MeController } from "./identity/me.controller.js";
import { MonitoringController } from "./identity/monitoring.controller.js";
import { originCheck } from "./identity/origin-check.js";
import { requestContext } from "./request-context.js";
import { CustomerAccessController } from "./identity/customer-access.controller.js";
import { StaffAccessController } from "./identity/staff-access.controller.js";
import { AdminHelpController, HelpController } from "./platform/help.controller.js";
import { NotificationsController } from "./platform/notifications.controller.js";
import { AuditController } from "./platform/audit.controller.js";
import { DemoSliceController } from "./platform/demo-slice.controller.js";
import { IdempotencyInterceptor } from "./platform/idempotency.js";
import { RateLimiter, RateLimitGuard } from "./platform/rate-limit.js";
import { DATABASE, HELP_DEPS, IDENTITY, JOBS, LOGGER } from "./tokens.js";

export interface CreateAppOptions {
  db: Database;
  logger: Logger;
  identity: IdentityAdapter;
  /** The web app's origin; state-changing requests must come from it (TECH-03 §13). */
  webOrigin: string;
  /** Queues background jobs (a sender; the worker runs them). */
  jobs: Jobs;
  /** DATA_ENCRYPTION_KEY: seals email data that carries a link secret or code. */
  sealKey: string;
  /** Where new help requests are announced to staff. */
  helpInboxEmail: string;
  /** Serves the T00-04 demo routes. Never on in production. */
  demoSlice?: boolean;
  /** Rate limits (TECH-02 §14). Browser and most API tests turn them off. */
  rateLimit?: boolean;
  /** Clock, for tests. */
  now?: () => Date;
  /** Extra controllers; tests use this to exercise the conventions on a throwaway route. */
  controllers?: Type[];
}

export async function createApp(options: CreateAppOptions): Promise<NestExpressApplication> {
  const now = options.now ?? (() => new Date());
  const limiter = new RateLimiter(options.db, now, options.rateLimit ?? true);
  @Module({
    controllers: [
      HealthController,
      MeController,
      AdminController,
      MonitoringController,
      StaffAccessController,
      AuditController,
      CustomerAccessController,
      HelpController,
      AdminHelpController,
      NotificationsController,
      ...(options.demoSlice ? [DemoSliceController] : []),
      ...(options.controllers ?? []),
    ],
    providers: [
      { provide: JOBS, useValue: options.jobs },
      {
        provide: HELP_DEPS,
        useValue: {
          db: options.db,
          jobs: options.jobs,
          sealKey: options.sealKey,
          webOrigin: options.webOrigin,
          helpInboxEmail: options.helpInboxEmail,
        },
      },
      { provide: DATABASE, useValue: options.db },
      { provide: LOGGER, useValue: options.logger },
      { provide: IDENTITY, useValue: options.identity },
      { provide: APP_FILTER, useFactory: (logger: Logger) => new ErrorShapeFilter(logger), inject: [LOGGER] },
      { provide: APP_GUARD, useValue: new RateLimitGuard(limiter) },
      { provide: APP_INTERCEPTOR, useValue: new IdempotencyInterceptor(options.db, now) },
    ],
  })
  class AppModule {}

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Parsers are added below, after the sign-in routes, which read the raw body.
    bodyParser: false,
    logger: {
      log: (message: unknown) => options.logger.info({ nest: true }, String(message)),
      error: (message: unknown) => options.logger.error({ nest: true }, String(message)),
      warn: (message: unknown) => options.logger.warn({ nest: true }, String(message)),
      debug: (message: unknown) => options.logger.debug({ nest: true }, String(message)),
      verbose: (message: unknown) => options.logger.trace({ nest: true }, String(message)),
    },
  });
  const getActor = actorResolver(options.identity, options.db, now);

  app.use(requestContext(options.logger));
  app.use(originCheck(options.webOrigin));
  app.use((request: Request, _response: Response, next: NextFunction) => {
    request.getActor = () => getActor(request);
    next();
  });
  app.use(
    authRoutes({ identity: options.identity, webOrigin: options.webOrigin, logger: options.logger, db: options.db, limiter }),
  );
  app.useBodyParser("json", { limit: "1mb" });
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
    response
      .status(404)
      .json({ code: "NOT_FOUND", message: ERROR_CODES.NOT_FOUND.message, requestId: request.requestId ?? "unknown" });
  });
  return app;
}
