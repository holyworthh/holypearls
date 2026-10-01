import { and, type Database, eq, inArray, isNull, lt, or, schema, sql } from "@holypearls/db";
import { cancelCheckoutPayments } from "../payments/payments.js";

/*
 * How long customer details in checkouts and drafts are kept (review P2-03,
 * TECH-06 §12). Starting values chosen by the owner on 2026-10-01, to be
 * confirmed with their accountant and lawyer; completed orders and their tax
 * records follow the legal retention period, not these.
 */
export const RETENTION = {
  /** An open checkout closes after this long; the customer starts a fresh one from the cart. */
  openCheckoutHours: 72,
  /** A closed (abandoned) checkout's contact, address and billing details are erased after this long. */
  abandonedCheckoutDays: 90,
  /** A draft nobody has touched for this long is closed and its names and files let go. */
  untouchedDraftDays: 90,
} as const;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** When a checkout made now stops accepting answers. */
export const checkoutExpiry = (now: Date) => new Date(now.getTime() + RETENTION.openCheckoutHours * HOUR);

/** Part of cleanup.daily. Returns how many of each it changed, for the job's log line. */
export async function applyRetention(db: Database, now: Date) {
  const expired = await db
    .update(schema.checkouts)
    .set({ status: "ABANDONED" })
    .where(
      and(
        eq(schema.checkouts.status, "OPEN"),
        // A payment under way is finished by its checks first (T04-03).
        sql`not exists (select 1 from payment_schedules ps join installments i on i.schedule_id = ps.id join payment_intents pi on pi.installment_id = i.id where ps.checkout_id = ${schema.checkouts.id} and pi.status in ('PROCESSING', 'SUCCEEDED', 'REVIEW_REQUIRED'))`,
        or(lt(schema.checkouts.expiresAt, now), and(isNull(schema.checkouts.expiresAt), lt(schema.checkouts.createdAt, new Date(now.getTime() - RETENTION.openCheckoutHours * HOUR)))),
      ),
    )
    .returning({ id: schema.checkouts.id });
  await cancelCheckoutPayments(db, expired.map((row) => row.id));

  // The amounts and frozen items stay (they're the record of what was offered); who and where go.
  const purged = await db
    .update(schema.checkouts)
    .set({ contact: null, address: null, billing: null, personalDataPurgedAt: now })
    .where(
      and(
        eq(schema.checkouts.status, "ABANDONED"),
        isNull(schema.checkouts.personalDataPurgedAt),
        lt(schema.checkouts.updatedAt, new Date(now.getTime() - RETENTION.abandonedCheckoutDays * DAY)),
      ),
    )
    .returning({ id: schema.checkouts.id });

  const stale = await db.transaction(async (tx) => {
    const drafts = await tx
      .update(schema.configurations)
      .set({ status: "ABANDONED", savedForLaterAt: null })
      .where(and(eq(schema.configurations.status, "DRAFT"), lt(schema.configurations.updatedAt, new Date(now.getTime() - RETENTION.untouchedDraftDays * DAY))))
      .returning({ id: schema.configurations.id });
    const ids = drafts.map((draft) => draft.id);
    if (ids.length) {
      await tx.delete(schema.configurationPersonalizationRows).where(inArray(schema.configurationPersonalizationRows.configurationId, ids));
      // Their files become unattached, so the file clean-up removes them after its 7 days.
      const links = await tx.delete(schema.configurationFiles).where(inArray(schema.configurationFiles.configurationId, ids)).returning({ fileId: schema.configurationFiles.fileId });
      if (links.length) {
        await tx
          .update(schema.files)
          .set({ ownerType: null, ownerId: null, attachedAt: null })
          .where(and(inArray(schema.files.id, links.map((link) => link.fileId)), sql`not exists (select 1 from configuration_files cf where cf.file_id = ${schema.files.id})`));
      }
    }
    return ids.length;
  });

  return { expiredCheckouts: expired.length, purgedCheckouts: purged.length, closedDrafts: stale };
}
