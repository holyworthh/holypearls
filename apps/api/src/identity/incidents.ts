import type { RevokeGuestLinksInput, RevokeSessionsInput } from "@holypearls/contracts";
import { and, type Database, eq, inArray, isNull, schema, sql } from "@holypearls/db";
import { AppError } from "../errors.js";
import { recordAudit } from "../platform/audit.js";
import { type ActorContext, requireRecentMfa } from "./actor.js";
import { normalizeEmail } from "./invitations.js";

/*
 * Incident switches that end access (TECH-06 §14): sessions and guest links.
 * SECURITY_ADMIN with a recent authenticator check; one transaction and one
 * audit entry (counts only, no personal details) per switch.
 */

const customersWith = (db: Database, email: string) => db.select({ id: schema.customers.id }).from(schema.customers).where(eq(schema.customers.emailNormalized, normalizeEmail(email)));

/** Signs people out at once: sessions live in database rows, so deleting them ends them. */
export async function revokeSessions(db: Database, actor: ActorContext, input: RevokeSessionsInput): Promise<{ revoked: number }> {
  requireRecentMfa(actor);
  return db.transaction(async (tx) => {
    let revoked: number;
    if (input.scope === "EVERYONE") {
      revoked = (await tx.delete(schema.sessions).returning({ id: schema.sessions.id })).length + (await tx.delete(schema.guestSessions).returning({ id: schema.guestSessions.id })).length;
    } else {
      const [user] = await tx.select({ id: schema.users.id }).from(schema.users).where(sql`lower(${schema.users.email}) = ${normalizeEmail(input.email)}`);
      const customerIds = (await customersWith(tx, input.email)).map((row) => row.id);
      if (!user && !customerIds.length) throw new AppError("NOT_FOUND", { message: "No one has that email" });
      revoked = user ? (await tx.delete(schema.sessions).where(eq(schema.sessions.userId, user.id)).returning({ id: schema.sessions.id })).length : 0;
      if (customerIds.length) revoked += (await tx.delete(schema.guestSessions).where(inArray(schema.guestSessions.customerId, customerIds)).returning({ id: schema.guestSessions.id })).length;
    }
    await recordAudit(tx, actor, {
      action: input.scope === "EVERYONE" ? "security.sessions_revoked_all" : "security.sessions_revoked",
      summary: input.scope === "EVERYONE" ? `All sessions revoked (${revoked})` : `One person's sessions revoked (${revoked})`,
      recordType: "INCIDENT_SWITCH",
      after: { scope: input.scope, revoked },
      permission: "SECURITY_ADMIN",
    });
    return { revoked };
  });
}

/** Turns guest links off for one customer or one record; their guest sessions stop at once. */
export async function revokeGuestLinks(db: Database, actor: ActorContext, input: RevokeGuestLinksInput): Promise<{ revoked: number }> {
  requireRecentMfa(actor);
  return db.transaction(async (tx) => {
    // UUIDs are unique across tables, so a record ID needs no record type.
    const scope = "customerEmail" in input ? inArray(schema.guestLinks.customerId, customersWith(tx, input.customerEmail)) : eq(schema.guestLinks.targetId, input.recordId);
    const rows = await tx
      .update(schema.guestLinks)
      .set({ revokedAt: actor.now, revokedByStaffId: actor.type === "user" ? (actor.staff?.staffProfileId ?? null) : null })
      .where(and(isNull(schema.guestLinks.revokedAt), scope))
      .returning({ id: schema.guestLinks.id });
    await recordAudit(tx, actor, {
      action: "guest_link.revoked_bulk",
      summary: `Guest links turned off (${rows.length})`,
      recordType: "INCIDENT_SWITCH",
      recordId: "recordId" in input ? input.recordId : null,
      after: { by: "recordId" in input ? "RECORD" : "CUSTOMER", revoked: rows.length },
      permission: "SECURITY_ADMIN",
    });
    return { revoked: rows.length };
  });
}
