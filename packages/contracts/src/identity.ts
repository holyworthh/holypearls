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
export const sessionListSchema = z.object({ sessions: z.array(sessionSummarySchema) });
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

export const totpCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
});

export const signInResultSchema = z.object({ twoFactorRedirect: z.boolean().optional() }).passthrough();
export const enableTotpResultSchema = z.object({ totpURI: z.string(), backupCodes: z.array(z.string()) });
export const okResultSchema = z.object({}).passthrough();
