import type { GuestLinkPurpose } from "@holypearls/contracts";
import { and, type Database, desc, eq, gt, isNull, schema, sql, type Transaction } from "@holypearls/db";
import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";
import { AppError } from "../errors.js";
import { recordAudit } from "../platform/audit.js";
import { type NotificationDeps, queueEmail } from "../platform/notifications.js";
import type { ActorContext } from "./actor.js";

type Db = Database | Transaction;
const DAY_MS = 86_400_000;

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
export const sha256 = (value: string) => createHash("sha256").update(value).digest("base64url");

/** Finds or creates the one customer row for an email (TECH-03 §2). */
export async function ensureCustomer(
  db: Db,
  input: { email: string; name?: string | null; phone?: string | null; userId?: string | null },
) {
  const emailNormalized = normalizeEmail(input.email);
  const [row] = await db
    .insert(schema.customers)
    .values({
      email: input.email.trim(),
      emailNormalized,
      name: input.name ?? null,
      phone: input.phone ?? null,
      userId: input.userId ?? null,
    })
    .onConflictDoUpdate({
      target: schema.customers.emailNormalized,
      set: { name: sql`coalesce(${schema.customers.name}, excluded.name)`, updatedAt: new Date() },
    })
    .returning();
  return row!;
}

/**
 * After someone verifies their email on an account, every customer row with
 * that exact email joins the account (TECH-03 §6). Typing an email without
 * verifying it never links anything, so the caller must pass a verified email.
 */
export async function linkCustomersToVerifiedEmail(db: Db, userId: string, verifiedEmail: string, now = new Date()): Promise<number> {
  const linked = await db
    .update(schema.customers)
    .set({ userId, emailVerifiedAt: now })
    .where(and(eq(schema.customers.emailNormalized, normalizeEmail(verifiedEmail)), isNull(schema.customers.userId)))
    .returning({ id: schema.customers.id });
  return linked.length;
}

/** Default link lifetimes (TECH-03 §5, configurable later). */
export const GUEST_LINK_DAYS: Record<GuestLinkPurpose, number> = {
  QUOTE: 180,
  ORDER: 180,
  PROOF: 180,
  CONFIGURATION: 90,
  PROJECT: 90,
  COLLECTION_SUBMISSION: 90,
  HELP_REQUEST: 90,
};

/** Where each link lands once the secret is gone from the address bar. */
export const GUEST_LINK_PATH: Record<GuestLinkPurpose, (id: string) => string> = {
  QUOTE: (id) => `/quotes/${id}`,
  ORDER: (id) => `/orders/${id}`,
  PROOF: (id) => `/proofs/${id}`,
  CONFIGURATION: (id) => `/configure/drafts/${id}`,
  PROJECT: (id) => `/projects/${id}`,
  COLLECTION_SUBMISSION: (id) => `/collections/submissions/${id}`,
  HELP_REQUEST: (id) => `/help/${id}`,
};

/**
 * Makes a guest link. The secret is returned once and only its hash is kept.
 * The URL puts the secret after `#`, which browsers never send to servers,
 * so it can't reach logs or analytics (TECH-03 §5).
 */
export async function createGuestLink(
  db: Db,
  webOrigin: string,
  input: { purpose: GuestLinkPurpose; targetType: string; targetId: string; customerId: string; now?: Date },
) {
  const secret = randomBytes(32).toString("base64url");
  const now = input.now ?? new Date();
  const [row] = await db
    .insert(schema.guestLinks)
    .values({
      secretHash: sha256(secret),
      purpose: input.purpose,
      targetType: input.targetType,
      targetId: input.targetId,
      customerId: input.customerId,
      expiresAt: new Date(now.getTime() + GUEST_LINK_DAYS[input.purpose] * DAY_MS),
    })
    .returning({ id: schema.guestLinks.id });
  return { id: row!.id, secret, url: `${webOrigin}/l#${secret}` };
}

export const GUEST_SESSION_COOKIE = "hp.guest";
const GUEST_SESSION_MAX_DAYS = 30;

/** Opens a guest session scoped to one record (and, later, its children). */
export async function startGuestSession(
  db: Db,
  link: { id: string; customerId: string; targetType: string; targetId: string; expiresAt: Date },
  now: Date,
) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Math.min(link.expiresAt.getTime(), now.getTime() + GUEST_SESSION_MAX_DAYS * DAY_MS));
  const [row] = await db
    .insert(schema.guestSessions)
    .values({
      tokenHash: sha256(token),
      guestLinkId: link.id,
      customerId: link.customerId,
      targetType: link.targetType,
      targetId: link.targetId,
      expiresAt,
    })
    .returning({ id: schema.guestSessions.id });
  return { id: row!.id, token, expiresAt };
}

/** Exchanges a link secret for a guest session (POST /v1/guest-links/redeem). */
export async function redeemGuestLink(db: Database, secret: string, now: Date) {
  const [link] = await db.select().from(schema.guestLinks).where(eq(schema.guestLinks.secretHash, sha256(secret)));
  if (!link) throw new AppError("NOT_FOUND");
  if (link.revokedAt) throw new AppError("RULE_FAILED", { message: "This link was turned off.", context: { reason: "LINK_REVOKED" } });
  if (link.expiresAt <= now) throw new AppError("RULE_FAILED", { message: "This link has expired.", context: { reason: "LINK_EXPIRED" } });
  const session = await db.transaction(async (tx) => {
    await tx.update(schema.guestLinks).set({ lastUsedAt: now }).where(eq(schema.guestLinks.id, link.id));
    return startGuestSession(tx, link, now);
  });
  return {
    session,
    purpose: link.purpose,
    targetId: link.targetId,
    redirectTo: GUEST_LINK_PATH[link.purpose](link.targetId),
  };
}

/** The guest behind a session cookie, or null when it's unknown, expired or its link was revoked. */
export async function findGuestSession(db: Database, token: string, now: Date) {
  const [row] = await db
    .select({
      id: schema.guestSessions.id,
      customerId: schema.guestSessions.customerId,
      targetType: schema.guestSessions.targetType,
      targetId: schema.guestSessions.targetId,
      emailVerifiedAt: schema.guestSessions.emailVerifiedAt,
      expiresAt: schema.guestSessions.expiresAt,
      linkRevokedAt: schema.guestLinks.revokedAt,
    })
    .from(schema.guestSessions)
    .innerJoin(schema.guestLinks, eq(schema.guestLinks.id, schema.guestSessions.guestLinkId))
    .where(and(eq(schema.guestSessions.tokenHash, sha256(token)), gt(schema.guestSessions.expiresAt, now)));
  if (!row || row.linkRevokedAt) return null;
  return row;
}

/** Staff turn a link off; every guest session made from it stops working at once. */
export async function revokeGuestLink(db: Database, actor: ActorContext, linkId: string, now: Date) {
  const [link] = await db.select().from(schema.guestLinks).where(eq(schema.guestLinks.id, linkId));
  if (!link) throw new AppError("NOT_FOUND");
  if (link.revokedAt) return;
  await db.transaction(async (tx) => {
    await tx
      .update(schema.guestLinks)
      .set({ revokedAt: now, revokedByStaffId: actor.type === "user" ? (actor.staff?.staffProfileId ?? null) : null })
      .where(eq(schema.guestLinks.id, linkId));
    await recordAudit(tx, actor, {
      action: "guest_link.revoked",
      summary: `Guest link turned off (${link.purpose.toLowerCase().replaceAll("_", " ")})`,
      recordType: link.targetType,
      recordId: link.targetId,
      permission: "CUSTOMER_SUPPORT",
    });
  });
}

/* Email codes: 6 digits, 10 minutes, 5 tries; one check lasts 24 hours (TECH-03 §5). */

const CODE_MINUTES = 10;
const CODE_TRIES = 5;
export const EMAIL_CODE_VALID_HOURS = 24;

const codeHash = (code: string, codeId: string, key: string) => createHmac("sha256", key).update(`${codeId}:${code}`).digest("base64url");

const PURPOSE_WORDS: Record<string, string> = {
  VERIFY_ACTION: "confirm it's you",
  ACCEPT_QUOTE: "accept your quote",
  APPROVE_PROOF: "approve your proof",
  CHANGE_ADDRESS: "change your delivery address",
  PARTICIPANT_PAYMENT: "start your payment",
  FIND_ORDER: "find your order",
};

type CodePurpose = keyof typeof PURPOSE_WORDS;

/** The customer an actor acts as: a guest's customer, or the signed-in person's own row. */
export async function customerForActor(db: Database, actor: ActorContext) {
  if (actor.type === "guest") {
    const [row] = await db.select().from(schema.customers).where(eq(schema.customers.id, actor.guest.customerId));
    return row ?? null;
  }
  if (actor.type === "user") return ensureCustomer(db, { email: actor.session.email, name: actor.session.name, userId: actor.session.userId });
  return null;
}

export async function requestEmailCode(deps: NotificationDeps, actor: ActorContext, purpose: CodePurpose, now: Date) {
  const customer = await customerForActor(deps.db, actor);
  if (!customer) throw new AppError("NOT_SIGNED_IN");
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = new Date(now.getTime() + CODE_MINUTES * 60_000);
  await deps.db.transaction(async (tx) => {
    // A new code replaces any earlier one for the same purpose.
    await tx
      .update(schema.emailCodes)
      .set({ consumedAt: now })
      .where(and(eq(schema.emailCodes.customerId, customer.id), eq(schema.emailCodes.purpose, purpose as never), isNull(schema.emailCodes.consumedAt)));
    const [row] = await tx
      .insert(schema.emailCodes)
      .values({ customerId: customer.id, purpose: purpose as never, codeHash: "pending", expiresAt })
      .returning({ id: schema.emailCodes.id });
    await tx.update(schema.emailCodes).set({ codeHash: codeHash(code, row!.id, deps.sealKey) }).where(eq(schema.emailCodes.id, row!.id));
    await queueEmail(deps, tx, {
      template: "email_code",
      to: customer.email,
      data: { code, purpose: PURPOSE_WORDS[purpose]! },
      customerId: customer.id,
      requestId: actor.requestId,
    });
  });
  return { sentTo: maskEmail(customer.email), expiresAt };
}

/** "ad***@okafor.ng": enough to recognise, not enough to harvest. */
export const maskEmail = (email: string) => {
  const [local, domain] = email.split("@");
  return `${local!.slice(0, 2)}***@${domain}`;
};

export async function verifyEmailCode(db: Database, key: string, actor: ActorContext, purpose: CodePurpose, code: string, now: Date) {
  const customer = await customerForActor(db, actor);
  if (!customer) throw new AppError("NOT_SIGNED_IN");
  const [row] = await db
    .select()
    .from(schema.emailCodes)
    .where(and(eq(schema.emailCodes.customerId, customer.id), eq(schema.emailCodes.purpose, purpose as never), isNull(schema.emailCodes.consumedAt)))
    .orderBy(desc(schema.emailCodes.createdAt))
    .limit(1);
  if (!row) throw new AppError("RULE_FAILED", { message: "Ask for a new code.", context: { reason: "NO_CODE" } });
  if (row.expiresAt <= now) throw new AppError("RULE_FAILED", { message: "This code has expired. Ask for a new one.", context: { reason: "CODE_EXPIRED" } });
  if (row.attempts >= CODE_TRIES) {
    throw new AppError("RULE_FAILED", { message: "Too many tries. Ask for a new code.", context: { reason: "CODE_LOCKED" } });
  }
  if (codeHash(code, row.id, key) !== row.codeHash) {
    const attempts = row.attempts + 1;
    await db.update(schema.emailCodes).set({ attempts }).where(eq(schema.emailCodes.id, row.id));
    const left = CODE_TRIES - attempts;
    if (left <= 0) throw new AppError("RULE_FAILED", { message: "Too many tries. Ask for a new code.", context: { reason: "CODE_LOCKED" } });
    throw new AppError("VALIDATION_FAILED", {
      fieldErrors: { code: `That code isn't right. ${left} ${left === 1 ? "try" : "tries"} left.` },
      context: { triesLeft: left },
    });
  }
  await db.transaction(async (tx) => {
    await tx.update(schema.emailCodes).set({ consumedAt: now }).where(eq(schema.emailCodes.id, row.id));
    if (actor.type === "guest") {
      await tx.update(schema.guestSessions).set({ emailVerifiedAt: now }).where(eq(schema.guestSessions.id, actor.guest.guestSessionId));
    }
    await tx.update(schema.customers).set({ emailVerifiedAt: now }).where(eq(schema.customers.id, customer.id));
  });
  return { verifiedAt: now };
}

/**
 * Important actions (accepting a quote, approving a proof…) need an email
 * code within 24 hours (TECH-03 §5, §9). Returns quietly or throws
 * RECENT_EMAIL_CODE_REQUIRED for the web app's code dialog.
 */
export async function requireRecentEmailCode(db: Database, actor: ActorContext): Promise<void> {
  let verifiedAt: Date | null = null;
  if (actor.type === "guest") verifiedAt = actor.guest.emailVerifiedAt;
  else if (actor.type === "user") {
    const [row] = await db
      .select({ at: schema.customers.emailVerifiedAt })
      .from(schema.customers)
      .where(eq(schema.customers.userId, actor.session.userId))
      .orderBy(desc(schema.customers.emailVerifiedAt))
      .limit(1);
    verifiedAt = row?.at ?? null;
  } else throw new AppError("NOT_SIGNED_IN");
  if (!verifiedAt || actor.now.getTime() - verifiedAt.getTime() > EMAIL_CODE_VALID_HOURS * 3_600_000) {
    throw new AppError("RECENT_EMAIL_CODE_REQUIRED", { context: { validHours: EMAIL_CODE_VALID_HOURS } });
  }
}
