import { BUSINESS_TIME_ZONE } from "@holypearls/contracts";
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

export const ALERT_LIMITS = {
  errorRate: 0.02,
  errorWindowMs: 5 * 60_000,
  p95Ms: 1500,
  latencyWindowMs: 10 * 60_000,
  minRequests: 20,
  backlogMinutes: 15,
  dbConnectionShare: 0.8,
  webhookSilentHours: 6,
  emailFailuresPerHour: 5,
  fileFailuresPerHour: 10,
  businessHours: { days: [1, 2, 3, 4, 5, 6], from: 8, to: 18 },
} as const;

export function raiseAlert(logger: Logger, alert: Alert): void {
  logger.error({ alert: alert.signal, key: alert.key, ...alert.details }, "alert");
  reportAlert(alert.signal, alert.key, alert.details);
}

// ponytail: per-instance window; move to Sentry performance metrics if there is more than one instance.
let samples: { at: number; status: number; ms: number }[] = [];

export function recordRequest(status: number, durationMs: number, at = Date.now()): void {
  samples.push({ at, status, ms: durationMs });
  samples = samples.filter((sample) => at - sample.at <= ALERT_LIMITS.latencyWindowMs);
}

export function requestAlerts(now = Date.now()): Alert[] {
  const alerts: Alert[] = [];
  const recent = samples.filter((sample) => now - sample.at <= ALERT_LIMITS.errorWindowMs);
  const errors = recent.filter((sample) => sample.status >= 500).length;
  if (recent.length >= ALERT_LIMITS.minRequests && errors / recent.length > ALERT_LIMITS.errorRate) {
    alerts.push({ signal: "API_ERROR_RATE", key: "api", details: { requests: recent.length, errors, windowMinutes: 5 } });
  }
  const window = samples.filter((sample) => now - sample.at <= ALERT_LIMITS.latencyWindowMs);
  if (window.length >= ALERT_LIMITS.minRequests) {
    const sorted = window.map((sample) => sample.ms).sort((a, b) => a - b);
    const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1]!;
    if (p95 > ALERT_LIMITS.p95Ms) alerts.push({ signal: "API_LATENCY", key: "api", details: { p95Ms: p95, requests: window.length, windowMinutes: 10 } });
  }
  return alerts;
}

/** Monday to Saturday, 08:00 to 18:00 in Lagos (the business-hours default). */
function inBusinessHours(now: Date): boolean {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: BUSINESS_TIME_ZONE, weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(now).map(({ type, value }) => [type, value]));
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(String(parts.weekday));
  const hour = Number(parts.hour);
  const { days, from, to } = ALERT_LIMITS.businessHours;
  return (days as readonly number[]).includes(day) && hour >= from && hour < to;
}

/** The signals that need the database (A4 to A9). */
export async function checkAlerts(db: Database, now: Date): Promise<Alert[]> {
  const alerts: Alert[] = [];
  for (const queue of await stuckQueues(db, ALERT_LIMITS.backlogMinutes)) {
    alerts.push({ signal: "JOB_BACKLOG", key: queue, details: { queue, waitedMinutesOver: ALERT_LIMITS.backlogMinutes } });
  }
  const connections = await db.execute<{ used: number; max: number }>(sql`select count(*)::int as used, current_setting('max_connections')::int as max from pg_stat_activity`);
  const { used, max } = connections.rows[0]!;
  if (used > max * ALERT_LIMITS.dbConnectionShare) alerts.push({ signal: "DB_CONNECTIONS", key: "db", details: { used, max } });

  const watch = await paymentWatch(db, now);
  for (const id of watch.newReviewIds) alerts.push({ signal: "PAYMENT_REVIEW", key: id, details: { reviewId: id } });
  const silentMs = ALERT_LIMITS.webhookSilentHours * 3_600_000;
  if (watch.attemptsLast6h > 0 && (!watch.lastWebhookAt || now.getTime() - watch.lastWebhookAt.getTime() > silentMs) && inBusinessHours(now)) {
    alerts.push({ signal: "PAYSTACK_WEBHOOKS_SILENT", key: "paystack", details: { attemptsLast6h: watch.attemptsLast6h, lastWebhookAt: watch.lastWebhookAt?.toISOString() ?? null } });
  }

  const hourAgo = new Date(now.getTime() - 3_600_000);
  const emails = await failedEmailsSince(db, hourAgo);
  if (emails > ALERT_LIMITS.emailFailuresPerHour) alerts.push({ signal: "EMAIL_FAILURES", key: "email", details: { failedLastHour: emails } });
  const files = await failedFilesSince(db, hourAgo);
  if (files > ALERT_LIMITS.fileFailuresPerHour) alerts.push({ signal: "FILE_FAILURES", key: "files", details: { rejectedOrNeedsReviewLastHour: files } });
  return alerts;
}
