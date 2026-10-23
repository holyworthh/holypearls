import { z } from "zod";

/** Staff permissions (TECH-03 §8). One staff member can hold several. */
export const STAFF_PERMISSIONS = [
  "CATALOGUE_MANAGE",
  "PRICING_MANAGE",
  "CONTENT_MANAGE",
  "QUOTE_MANAGE",
  "PROOF_MANAGE",
  "PRODUCTION_MANAGE",
  "FULFILMENT_MANAGE",
  "PAYMENT_VIEW",
  "PAYMENT_MANAGE",
  "REFUND_ISSUE",
  "CUSTOMER_SUPPORT",
  "ORGANIZATION_SUPPORT",
  "ORGANIZATION_APPROVE",
  "EXPORT_PERSONAL_DATA",
  "STAFF_ADMIN",
  "SECURITY_ADMIN",
  "AUDIT_VIEW",
] as const;

export type StaffPermission = (typeof STAFF_PERMISSIONS)[number];
export const staffPermissionSchema = z.enum(STAFF_PERMISSIONS);

/** High-risk staff actions need an authenticator check this recent (TECH-03 §9). */
export const MFA_RECENCY_MINUTES = 15;

const isoDate = z.iso.datetime();

export const meSchema = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  phone: z.string().nullable(),
  /** Product news, off unless turned on (TECH-06 §12). */
  marketingConsent: z.boolean(),
  /** A new email waiting for its check link (T09-01b). */
  pendingEmail: z.string().nullable(),
  isStaff: z.boolean(),
  mfa: z.object({ enabled: z.boolean(), verifiedAt: isoDate.nullable() }),
  session: z.object({ createdAt: isoDate, expiresAt: isoDate }),
});
export type Me = z.infer<typeof meSchema>;

export const sessionSummarySchema = z.object({
  sessionId: z.string(),
  current: z.boolean(),
  device: z.string(),
  createdAt: isoDate,
  lastActiveAt: isoDate,
  expiresAt: isoDate,
});
/** This device first, then the most recently active others (up to a limit); `total` counts them all. */
export const sessionListSchema = z.object({ sessions: z.array(sessionSummarySchema), total: z.number().int().nonnegative() });
export type SessionList = z.infer<typeof sessionListSchema>;

export const revokeAllResultSchema = z.object({ revoked: z.literal(true) });

export const adminMeSchema = z.object({
  staffProfileId: z.string(),
  displayName: z.string(),
  email: z.string(),
  permissions: z.array(staffPermissionSchema),
  mfaVerifiedAt: isoDate,
  sessionExpiresAt: isoDate,
});
export type AdminMe = z.infer<typeof adminMeSchema>;

/* Sign-in requests the web app sends to /api/v1/auth (the IdentityAdapter's routes). */

export const signInEmailRequestSchema = z.object({
  email: z.email("Enter an email like name@example.com"),
  password: z.string().min(1, "Enter your password"),
});

export const magicLinkRequestSchema = z.object({
  email: z.email("Enter an email like name@example.com"),
  callbackURL: z.string().startsWith("/"),
  errorCallbackURL: z.string().startsWith("/").optional(),
});

const newPassword = z.string().min(12, "Use at least 12 characters").max(128, "Use 128 characters or fewer");

/** Customer sign-up (Pen frame 88). The verification link brings the person back to `callbackURL`. */
export const signUpRequestSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(120, "Use 120 characters or fewer"),
  email: z.email("Enter an email like name@example.com"),
  password: newPassword,
  callbackURL: z.string().startsWith("/"),
});

export const sendVerificationRequestSchema = z.object({
  email: z.email("Enter an email like name@example.com"),
  callbackURL: z.string().startsWith("/"),
});

/** Asks for a reset link (Pen frame 89). The answer is the same whether or not an account uses the email. */
export const passwordResetRequestSchema = z.object({
  email: z.email("Enter an email like name@example.com"),
  redirectTo: z.string().startsWith("/"),
});

export const newPasswordRequestSchema = z.object({ token: z.string().min(1), newPassword });

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password"),
  newPassword,
});

export const totpCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
});

export const signInResultSchema = z.object({ twoFactorRedirect: z.boolean().optional() }).passthrough();
export const enableTotpResultSchema = z.object({ totpURI: z.string(), backupCodes: z.array(z.string()) });
export const okResultSchema = z.object({}).passthrough();
