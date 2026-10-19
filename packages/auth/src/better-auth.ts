import { and, type Database, eq, ne, newId, schema } from "@holypearls/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { magicLink } from "better-auth/plugins/magic-link";
import { twoFactor } from "better-auth/plugins/two-factor";
import type { IdentityAdapter, IdentitySession, SessionSummary } from "./adapter.js";
import type { AuthOutbox } from "./outbox.js";

const DAY_S = 24 * 60 * 60;
export const CUSTOMER_SESSION_SECONDS = 30 * DAY_S;
export const STAFF_SESSION_SECONDS = 12 * 60 * 60;
export const MAGIC_LINK_SECONDS = 10 * 60;
export const VERIFY_EMAIL_SECONDS = DAY_S;
export const PASSWORD_RESET_SECONDS = 60 * 60;
/** For the one-off first-admin command (ATTENTION 2). */
export { hashPassword } from "better-auth/crypto";

export const MIN_PASSWORD_LENGTH = 12;

/** The browser reaches the API through the web app's /api forwarding (TECH-03 §4). */
export const AUTH_BASE_PATH = "/api/v1/auth";

export interface BetterAuthIdentityOptions {
  db: Database;
  /** At least 32 random characters. Signs cookies and encrypts authenticator secrets. */
  secret: string;
  /** The web app's origin, for example https://holypearls.ng. */
  webOrigin: string;
  outbox: AuthOutbox;
  /** The admin app's origin (ADR-017); staff sign in there. */
  adminOrigin?: string | null;
  /** Secure cookies. On in production (TECH-03 §4). */
  secureCookies: boolean;
  /** Staff sessions last 12 hours from sign-in and are never extended. */
  isStaff(userId: string): Promise<boolean>;
  /** Runs when an account's email is verified, by its check link or a sign-in link (TECH-03 §6). */
  onEmailVerified?(user: { id: string; email: string; name: string }): Promise<void>;
  /** Runs when a new account email is verified; the account's other sessions have already ended (TECH-03 §4). */
  onEmailChanged?(user: { id: string; email: string; name: string }): Promise<void>;
  /** Runs after a password reset, which has already ended the account's other sessions. */
  onPasswordReset?(user: { id: string; email: string; name: string }): Promise<void>;
  /** Clock, for tests. */
  now?: () => Date;
  /** Receives the library's warnings and errors (message only; details can hold personal data). */
  log?: (level: "warn" | "error", message: string) => void;
}

function createBetterAuth(options: BetterAuthIdentityOptions) {
  const { db } = options;
  const now = options.now ?? (() => new Date());

  type Ctx = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

  /**
   * The profile's "Email change pending" state (Pen 91). Recorded whatever the
   * library did, so the reply never reveals whether the address has an account.
   */
  const rememberNewEmail = async (ctx: Ctx) => {
    const userId = ctx.context.session?.user.id;
    const newEmail = (ctx.body as { newEmail?: unknown } | undefined)?.newEmail;
    if (!userId || typeof newEmail !== "string" || ctx.context.returned instanceof Error) return;
    await db.update(schema.users).set({ pendingEmail: newEmail.trim().toLowerCase(), pendingEmailAt: now() }).where(eq(schema.users.id, userId));
  };

  /** The new email was verified: every other session ends (TECH-03 §4), and the pending state clears. */
  const finishEmailChange = async (ctx: Ctx) => {
    const current = ctx.context.newSession ?? ctx.context.session;
    if (!current) return;
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, current.user.id));
    if (!user?.pendingEmail || user.pendingEmail !== user.email) return;
    await db.delete(schema.sessions).where(and(eq(schema.sessions.userId, user.id), ne(schema.sessions.id, current.session.id)));
    await db.update(schema.users).set({ pendingEmail: null, pendingEmailAt: null }).where(eq(schema.users.id, user.id));
    await options.onEmailChanged?.({ id: user.id, email: user.email, name: user.name });
  };

  const markMfaVerified = async (sessionId: string) => {
    await db.update(schema.sessions).set({ mfaVerifiedAt: now() }).where(eq(schema.sessions.id, sessionId));
  };

  return betterAuth({
    appName: "HolyPearls",
    secret: options.secret,
    baseURL: options.webOrigin,
    basePath: AUTH_BASE_PATH,
    // The customer site, and the admin on its own subdomain (ADR-017).
    trustedOrigins: [options.webOrigin, ...(options.adminOrigin ? [options.adminOrigin] : [])],
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        users: schema.users,
        sessions: schema.sessions,
        accounts: schema.accounts,
        verifications: schema.verifications,
        twoFactors: schema.twoFactors,
      },
    }),
    // A new email is used only once its check link is opened; until then the account keeps the old one (T09-01b).
    user: { modelName: "users", changeEmail: { enabled: true } },
    account: { modelName: "accounts" },
    verification: { modelName: "verifications" },
    session: {
      modelName: "sessions",
      expiresIn: CUSTOMER_SESSION_SECONDS,
      updateAge: DAY_S,
      // No cookie cache: a revoked session must stop working on the next request.
      cookieCache: { enabled: false },
      additionalFields: {
        mfaVerifiedAt: { type: "date", required: false, input: false },
        emailCodeVerifiedAt: { type: "date", required: false, input: false },
      },
    },
    emailAndPassword: {
      enabled: true,
      // Customers sign up on the customer site (T09-01); the API refuses sign-up anywhere else,
      // and staff accounts are created by STAFF_ADMIN.
      minPasswordLength: MIN_PASSWORD_LENGTH,
      // An unverified account can sign in; it just links nothing until it verifies (TECH-03 §6).
      requireEmailVerification: false,
      resetPasswordTokenExpiresIn: PASSWORD_RESET_SECONDS,
      // TECH-03 §4: a new password ends every other session.
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await options.outbox.send({ kind: "PASSWORD_RESET", to: user.email.toLowerCase(), url, sentAt: now() });
      },
      onPasswordReset: async ({ user }) => {
        await options.onPasswordReset?.({ id: user.id, email: user.email, name: user.name });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: VERIFY_EMAIL_SECONDS,
      sendVerificationEmail: async ({ user, url }) => {
        // The library sends a new-email check through here too, addressed to the new email.
        const [stored] = await db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, user.id));
        const kind = stored && stored.email !== user.email.toLowerCase() ? "CHANGE_EMAIL" : "VERIFY_EMAIL";
        await options.outbox.send({ kind, to: user.email.toLowerCase(), url, sentAt: now() });
      },
    },
    // The API applies the AUTH limit in PostgreSQL, shared by every instance (TECH-02 §14,
    // ADR-013); the library's in-memory limiter would count each instance separately.
    rateLimit: { enabled: false },
    advanced: {
      cookiePrefix: "hp",
      useSecureCookies: options.secureCookies,
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", path: "/" },
      database: { generateId: () => newId() },
    },
    plugins: [
      magicLink({
        expiresIn: MAGIC_LINK_SECONDS,
        disableSignUp: true,
        sendMagicLink: async ({ email, url }) => {
          await options.outbox.send({ kind: "MAGIC_LINK", to: email.toLowerCase(), url, sentAt: now() });
        },
      }),
      twoFactor({
        issuer: "HolyPearls",
        backupCodeOptions: { storeBackupCodes: "encrypted" },
        schema: { twoFactor: { modelName: "twoFactors" } },
      }),
    ],
    databaseHooks: {
      user: {
        update: {
          // Verifying by the check link or by a sign-in link both land here.
          after: async (user) => {
            if (user.emailVerified) await options.onEmailVerified?.({ id: user.id, email: user.email, name: user.name });
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            if (!(await options.isStaff(session.userId))) return;
            return { data: { ...session, expiresAt: new Date(now().getTime() + STAFF_SESSION_SECONDS * 1000) } };
          },
        },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        // TECH-03 §4: changing a password ends every other session.
        if (ctx.path === "/change-password") {
          return { context: { body: { ...(ctx.body as object), revokeOtherSessions: true } } };
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path === "/change-email") return rememberNewEmail(ctx);
        if (ctx.path === "/verify-email") return finishEmailChange(ctx);
        if (ctx.path !== "/two-factor/verify-totp") return;
        const returned = ctx.context.returned as { status?: number } | Error | undefined;
        if (returned instanceof Error) return;
        const sessionId = ctx.context.newSession?.session.id ?? ctx.context.session?.session.id;
        if (sessionId) await markMfaVerified(sessionId);
      }),
    },
    telemetry: { enabled: false },
    logger: {
      level: "warn",
      log: (level, message) => {
        if (level === "warn" || level === "error") options.log?.(level, message);
      },
    },
  });
}

/** The IdentityAdapter backed by Better Auth. */
export function createBetterAuthIdentity(options: BetterAuthIdentityOptions): IdentityAdapter {
  const auth = createBetterAuth(options);
  const now = options.now ?? (() => new Date());

  const revokeSession = async (sessionId: string) => {
    await options.db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId));
  };

  return {
    basePath: AUTH_BASE_PATH,
    handle: (request) => auth.handler(request),

    async getSession(headers) {
      const result = await auth.api.getSession({ headers, query: { disableRefresh: false } });
      if (!result) return null;
      const { session, user } = result;
      // Staff sessions end 12 hours after sign-in and are never extended (TECH-03 §4).
      let expiresAt = new Date(session.expiresAt);
      if (await options.isStaff(user.id)) {
        const staffEnd = new Date(new Date(session.createdAt).getTime() + STAFF_SESSION_SECONDS * 1000);
        if (now() >= staffEnd) {
          await revokeSession(session.id);
          return null;
        }
        if (expiresAt > staffEnd) {
          expiresAt = staffEnd;
          await options.db.update(schema.sessions).set({ expiresAt }).where(eq(schema.sessions.id, session.id));
        }
      }
      const mfaVerifiedAt = (session as { mfaVerifiedAt?: Date | string | null }).mfaVerifiedAt;
      return {
        sessionId: session.id,
        userId: user.id,
        email: user.email,
        name: user.name,
        emailVerified: user.emailVerified,
        mfaEnabled: Boolean((user as { twoFactorEnabled?: boolean | null }).twoFactorEnabled),
        mfaVerifiedAt: mfaVerifiedAt ? new Date(mfaVerifiedAt) : null,
        createdAt: new Date(session.createdAt),
        expiresAt,
      } satisfies IdentitySession;
    },

    async listSessions(headers) {
      const current = await auth.api.getSession({ headers });
      if (!current) return [];
      const sessions = await auth.api.listSessions({ headers });
      const summary = (session: (typeof sessions)[number] | typeof current.session): SessionSummary => ({
        sessionId: session.id,
        createdAt: new Date(session.createdAt),
        updatedAt: new Date(session.updatedAt),
        expiresAt: new Date(session.expiresAt),
        userAgent: session.userAgent ?? null,
        ipAddress: session.ipAddress ?? null,
        current: session.id === current.session.id,
      });
      // Better Auth reads one page of sessions; with many devices the one in use can fall outside it.
      const listed = sessions.map(summary);
      return listed.some((session) => session.current) ? listed : [summary(current.session), ...listed];
    },

    async revokeAllSessions(headers) {
      await auth.api.revokeSessions({ headers });
    },

    revokeSession,
  };
}
