import pino, { type DestinationStream, type Logger } from "pino";

/**
 * Keys whose values never reach the logs (TECH-07 §9, TECH-03). Matching
 * ignores case and separators, so `accessToken`, `access_token` and
 * `x-api-key` are all covered. Log IDs instead of email addresses.
 */
const SENSITIVE_KEYS = [
  "authorization",
  "cookie",
  "setcookie",
  "password",
  "secret",
  "token",
  "apikey",
  "otp",
  "emailcode",
  "email",
  "phone",
  "cardnumber",
  "cvv",
];

export const REDACTED = "[REDACTED]";

const normalise = (key: string) => key.toLowerCase().replace(/[-_]/g, "");

export function isSensitiveKey(key: string): boolean {
  const name = normalise(key);
  return SENSITIVE_KEYS.some((sensitive) => name.includes(sensitive));
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 8 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  if (value instanceof Error) return { type: value.name, message: value.message, stack: value.stack };
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    out[key] = isSensitiveKey(key) ? REDACTED : redact(inner, depth + 1);
  }
  return out;
}

export interface LoggerOptions {
  /** "api" or "worker". */
  service?: string;
  level?: string;
  environment?: string;
  destination?: DestinationStream;
}

/** JSON logs with the service and environment on every line. */
export function createLogger(options: LoggerOptions = {}): Logger {
  return pino(
    {
      level: options.level ?? "info",
      base: { service: options.service ?? "api", environment: options.environment ?? process.env.NODE_ENV ?? "development" },
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        level: (label) => ({ level: label }),
        log: (object) => redact(object) as Record<string, unknown>,
      },
    },
    options.destination,
  );
}
