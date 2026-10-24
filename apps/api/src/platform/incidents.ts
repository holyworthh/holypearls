import { type Database, eq, schema } from "@holypearls/db";
import type { NextFunction, Request, Response } from "express";
import { ERROR_CODES } from "@holypearls/contracts";
import type { ActorContext } from "../identity/actor.js";
import { requireRecentMfa } from "../identity/actor.js";
import { recordAudit } from "./audit.js";

/*
 * Incident switches (TECH-06 §14): read-only mode and the upload pause.
 * Payments pause stays in payment settings (same switch). Changing a switch is
 * high-risk: SECURITY_ADMIN, a recent authenticator check, and an audit entry.
 */

export const READ_ONLY_MESSAGE = "We're doing maintenance. You can browse, but changes are paused.";

export async function incidentSwitches(db: Database): Promise<{ readOnlySince: Date | null; uploadsPausedSince: Date | null }> {
  const [row] = await db.select().from(schema.incidentSwitches).where(eq(schema.incidentSwitches.id, 1));
  return { readOnlySince: row?.readOnlySince ?? null, uploadsPausedSince: row?.uploadsPausedSince ?? null };
}

const WORDS = {
  READ_ONLY: { column: "readOnlySince", on: "Read-only mode turned on", off: "Read-only mode turned off" },
  UPLOADS_PAUSED: { column: "uploadsPausedSince", on: "Uploads paused", off: "Uploads resumed" },
} as const;

export async function setIncidentSwitch(db: Database, actor: ActorContext, name: keyof typeof WORDS, on: boolean): Promise<void> {
  requireRecentMfa(actor);
  const { column, ...summary } = WORDS[name];
  const userId = actor.type === "user" ? actor.session.userId : null;
  await db.transaction(async (tx) => {
    await tx.insert(schema.incidentSwitches).values({ id: 1 }).onConflictDoNothing();
    const [before] = await tx.select().from(schema.incidentSwitches).where(eq(schema.incidentSwitches.id, 1)).for("update");
    const since = before![column];
    // Unchanged: keep the original "since" and don't write a second entry.
    if (Boolean(since) === on) return;
    await tx.update(schema.incidentSwitches).set({ [column]: on ? actor.now : null, updatedByUserId: userId }).where(eq(schema.incidentSwitches.id, 1));
    await recordAudit(tx, actor, {
      action: "security.incident_switch_changed",
      summary: on ? summary.on : summary.off,
      recordType: "INCIDENT_SWITCH",
      recordId: null,
      recordLabel: name,
      before: { on: Boolean(since) },
      after: { on },
      permission: "SECURITY_ADMIN",
    });
  });
}

/** Staff keep working (and can turn the switch off); payment events are still recorded; people can still open order links and sign in or out. */
const STILL_ALLOWED = /^\/v1\/(admin\/|webhooks\/|guest-links\/redeem$|auth\/(sign-in\/|sign-out$|two-factor\/))/;

/** Read-only mode: browsing works, changes are refused with a message. */
export function readOnlyGuard(db: Database) {
  return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      if (["GET", "HEAD", "OPTIONS"].includes(request.method) || request.surface === "admin" || STILL_ALLOWED.test(request.path)) return next();
      // ponytail: one PK read per write request; cache for a few seconds if write volume grows.
      if (!(await incidentSwitches(db)).readOnlySince) return next();
      response.status(ERROR_CODES.RULE_FAILED.status).json({ code: "RULE_FAILED", message: READ_ONLY_MESSAGE, requestId: request.requestId ?? "unknown", context: { reason: "READ_ONLY" } });
    } catch (error) {
      next(error);
    }
  };
}
