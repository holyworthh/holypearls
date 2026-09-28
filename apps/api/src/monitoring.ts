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

export const flushMonitoring = (timeoutMs = 2000) => (enabled ? Sentry.flush(timeoutMs) : Promise.resolve(true));
