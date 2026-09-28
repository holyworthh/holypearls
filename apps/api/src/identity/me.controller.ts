import { Controller, Get, HttpCode, Inject, Post, Req } from "@nestjs/common";
import type { IdentityAdapter } from "@holypearls/auth";
import type { Me, SessionList } from "@holypearls/contracts";
import type { Request } from "express";
import { IDENTITY } from "../tokens.js";
import { requireUser, toHeaders } from "./actor.js";

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
@Controller("me")
export class MeController {
  constructor(@Inject(IDENTITY) private readonly identity: IdentityAdapter) {}

  @Get()
  async me(@Req() request: Request): Promise<Me> {
    const actor = requireUser(await request.getActor!());
    const { session } = actor;
    return {
      userId: session.userId,
      name: session.name,
      email: session.email,
      isStaff: actor.staff !== null,
      mfa: { enabled: session.mfaEnabled, verifiedAt: session.mfaVerifiedAt?.toISOString() ?? null },
      session: { createdAt: session.createdAt.toISOString(), expiresAt: session.expiresAt.toISOString() },
    };
  }

  @Get("sessions")
  async sessions(@Req() request: Request): Promise<SessionList> {
    requireUser(await request.getActor!());
    const sessions = await this.identity.listSessions(toHeaders(request));
    return {
      sessions: sessions
        .sort((a, b) => Number(b.current) - Number(a.current) || b.updatedAt.getTime() - a.updatedAt.getTime())
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
    requireUser(await request.getActor!());
    await this.identity.revokeAllSessions(toHeaders(request));
    return { revoked: true as const };
  }
}
