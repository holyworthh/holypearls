import { type CanActivate, type ExecutionContext, SetMetadata } from "@nestjs/common";
import { type Database, lt, schema, sql } from "@holypearls/db";
import { createHash, timingSafeEqual } from "node:crypto";
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
  /** Public "contact us" writes such as help requests: a person rarely sends more than a few an hour. */
  CONTACT: { ip: { limit: 5, windowSeconds: 10 * 60 }, subject: { limit: 10, windowSeconds: 60 * 60 } },
  UPLOAD_INTENT: { subject: { limit: 30, windowSeconds: 60 * 60 } },
  /**
   * Drafts, carts and checkouts. Anonymous drafts have no account or guest
   * link yet, so the address counts too (review P1-08); a browser's device
   * cookie, once it has one, is its subject.
   */
  COMMERCIAL_WRITE: { ip: { limit: 60, windowSeconds: 60 }, subject: { limit: 20, windowSeconds: 60 } },
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

/** Header names the web app's proxy sets on every /api request (apps/web/src/proxy.ts). */
export const CLIENT_IP_HEADER = "x-hp-client-ip";
export const PROXY_SECRET_HEADER = "x-hp-proxy-secret";

/**
 * The visitor's address (review P1-08). X-Forwarded-For is never trusted: anyone
 * can send it. The web app's proxy, which sees the real address, passes it in
 * x-hp-client-ip with a shared secret; any other request counts as the address
 * that connected.
 */
export function clientIpFrom(request: Request, proxySecrets: (string | null)[]): string {
  const claimed = request.header(CLIENT_IP_HEADER)?.trim();
  const secret = request.header(PROXY_SECRET_HEADER);
  // Either front end's proxy (customer site or admin, ADR-017) may vouch for the address.
  const vouched = proxySecrets.some((proxySecret) => proxySecret && secret && secret.length === proxySecret.length && timingSafeEqual(Buffer.from(secret), Buffer.from(proxySecret)));
  if (vouched && claimed && /^[0-9a-fA-F.:]{2,45}$/.test(claimed)) {
    return claimed;
  }
  return request.socket.remoteAddress ?? "unknown";
}

/** The visitor's address worked out once per request (see clientIpFrom). */
export const clientIp = (request: Request) => request.clientIp ?? request.socket.remoteAddress ?? "unknown";

/** The device cookie's value, without importing the drafts module (it's only hashed into a bucket key). */
function deviceCookieValue(request: Request): string | null {
  const match = /(?:^|;\s*)hp\.device=([A-Za-z0-9-]{40,100})(?:;|$)/.exec(request.header("cookie") ?? "");
  return match?.[1] ?? null;
}

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
    const device = deviceCookieValue(request);
    const subject =
      actor.type === "user"
        ? (actor.staff?.staffProfileId ?? actor.session.userId)
        : actor.type === "guest"
          ? actor.guest.guestSessionId
          : device
            ? `device:${device}`
            : undefined;
    const result = await this.limiter.hit(name, { ip: clientIp(request), subject });
    if (!result.allowed) {
      context.switchToHttp().getResponse<Response>().setHeader("retry-after", String(result.retryAfterSeconds));
      throw rateLimitedError(result.retryAfterSeconds);
    }
    return true;
  }
}
