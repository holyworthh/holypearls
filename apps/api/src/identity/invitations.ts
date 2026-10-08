import { INVITATION_VALID_DAYS, type OrganizationRole } from "@holypearls/contracts";
import { and, type Database, eq, inArray, lt, schema, type Transaction } from "@holypearls/db";
import { createHash, randomBytes } from "node:crypto";
import { AppError } from "../errors.js";

/*
 * Invitations (TECH-03 §11). The identity module owns the secret: 32 random
 * bytes, only its SHA-256 stored, 7 days, one use. What an accepted invitation
 * grants is applied by the organizations module.
 */

const DAY_MS = 86_400_000;
const hashOf = (token: string) => createHash("sha256").update(token).digest("base64url");
export const normalizeEmail = (email: string) => email.trim().toLowerCase();

type Invitation = typeof schema.invitations.$inferSelect;

/** PENDING past its expiry reads as EXPIRED, whether or not the daily job has run yet. */
export const effectiveStatus = (invitation: Pick<Invitation, "status" | "expiresAt">, now: Date) =>
  invitation.status === "PENDING" && invitation.expiresAt <= now ? ("EXPIRED" as const) : invitation.status;

export interface NewInvitation {
  organizationId: string;
  email: string;
  role: Exclude<OrganizationRole, "OWNER">;
  allLocations: boolean;
  locationIds: readonly string[];
  invitedByUserId: string;
}

/** Creates a PENDING invitation and returns the one-time secret, which only the email carries. */
export async function issueInvitation(tx: Transaction, input: NewInvitation, now: Date) {
  const token = randomBytes(32).toString("base64url");
  const emailNormalized = normalizeEmail(input.email);
  const [pending] = await tx
    .select({ id: schema.invitations.id, expiresAt: schema.invitations.expiresAt })
    .from(schema.invitations)
    .where(and(eq(schema.invitations.organizationId, input.organizationId), eq(schema.invitations.emailNormalized, emailNormalized), eq(schema.invitations.status, "PENDING")));
  if (pending && pending.expiresAt > now) {
    throw new AppError("RULE_FAILED", { message: "This person already has an invitation waiting. Revoke it to send a new one.", context: { reason: "ALREADY_INVITED" } });
  }
  // A PENDING invitation past its expiry is closed first, so the new one can take its place.
  if (pending) await tx.update(schema.invitations).set({ status: "EXPIRED" }).where(eq(schema.invitations.id, pending.id));
  const [row] = await tx
    .insert(schema.invitations)
    .values({
      secretHash: hashOf(token),
      emailNormalized,
      expiresAt: new Date(now.getTime() + INVITATION_VALID_DAYS * DAY_MS),
      organizationId: input.organizationId,
      role: input.role,
      allLocations: input.allLocations,
      invitedByUserId: input.invitedByUserId,
    })
    .returning();
  if (!input.allLocations && input.locationIds.length > 0) {
    await tx.insert(schema.invitationLocations).values(input.locationIds.map((locationId) => ({ invitationId: row!.id, organizationId: input.organizationId, locationId })));
  }
  return { invitation: row!, token };
}

/** The invitation a secret opens, or null. Never logs or returns the secret. */
export async function findInvitationByToken(db: Database | Transaction, token: string, options: { lock?: boolean } = {}) {
  const query = db.select().from(schema.invitations).where(eq(schema.invitations.secretHash, hashOf(token)));
  const [row] = options.lock ? await query.for("update") : await query;
  return row ?? null;
}

export async function invitationLocationIds(db: Database | Transaction, invitationIds: readonly string[]) {
  if (invitationIds.length === 0) return new Map<string, string[]>();
  const rows = await db
    .select({ invitationId: schema.invitationLocations.invitationId, locationId: schema.invitationLocations.locationId })
    .from(schema.invitationLocations)
    .where(inArray(schema.invitationLocations.invitationId, [...invitationIds]));
  const byInvitation = new Map<string, string[]>();
  for (const row of rows) byInvitation.set(row.invitationId, [...(byInvitation.get(row.invitationId) ?? []), row.locationId]);
  return byInvitation;
}

/**
 * Takes the invitation for the signed-in person (TECH-03 §11): it must be
 * PENDING and unexpired, and the person's verified email must be the invited
 * one. Marks it ACCEPTED in the caller's transaction, so it works once.
 */
export async function claimInvitation(tx: Transaction, token: string, user: { userId: string; email: string; emailVerified: boolean }, now: Date) {
  const invitation = await findInvitationByToken(tx, token, { lock: true });
  if (!invitation) throw new AppError("NOT_FOUND");
  const status = effectiveStatus(invitation, now);
  if (status !== "PENDING") {
    throw new AppError("RULE_FAILED", { message: INVITATION_CLOSED[status], context: { reason: `INVITATION_${status}` } });
  }
  if (!user.emailVerified) throw new AppError("RULE_FAILED", { message: "Verify your email first, then accept the invitation.", context: { reason: "VERIFY_EMAIL_FIRST" } });
  if (normalizeEmail(user.email) !== invitation.emailNormalized) {
    throw new AppError("RULE_FAILED", { message: "This invitation is for a different email address. Sign in with the invited email.", context: { reason: "WRONG_ACCOUNT" } });
  }
  await tx.update(schema.invitations).set({ status: "ACCEPTED", acceptedAt: now, acceptedByUserId: user.userId }).where(eq(schema.invitations.id, invitation.id));
  const locationIds = (await invitationLocationIds(tx, [invitation.id])).get(invitation.id) ?? [];
  return { invitation, locationIds };
}

const INVITATION_CLOSED = {
  ACCEPTED: "This invitation has already been used.",
  EXPIRED: "This invitation has expired. Ask for a new one.",
  REVOKED: "This invitation was cancelled. Ask for a new one.",
} as const;

export async function revokeInvitation(tx: Transaction, invitationId: string, now: Date) {
  await tx.update(schema.invitations).set({ status: "REVOKED", revokedAt: now }).where(and(eq(schema.invitations.id, invitationId), eq(schema.invitations.status, "PENDING")));
}

/** Daily: PENDING invitations past their expiry become EXPIRED (TECH-01 §4). */
export async function expireInvitations(db: Database, now: Date) {
  const rows = await db
    .update(schema.invitations)
    .set({ status: "EXPIRED" })
    .where(and(eq(schema.invitations.status, "PENDING"), lt(schema.invitations.expiresAt, now)))
    .returning({ id: schema.invitations.id });
  return rows.length;
}
