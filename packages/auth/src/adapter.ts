/**
 * The only way the rest of HolyPearls talks to the sign-in library (TECH-03 §3,
 * ADR-005). Answers "who are you?"; permissions live in the modules.
 */
export interface IdentitySession {
  sessionId: string;
  userId: string;
  email: string;
  name: string;
  emailVerified: boolean;
  /** An authenticator app is set up for this user. */
  mfaEnabled: boolean;
  /** Last successful authenticator check in this session, if any. */
  mfaVerifiedAt: Date | null;
  createdAt: Date;
  expiresAt: Date;
}

export interface SessionSummary {
  sessionId: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  userAgent: string | null;
  ipAddress: string | null;
  current: boolean;
}

export interface IdentityAdapter {
  /** Handles the sign-in library's own routes under `basePath`. */
  handle(request: Request): Promise<Response>;
  readonly basePath: string;
  getSession(headers: Headers): Promise<IdentitySession | null>;
  listSessions(headers: Headers): Promise<SessionSummary[]>;
  /** Ends every session for the signed-in user, including this one. */
  revokeAllSessions(headers: Headers): Promise<void>;
  /** Ends one session by ID, for example a staff session past 12 hours. */
  revokeSession(sessionId: string): Promise<void>;
}
