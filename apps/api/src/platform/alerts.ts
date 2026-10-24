import { type Database, sql } from "@holypearls/db";
import { stuckQueues } from "@holypearls/jobs";
import type { Logger } from "pino";
import { failedFilesSince } from "../files/files.js";
import { reportAlert } from "../monitoring.js";
import { paymentWatch } from "../payments/admin.js";
import { failedEmailsSince } from "./notifications.js";

/*
 * The TECH-07 §12 launch alerts. Request statistics (A1, A2) are computed in the
 * API process; the rest by the worker's ops.monitor job. Each alert is a log line
 * and, with SENTRY_DSN set, one Sentry issue per signal and key.
 */

export interface Alert {
  signal: "API_ERROR_RATE" | "API_LATENCY" | "JOB_DEAD_LETTER" | "JOB_BACKLOG" | "DB_CONNECTIONS" | "PAYMENT_REVIEW" | "PAYSTACK_WEBHOOKS_SILENT" | "EMAIL_FAILURES" | "FILE_FAILURES";
  key: string;
  details: Record<string, unknown>;
}

export function raiseAlert(logger: Logger, alert: Alert): void {
  logger.error({ alert: alert.signal, key: alert.key, ...alert.details }, "alert");
  reportAlert(alert.signal, alert.key, alert.details);
}

// ponytail: per-instance window; move to Sentry performance metrics if there is more than one instance.
const TEN_MINUTES = 10 * 60_000;
const MIN_REQUESTS = 20;
let samples: { at: number; status: number; ms: number }[] = [];

export function recordRequest(status: number, durationMs: number, at = Date.now()): void {
  samples.push({ at, status, ms: durationMs });
  samples = samples.filter((sample) => at - sample.at <= TEN_MINUTES);
}

export function requestAlerts(now = Date.now()): Alert[] {
  samples = samples.filter((sample) => now - sample.at <= TEN_MINUTES);
  if (samples.length < MIN_REQUESTS) return [];
  const alerts: Alert[] = [];
  const recent = samples.filter((sample) => now - sample.at <= 5 * 60_000);
  const errors = recent.filter((sample) => sample.status >= 500).length;
  if (recent.length >= MIN_REQUESTS && errors / recent.length > 0.02) {
    alerts.push({ signal: "API_ERROR_RATE", key: "api", details: { requests: recent.length, errors, windowMinutes: 5 } });
  }
  const sorted = samples.map((sample) => sample.ms).sort((a, b) => a - b);
  const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1]!;
  if (p95 > 1500) alerts.push({ signal: "API_LATENCY", key: "api", details: { p95Ms: p95, requests: samples.length, windowMinutes: 10 } });
  return alerts;
}

/** Monday to Saturday, 08:00 to 18:00 in Lagos. Lagos is UTC+1 all year (no DST). */
function inBusinessHours(now: Date): boolean {
  const lagos = new Date(now.getTime() + 3_600_000);
  const day = lagos.getUTCDay();
  return day >= 1 && day <= 6 && lagos.getUTCHours() >= 8 && lagos.getUTCHours() < 18;
}

/** The signals that need the database (A4 to A9). */
export async function checkAlerts(db: Database, now: Date): Promise<Alert[]> {
  const alerts: Alert[] = [];
  for (const queue of await stuckQueues(db, 15)) {
    alerts.push({ signal: "JOB_BACKLOG", key: queue, details: { queue, waitedMinutesOver: 15 } });
  }
  const connections = await db.execute<{ used: number; max: number }>(sql`select count(*)::int as used, current_setting('max_connections')::int as max from pg_stat_activity`);
  const { used, max } = connections.rows[0]!;
  if (used > max * 0.8) alerts.push({ signal: "DB_CONNECTIONS", key: "db", details: { used, max } });

  const watch = await paymentWatch(db, now);
  for (const id of watch.newReviewIds) alerts.push({ signal: "PAYMENT_REVIEW", key: id, details: { reviewId: id } });
  const silentMs = 6 * 3_600_000;
  if (watch.attemptsLast6h > 0 && (!watch.lastWebhookAt || now.getTime() - watch.lastWebhookAt.getTime() > silentMs) && inBusinessHours(now)) {
    alerts.push({ signal: "PAYSTACK_WEBHOOKS_SILENT", key: "paystack", details: { attemptsLast6h: watch.attemptsLast6h, lastWebhookAt: watch.lastWebhookAt?.toISOString() ?? null } });
  }

  const hourAgo = new Date(now.getTime() - 3_600_000);
  const emails = await failedEmailsSince(db, hourAgo);
  if (emails > 5) alerts.push({ signal: "EMAIL_FAILURES", key: "email", details: { failedLastHour: emails } });
  const files = await failedFilesSince(db, hourAgo);
  if (files > 10) alerts.push({ signal: "FILE_FAILURES", key: "files", details: { rejectedOrNeedsReviewLastHour: files } });
  return alerts;
}
