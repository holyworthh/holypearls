import { and, type Database, isNotNull, lt, or, schema } from "@holypearls/db";
import type { StorageAdapter } from "@holypearls/storage";
import { removeExpiredSearchEvents } from "../catalogue/search.js";
import { removeOldPriceResults } from "../configuration/pricing.js";
import { removeUnattachedFiles } from "../files/files.js";
import { purgeParticipantContacts } from "../groups/collections.js";
import { expireInvitations } from "../identity/invitations.js";
import { applyRetention } from "../sales/retention.js";
import { RateLimiter } from "./rate-limit.js";
import { expireExports } from "./exports.js";

/**
 * cleanup.daily at 03:00 WAT (TECH-02 §8): unattached uploads after 7 days,
 * finished rate-limit windows, expired idempotency keys, guest sessions and
 * used or expired email codes, and saved price results older than 30 days
 * (T03-01), search events older than 90 days (T02-06), and expired checkouts,
 * old checkout details and untouched drafts (review P2-03, sales/retention.ts),
 * and PENDING invitations past their expiry become EXPIRED (T10-01), and
 * expired guest links and Better Auth check links and codes are deleted, and
 * participants' contact details go 12 months after delivery (T15-03; TECH-06
 * §12). Order, payment and tax records follow the 7-year rule: nothing is
 * eligible before 2033, so no job yet.
 */
export async function runDailyCleanup(deps: { db: Database; storage: StorageAdapter; publicStorage: StorageAdapter }, now = new Date()) {
  const files = await removeUnattachedFiles(deps, now);
  await new RateLimiter(deps.db, () => now).removeExpired();
  await deps.db.delete(schema.idempotencyKeys).where(lt(schema.idempotencyKeys.expiresAt, now));
  await deps.db.delete(schema.guestSessions).where(lt(schema.guestSessions.expiresAt, now));
  // Sessions go with their link (cascade); a link past its expiry can't be redeemed anyway.
  const guestLinks = (await deps.db.delete(schema.guestLinks).where(lt(schema.guestLinks.expiresAt, now)).returning({ id: schema.guestLinks.id })).length;
  const verifications = (await deps.db.delete(schema.verifications).where(lt(schema.verifications.expiresAt, now)).returning({ id: schema.verifications.id })).length;
  await deps.db
    .delete(schema.emailCodes)
    .where(or(lt(schema.emailCodes.expiresAt, now), and(isNotNull(schema.emailCodes.consumedAt), lt(schema.emailCodes.createdAt, now))));
  const priceResults = await removeOldPriceResults(deps.db, now);
  const searchEvents = await removeExpiredSearchEvents(deps.db, now);
  const retention = await applyRetention(deps.db, now);
  const invitationsExpired = await expireInvitations(deps.db, now);
  const exportsExpired = await expireExports(deps, now);
  const participantContacts = await purgeParticipantContacts(deps.db, now);
  return { files, priceResults, searchEvents, invitationsExpired, exportsExpired, guestLinks, verifications, participantContacts, ...retention };
}
