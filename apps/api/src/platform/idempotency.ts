import {
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
  SetMetadata,
} from "@nestjs/common";
import { IDEMPOTENCY_KEY_HEADER } from "@holypearls/contracts";
import { and, type Database, eq, lt, schema } from "@holypearls/db";
import { createHash } from "node:crypto";
import type { Request, Response } from "express";
import { from, lastValueFrom, type Observable } from "rxjs";
import { AppError } from "../errors.js";
import { clientIp } from "./rate-limit.js";

const KEEP_MS = 24 * 60 * 60 * 1000;
const KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

export const IDEMPOTENT = "hp:idempotent";

/** Marks a route that needs an Idempotency-Key header (TECH-02 §4). */
export const Idempotent = () => SetMetadata(IDEMPOTENT, true);

const fingerprintOf = (request: Request) =>
  createHash("sha256")
    .update(`${request.method} ${request.originalUrl.split("?")[0]}\n${JSON.stringify(request.body ?? null)}`)
    .digest("base64url");

/**
 * Safe retries. The same key with the same request returns the first result;
 * the same key with a different request returns 409. Keys last 24 hours and
 * belong to one actor, so one person's key never replays for another.
 */
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly db: Database,
    private readonly now: () => Date = () => new Date(),
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!Reflect.getMetadata(IDEMPOTENT, context.getHandler())) return next.handle();
    return from(this.run(context, next));
  }

  private async run(context: ExecutionContext, next: CallHandler): Promise<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const key = request.header(IDEMPOTENCY_KEY_HEADER);
    if (!key || !KEY_PATTERN.test(key)) {
      throw new AppError("VALIDATION_FAILED", {
        fieldErrors: { [IDEMPOTENCY_KEY_HEADER]: "Send a unique Idempotency-Key header (16–128 letters, digits, - or _)" },
      });
    }
    const actor = await request.getActor!();
    const actorKey = actor.type === "user" ? `user:${actor.session.userId}` : `ip:${clientIp(request)}`;
    const fingerprint = fingerprintOf(request);
    const where = and(eq(schema.idempotencyKeys.actorKey, actorKey), eq(schema.idempotencyKeys.key, key));

    await this.db.delete(schema.idempotencyKeys).where(and(where, lt(schema.idempotencyKeys.expiresAt, this.now())));
    const claimed = await this.db
      .insert(schema.idempotencyKeys)
      .values({ actorKey, key, fingerprint, expiresAt: new Date(this.now().getTime() + KEEP_MS) })
      .onConflictDoNothing()
      .returning({ key: schema.idempotencyKeys.key });

    if (claimed.length === 0) {
      const [existing] = await this.db.select().from(schema.idempotencyKeys).where(where);
      if (!existing || existing.fingerprint !== fingerprint) {
        throw new AppError("CONFLICT", { context: { reason: "IDEMPOTENCY_KEY_REUSED" } });
      }
      if (existing.statusCode === null) {
        throw new AppError("CONFLICT", { context: { reason: "IDEMPOTENCY_IN_PROGRESS" } });
      }
      response.status(existing.statusCode);
      response.setHeader("idempotent-replay", "true");
      return existing.responseBody;
    }

    try {
      const result = await lastValueFrom(next.handle(), { defaultValue: undefined });
      await this.db
        .update(schema.idempotencyKeys)
        .set({ statusCode: response.statusCode, responseBody: (result ?? null) as never })
        .where(where);
      return result;
    } catch (error) {
      // A failed request frees the key so the retry can run again.
      await this.db.delete(schema.idempotencyKeys).where(where);
      throw error;
    }
  }
}

