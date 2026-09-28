import { type CanActivate, type ExecutionContext, SetMetadata } from "@nestjs/common";
import { type Database, lt, schema, sql } from "@holypearls/db";
import { createHash } from "node:crypto";
import type { Request, Response } from "express";
import { AppError } from "../errors.js";

interface Rule {
  limit: number;
  windowSeconds: number;
}

/** Starting values from TECH-02 §14. Each class counts per IP and, where known, per person. */
export const RATE_LIMITS = {
  PUBLIC_READ: { ip: { limit: 300, windowSeconds: 60 } },
  SEARCH: { ip: { limit: 60, windowSeconds: 60 } },
  AUTH: { ip: { limit: 10, windowSeconds: 60 }, subject: { limit: 5, windowSeconds: 15 * 60 } },
  GUEST_LINK_VERIFY: { ip: { limit: 10, windowSeconds: 60 } },
  UPLOAD_INTENT: { subject: { limit: 30, windowSeconds: 60 * 60 } },
  COMMERCIAL_WRITE: { subject: { limit: 20, windowSeconds: 60 } },
  ADMIN_WRITE: { subject: { limit: 120, windowSeconds: 60 } },
} as const satisfies Record<string, { ip?: Rule; subject?: Rule }>;

export type RateLimitClass = keyof typeof RATE_LIMITS;

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

/** Keys never hold raw IPs or emails; they are hashed with the class name. */
const bucketKey = (name: string, scope: string, value: string) =>
  `${name}:${scope}:${createHash("sha256").update(value).digest("base64url").slice(0, 32)}`;

/**
 * Fixed-window counters in PostgreSQL, so every API instance shares them
 * (ADR-013). One upsert per rule per request.
 */
export class RateLimiter {
  constructor(
    private readonly db: Database,
    private readonly now: () => Date = () => new Date(),
    private readonly enabled = true,
  ) {}

  /** Counts one hit against a rule and says whether it is still within the limit. */
  async hitRule(name: string, scope: string, value: string, rule: Rule): Promise<RateLimitResult> {
    if (!this.enabled) return { allowed: true, retryAfterSeconds: 0 };
    const nowMs = this.now().getTime();
    const windowMs = rule.windowSeconds * 1000;
    const windowStart = new Date(Math.floor(nowMs / windowMs) * windowMs);
    const expiresAt = new Date(windowStart.getTime() + windowMs);
    const result = await this.db.execute<{ count: number }>(sql`
      insert into ${schema.rateLimitBuckets} (key, window_start, count, expires_at)
      values (${bucketKey(name, scope, value)}, ${windowStart}, 1, ${expiresAt})
      on conflict (key, window_start) do update set count = ${schema.rateLimitBuckets.count} + 1
      returning count`);
    const count = Number(result.rows[0]?.count ?? 0);
    return { allowed: count <= rule.limit, retryAfterSeconds: Math.ceil((expiresAt.getTime() - nowMs) / 1000) };
  }

  /** Applies every rule of a class. `subject` is the account, staff member or guest link, when known. */
  async hit(name: RateLimitClass, subjects: { ip?: string; subject?: string }): Promise<RateLimitResult> {
    const rules: { ip?: Rule; subject?: Rule } = RATE_LIMITS[name];
    let retryAfterSeconds = 0;
    let allowed = true;
    for (const scope of ["ip", "subject"] as const) {
      const rule = rules[scope];
      const value = subjects[scope];
      if (!rule || !value) continue;
      const result = await this.hitRule(name, scope, value, rule);
      if (!result.allowed) {
        allowed = false;
        retryAfterSeconds = Math.max(retryAfterSeconds, result.retryAfterSeconds);
      }
    }
    return { allowed, retryAfterSeconds };
  }

  /** Removes finished windows; the daily clean-up job calls this (TECH-02 §8). */
  async removeExpired(): Promise<void> {
    await this.db.delete(schema.rateLimitBuckets).where(lt(schema.rateLimitBuckets.expiresAt, this.now()));
  }
}

export const RATE_LIMIT_CLASS = "hp:rate-limit";

/** Marks a route with its TECH-02 §14 class. */
export const RateLimit = (name: RateLimitClass) => SetMetadata(RATE_LIMIT_CLASS, name);

/** The client address as the API sees it (the web proxy and host set X-Forwarded-For). */
export const clientIp = (request: Request) =>
  (request.header("x-forwarded-for")?.split(",")[0]?.trim() || request.socket.remoteAddress) ?? "unknown";

export function rateLimitedError(retryAfterSeconds: number) {
  return new AppError("RATE_LIMITED", { context: { retryAfterSeconds } });
}

/** Global guard: applies the class set with @RateLimit on the route. */
export class RateLimitGuard implements CanActivate {
  constructor(private readonly limiter: RateLimiter) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const name = Reflect.getMetadata(RATE_LIMIT_CLASS, context.getHandler()) as RateLimitClass | undefined;
    if (!name) return true;
    const request = context.switchToHttp().getRequest<Request>();
    const actor = await request.getActor!();
    const subject = actor.type === "user" ? (actor.staff?.staffProfileId ?? actor.session.userId) : undefined;
    const result = await this.limiter.hit(name, { ip: clientIp(request), subject });
    if (!result.allowed) {
      context.switchToHttp().getResponse<Response>().setHeader("retry-after", String(result.retryAfterSeconds));
      throw rateLimitedError(result.retryAfterSeconds);
    }
    return true;
  }
}
