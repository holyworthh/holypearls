import { and, type Database, isNotNull, lt, or, schema } from "@holypearls/db";
import type { StorageAdapter } from "@holypearls/storage";
import { removeExpiredSearchEvents } from "../catalogue/search.js";
import { removeOldPriceResults } from "../configuration/pricing.js";
import { removeUnattachedFiles } from "../files/files.js";
import { expireInvitations } from "../identity/invitations.js";
import { applyRetention } from "../sales/retention.js";
import { RateLimiter } from "./rate-limit.js";

/**
 * cleanup.daily at 03:00 WAT (TECH-02 §8): unattached uploads after 7 days,
 * finished rate-limit windows, expired idempotency keys, guest sessions and
 * used or expired email codes, and saved price results older than 30 days
 * (T03-01), search events older than 90 days (T02-06), and expired checkouts,
 * old checkout details and untouched drafts (review P2-03, sales/retention.ts),
 * and PENDING invitations past their expiry become EXPIRED (T10-01).
 */
export async function runDailyCleanup(deps: { db: Database; storage: StorageAdapter; publicStorage: StorageAdapter }, now = new Date()) {
  const files = await removeUnattachedFiles(deps, now);
  await new RateLimiter(deps.db, () => now).removeExpired();
  await deps.db.delete(schema.idempotencyKeys).where(lt(schema.idempotencyKeys.expiresAt, now));
  await deps.db.delete(schema.guestSessions).where(lt(schema.guestSessions.expiresAt, now));
  await deps.db
    .delete(schema.emailCodes)
    .where(or(lt(schema.emailCodes.expiresAt, now), and(isNotNull(schema.emailCodes.consumedAt), lt(schema.emailCodes.createdAt, now))));
  const priceResults = await removeOldPriceResults(deps.db, now);
  const searchEvents = await removeExpiredSearchEvents(deps.db, now);
  const retention = await applyRetention(deps.db, now);
  const invitationsExpired = await expireInvitations(deps.db, now);
  return { files, priceResults, searchEvents, invitationsExpired, ...retention };
}
