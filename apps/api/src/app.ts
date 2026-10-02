import "reflect-metadata";
import { Module, RequestMethod, type Type } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { IdentityAdapter } from "@holypearls/auth";
import { ERROR_CODES } from "@holypearls/contracts";
import type { Database } from "@holypearls/db";
import type { Jobs } from "@holypearls/jobs";
import type { PaymentGateway } from "@holypearls/payments";
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
import { CatalogueAdminController, CategoryAdminController } from "./catalogue/catalogue.controller.js";
import { MerchandisingAdminController, PublicMediaController, StorefrontController } from "./catalogue/storefront.controller.js";
import { ContentAdminController, ContentController } from "./catalogue/content.controller.js";
import { SearchAdminController, SearchController, SeoController } from "./catalogue/search.controller.js";
import { ConfigurationsController } from "./configuration/drafts.controller.js";
import { PricingAdminController, PublicPricingController } from "./configuration/pricing.controller.js";
import { CartController, CheckoutController, DeliveryZonesAdminController } from "./sales/sales.controller.js";
import { PaystackWebhookController } from "./payments/payments.controller.js";
import { PaymentsAdminController } from "./payments/admin.controller.js";
import { OrdersController } from "./orders/orders.controller.js";
import { ProjectsController, RecommendationRulesAdminController } from "./projects/projects.controller.js";
import { QuoteSettingsAdminController, QuotesAdminController, RequestsAdminController } from "./quotes/quotes.controller.js";
import { CustomerQuotesController, OrderPaymentsController } from "./quotes/customer.controller.js";
import { CustomerProofsController, FileReviewAdminController, ProofsAdminController } from "./proofs/proofs.controller.js";
import { FilesController } from "./files/files.controller.js";
import { localStorageRefused, localStorageRoute } from "./files/local-storage-route.js";
import { CustomerAccessController } from "./identity/customer-access.controller.js";
import { StaffAccessController } from "./identity/staff-access.controller.js";
import { AdminHelpController, HelpController } from "./platform/help.controller.js";
import { NotificationsController } from "./platform/notifications.controller.js";
import { AuditController } from "./platform/audit.controller.js";
import { DemoSliceController } from "./platform/demo-slice.controller.js";
import { IdempotencyInterceptor } from "./platform/idempotency.js";
import { clientIpFrom, RateLimiter, RateLimitGuard } from "./platform/rate-limit.js";
import { type FrontEnds, frontEndBoundary, separated, surfaceOf } from "./identity/front-ends.js";
import { DATABASE, FILE_DEPS, HELP_DEPS, IDENTITY, JOBS, LOGGER, PAYMENT_DEPS } from "./tokens.js";
import { LocalDiskStorage, type StorageAdapter } from "@holypearls/storage";

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
  /** Private files (R2 or the local disk) and the public-media bucket for staff images (TECH-04 §2). */
  storage: StorageAdapter;
  publicStorage: StorageAdapter;
  /** Paystack (TECH-05); null when no key is set, and payments show as not available. */
  payments: PaymentGateway | null;
  /** Serves the T00-04 demo routes. Never on in production. */
  demoSlice?: boolean;
  /** Rate limits (TECH-02 §14). Browser and most API tests turn them off. */
  rateLimit?: boolean;
  /** WEB_PROXY_SECRET: proves the web app's proxy sent the visitor's address (review P1-08). */
  proxySecret?: string | null;
  /** The admin app's origin (ADR-017). Null: one front end serves everything (local and older tests). */
  adminOrigin?: string | null;
  /** ADMIN_PROXY_SECRET: proves a request came through the admin app's proxy. */
  adminProxySecret?: string | null;
  /** Clock, for tests. */
  now?: () => Date;
  /** Extra controllers; tests use this to exercise the conventions on a throwaway route. */
  controllers?: Type[];
}

/** Keeps the request body as bytes, and marks it read so the JSON parser leaves it alone. */
function rawBody(limit: number) {
  return (request: Request, response: Response, next: NextFunction) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size <= limit) chunks.push(chunk);
    });
    request.on("end", () => {
      if (size > limit) {
        response.status(413).json({ code: "VALIDATION_FAILED", message: ERROR_CODES.VALIDATION_FAILED.message, requestId: request.requestId ?? "unknown" });
        return;
      }
      request.body = Buffer.concat(chunks);
      (request as Request & { _body?: boolean })._body = true;
      next();
    });
    request.on("error", next);
  };
}

export async function createApp(options: CreateAppOptions): Promise<NestExpressApplication> {
  const now = options.now ?? (() => new Date());
  const fronts: FrontEnds = {
    webOrigin: options.webOrigin,
    adminOrigin: options.adminOrigin ?? null,
    webProxySecret: options.proxySecret ?? null,
    adminProxySecret: options.adminProxySecret ?? null,
  };
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
      FilesController,
      CatalogueAdminController,
      CategoryAdminController,
      StorefrontController,
      PublicMediaController,
      MerchandisingAdminController,
      ContentController,
      ContentAdminController,
      SearchController,
      SearchAdminController,
      SeoController,
      PricingAdminController,
      PublicPricingController,
      CartController,
      CheckoutController,
      DeliveryZonesAdminController,
      PaystackWebhookController,
      PaymentsAdminController,
      OrdersController,
      ConfigurationsController,
      ProjectsController,
      RecommendationRulesAdminController,
      RequestsAdminController,
      QuotesAdminController,
      QuoteSettingsAdminController,
      CustomerQuotesController,
      OrderPaymentsController,
      CustomerProofsController,
      ProofsAdminController,
      FileReviewAdminController,
      ...(options.demoSlice ? [DemoSliceController] : []),
      ...(options.controllers ?? []),
    ],
    providers: [
      { provide: JOBS, useValue: options.jobs },
      {
        provide: FILE_DEPS,
        useValue: { db: options.db, jobs: options.jobs, storage: options.storage, publicStorage: options.publicStorage },
      },
      {
        provide: HELP_DEPS,
        useValue: {
          db: options.db,
          jobs: options.jobs,
          sealKey: options.sealKey,
          webOrigin: options.webOrigin,
          adminOrigin: options.adminOrigin ?? options.webOrigin,
          helpInboxEmail: options.helpInboxEmail,
        },
      },
      { provide: PAYMENT_DEPS, useValue: { db: options.db, jobs: options.jobs, gateway: options.payments, webOrigin: options.webOrigin, sealKey: options.sealKey } },
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
  // Security headers on every response (TECH-06, review P2-07). The API sends JSON and images only,
  // so its policy allows nothing to run or embed it; HSTS where it's served over HTTPS.
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader("x-content-type-options", "nosniff");
    response.setHeader("referrer-policy", "no-referrer");
    response.setHeader("content-security-policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    response.setHeader("x-frame-options", "DENY");
    response.setHeader("cross-origin-resource-policy", "same-site");
    if (options.webOrigin.startsWith("https:")) response.setHeader("strict-transport-security", "max-age=31536000; includeSubDomains");
    next();
  });
  app.use((request: Request, _response: Response, next: NextFunction) => {
    request.clientIp = clientIpFrom(request, [fronts.webProxySecret, fronts.adminProxySecret]);
    request.surface = surfaceOf(request, fronts);
    request.frontEndsSeparated = separated(fronts);
    next();
  });
  app.use(frontEndBoundary(fronts));
  app.use(originCheck(fronts));
  app.use((request: Request, _response: Response, next: NextFunction) => {
    request.getActor = () => getActor(request);
    next();
  });
  app.use(
    authRoutes({ identity: options.identity, webOrigin: options.webOrigin, fronts, logger: options.logger, db: options.db, limiter }),
  );
  const localStores = [...new Set([options.storage, options.publicStorage])].filter((store) => store instanceof LocalDiskStorage);
  for (const store of localStores) app.use(localStorageRoute(store));
  if (localStores.length) app.use(localStorageRefused);
  // Paystack signs the exact bytes it sent, so its webhook keeps the raw body (TECH-02 §9).
  app.use("/v1/webhooks/paystack", rawBody(1024 * 1024));
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
