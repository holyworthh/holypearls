import * as Sentry from "@sentry/node";
import { redact } from "./logger.js";

let enabled = false;

/**
 * Error monitoring (TECH-07 §11). Off unless SENTRY_DSN is set. Events carry
 * the request ID and route, never cookies, headers, bodies or personal data.
 */
export function initMonitoring(options: { dsn?: string; environment: string; service: "api" | "worker"; release?: string }) {
  if (!options.dsn) return;
  Sentry.init({
    dsn: options.dsn,
    environment: options.environment,
    release: options.release,
    serverName: options.service,
    tracesSampleRate: 0,
    beforeSend(event) {
      if (event.request) event.request = { url: event.request.url, method: event.request.method };
      delete event.user;
      if (event.extra) event.extra = redact(event.extra) as Record<string, unknown>;
      return event;
    },
  });
  enabled = true;
}

export function reportError(error: unknown, context: { requestId?: string; route?: string; queue?: string } = {}) {
  if (!enabled) return;
  Sentry.withScope((scope) => {
    for (const [key, value] of Object.entries(context)) if (value) scope.setTag(key, value);
    Sentry.captureException(error);
  });
}

const lastSent = new Map<string, number>();

/**
 * One alert (TECH-07 §12): a Sentry issue per signal and key, at most once an hour per process.
 * Returns false when throttled. // ponytail: in-memory throttle; resets on restart.
 */
export function reportAlert(signal: string, key: string, details: Record<string, unknown>, now = Date.now()): boolean {
  const id = `${signal}:${key}`;
  if (now - (lastSent.get(id) ?? -Infinity) < 3_600_000) return false;
  lastSent.set(id, now);
  if (enabled) {
    Sentry.withScope((scope) => {
      scope.setTag("alert", signal);
      scope.setFingerprint(["alert", signal, key]);
      scope.setLevel("error");
      scope.setExtras(redact(details) as Record<string, unknown>);
      Sentry.captureMessage(`${signal}: ${key}`);
    });
  }
  return true;
}

export const flushMonitoring = (timeoutMs = 2000) => (enabled ? Sentry.flush(timeoutMs) : Promise.resolve(true));
