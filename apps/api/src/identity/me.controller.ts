import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Req } from "@nestjs/common";
import type { IdentityAdapter } from "@holypearls/auth";
import { type AccountHistory, type AccountList, type Me, type Profile, profileInputSchema, type SessionList } from "@holypearls/contracts";
import type { z } from "zod";
import type { Request } from "express";
import { and, type Database, eq, gt, schema, sql } from "@holypearls/db";
import { recordAudit } from "../platform/audit.js";
import { enforce, findOrHide } from "../platform/policy.js";
import { DATABASE, IDENTITY } from "../tokens.js";
import { canRevokeSession, findSessionForActor } from "./policies.js";
import { requireUser, toHeaders } from "./actor.js";
import { accountHistory, accountList, getProfile, updateProfile } from "./account.js";
import { ZodValidationPipe } from "../validation.js";

/** Describes a session by browser and system, never by raw user agent. */
export function describeDevice(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Firefox\//.test(userAgent)
      ? "Firefox"
      : /Chrome\//.test(userAgent)
        ? "Chrome"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : "Browser";
  const system = /iPhone|iPad/.test(userAgent)
    ? "iPhone"
    : /Android/.test(userAgent)
      ? "Android"
      : /Windows/.test(userAgent)
        ? "Windows"
        : /Mac OS X/.test(userAgent)
          ? "macOS"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "another system";
  return `${browser} on ${system}`;
}

/** The signed-in person's own sign-in details (TECH-03 §3). */
/** How many sessions the security page lists: this device plus the most recently active others. */
export const SESSION_LIST_LIMIT = 10;

@Controller("me")
export class MeController {
  constructor(
    @Inject(IDENTITY) private readonly identity: IdentityAdapter,
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  @Get()
  async me(@Req() request: Request): Promise<Me> {
    const actor = requireUser(await request.getActor!());
    const { session } = actor;
    const profile = await getProfile(this.db, actor);
    return {
      userId: session.userId,
      name: session.name,
      email: session.email,
      emailVerified: session.emailVerified,
      phone: profile.phone,
      marketingConsent: profile.marketingConsent,
      pendingEmail: profile.pendingEmail,
      isStaff: actor.staff !== null,
      mfa: { enabled: session.mfaEnabled, verifiedAt: session.mfaVerifiedAt?.toISOString() ?? null },
      session: { createdAt: session.createdAt.toISOString(), expiresAt: session.expiresAt.toISOString() },
    };
  }

  /** The account overview: drafts, orders, quotes and projects, receipts and guest linking (TECH-03 §6). */
  @Get("history")
  async history(@Req() request: Request): Promise<AccountHistory> {
    return accountHistory(this.db, requireUser(await request.getActor!()));
  }

  /** One history list in full: orders, quotes, projects, drafts or receipts (T09-01b). */
  @Get("history/:list")
  async list(@Req() request: Request, @Param("list") list: string): Promise<AccountList> {
    return accountList(this.db, requireUser(await request.getActor!()), list);
  }

  @Patch("profile")
  async profile(@Req() request: Request, @Body(new ZodValidationPipe(profileInputSchema)) body: z.infer<typeof profileInputSchema>): Promise<Profile> {
    return updateProfile(this.db, requireUser(await request.getActor!()), body);
  }

  @Get("sessions")
  async sessions(@Req() request: Request): Promise<SessionList> {
    const actor = requireUser(await request.getActor!());
    const sessions = await this.identity.listSessions(toHeaders(request));
    // Better Auth returns at most one page of sessions, so the total is counted here.
    const [count] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(schema.sessions)
      .where(and(eq(schema.sessions.userId, actor.session.userId), gt(schema.sessions.expiresAt, new Date())));
    return {
      total: Math.max(count?.total ?? 0, sessions.length),
      sessions: sessions
        .sort((a, b) => Number(b.current) - Number(a.current) || b.updatedAt.getTime() - a.updatedAt.getTime())
        // This device always comes first, so the limit never hides it.
        .slice(0, SESSION_LIST_LIMIT)
        .map((session) => ({
          sessionId: session.sessionId,
          current: session.current,
          device: describeDevice(session.userAgent),
          createdAt: session.createdAt.toISOString(),
          lastActiveAt: session.updatedAt.toISOString(),
          expiresAt: session.expiresAt.toISOString(),
        })),
    };
  }

  /** Sign out everywhere, including this device. */
  @Post("sessions/revoke-all")
  @HttpCode(200)
  async revokeAll(@Req() request: Request) {
    const actor = requireUser(await request.getActor!());
    await this.identity.revokeAllSessions(toHeaders(request));
    await recordAudit(this.db, actor, {
      action: "security.sessions_revoked",
      summary: "Signed out everywhere",
      recordType: "USER",
      recordId: actor.session.userId,
      recordLabel: actor.session.name,
    });
    return { revoked: true as const };
  }

  /** Ends one of the person's own sessions. Anyone else's session is 404 (TECH-03 §12). */
  @Delete("sessions/:sessionId")
  async revokeOne(@Req() request: Request, @Param("sessionId", new ParseUUIDPipe()) sessionId: string) {
    const actor = requireUser(await request.getActor!());
    const session = await findOrHide(() => findSessionForActor(this.db, sessionId, actor));
    enforce(canRevokeSession(actor, session));
    await this.identity.revokeSession(session.id);
    await recordAudit(this.db, actor, {
      action: "security.session_revoked",
      summary: "Signed out one device",
      recordType: "USER",
      recordId: actor.session.userId,
      recordLabel: actor.session.name,
    });
    return { revoked: true as const };
  }
}
