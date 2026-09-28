import type { IdentityAdapter, IdentitySession } from "@holypearls/auth";
import { MFA_RECENCY_MINUTES, type StaffPermission } from "@holypearls/contracts";
import { type Database, eq, schema } from "@holypearls/db";
import type { Request } from "express";
import { AppError } from "../errors.js";
import { findGuestSession, GUEST_SESSION_COOKIE } from "./customers.js";

export interface StaffContext {
  staffProfileId: string;
  displayName: string;
  permissions: ReadonlySet<StaffPermission>;
}

/**
 * Who is making this request (TECH-03 §12). Signing in never implies
 * permission; policies and guards decide that. Organization memberships,
 * customers and guests join this in later tickets.
 */
export interface GuestContext {
  guestSessionId: string;
  customerId: string;
  /** The one record the link opened; its children are allowed by each module's policies. */
  targetType: string;
  targetId: string;
  /** Last email code in this guest session (TECH-03 §5). */
  emailVerifiedAt: Date | null;
}

export type ActorContext =
  | { type: "anonymous"; requestId: string; now: Date }
  | { type: "guest"; requestId: string; now: Date; guest: GuestContext }
  | {
      type: "user";
      requestId: string;
      /** When the request arrived; time-based checks use this, not the wall clock. */
      now: Date;
      session: IdentitySession;
      /** Present only for ACTIVE staff profiles. */
      staff: StaffContext | null;
    };

export async function findActiveStaff(db: Database, userId: string): Promise<StaffContext | null> {
  const rows = await db
    .select({
      staffProfileId: schema.staffProfiles.id,
      displayName: schema.staffProfiles.displayName,
      status: schema.staffProfiles.status,
      permission: schema.staffPermissionGrants.permission,
    })
    .from(schema.staffProfiles)
    .leftJoin(schema.staffPermissionGrants, eq(schema.staffPermissionGrants.staffProfileId, schema.staffProfiles.id))
    .where(eq(schema.staffProfiles.userId, userId));
  const first = rows[0];
  if (!first || first.status !== "ACTIVE") return null;
  return {
    staffProfileId: first.staffProfileId,
    displayName: first.displayName,
    permissions: new Set(rows.flatMap((row) => (row.permission ? [row.permission] : []))),
  };
}

export function toHeaders(request: Request): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
    else if (value !== undefined) headers.set(name, value);
  }
  return headers;
}

/** Builds the actor once per request, on first use. */
const guestToken = (request: Request) => {
  for (const part of (request.header("cookie") ?? "").split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === GUEST_SESSION_COOKIE || name === `__Secure-${GUEST_SESSION_COOKIE}`) return decodeURIComponent(rest.join("="));
  }
  return null;
};

export function actorResolver(identity: IdentityAdapter, db: Database, clock: () => Date = () => new Date()) {
  return (request: Request): Promise<ActorContext> => {
    request.actor ??= (async () => {
      const requestId = request.requestId ?? "unknown";
      const now = clock();
      const session = await identity.getSession(toHeaders(request));
      if (!session) {
        // A signed-in session always wins; otherwise a guest link session may apply.
        const token = guestToken(request);
        const guest = token ? await findGuestSession(db, token, now) : null;
        if (!guest) return { type: "anonymous", requestId, now } as const;
        return {
          type: "guest",
          requestId,
          now,
          guest: {
            guestSessionId: guest.id,
            customerId: guest.customerId,
            targetType: guest.targetType,
            targetId: guest.targetId,
            emailVerifiedAt: guest.emailVerifiedAt,
          },
        } as const;
      }
      return { type: "user", requestId, now, session, staff: await findActiveStaff(db, session.userId) } as const;
    })();
    return request.actor;
  };
}

export function requireUser(actor: ActorContext) {
  if (actor.type !== "user") throw new AppError("NOT_SIGNED_IN");
  return actor;
}

/**
 * High-risk staff actions need an authenticator check in the last 15 minutes
 * (TECH-03 §9). The web app answers RECENT_MFA_REQUIRED with the step-up dialog.
 */
export function requireRecentMfa(actor: ActorContext, now: Date = actor.now): void {
  const user = requireUser(actor);
  const verifiedAt = user.session.mfaVerifiedAt;
  if (!verifiedAt || now.getTime() - verifiedAt.getTime() > MFA_RECENCY_MINUTES * 60_000) {
    throw new AppError("RECENT_MFA_REQUIRED", {
      context: { verifiedAt: verifiedAt?.toISOString() ?? null, maxAgeMinutes: MFA_RECENCY_MINUTES },
    });
  }
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      actor?: Promise<ActorContext>;
      getActor?: () => Promise<ActorContext>;
    }
  }
}
