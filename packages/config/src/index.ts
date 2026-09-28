import { z } from "zod";

const databaseUrl = z.url().refine(
  (value) => value.startsWith("postgresql://") || value.startsWith("postgres://"),
  "Expected a PostgreSQL URL",
);

const webSchema = z.object({
  API_URL: z.url(),
});

const apiSchema = z.object({
  DATABASE_URL: databaseUrl,
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  /** Signs session cookies and encrypts authenticator secrets (TECH-03 §3). */
  BETTER_AUTH_SECRET: z.string().min(32),
  /** The web app's origin; the browser only ever talks to this domain (TECH-03 §4). */
  BETTER_AUTH_URL: z.url(),
  /** Local file for sign-in emails until real email arrives (T01-02). */
  AUTH_OUTBOX_PATH: z.string().default(".outbox/auth-emails.jsonl"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /** Browser tests sign in many times from one address; they turn sign-in limits off. */
  AUTH_RATE_LIMIT: z.enum(["on", "off"]).default("on"),
});

const workerSchema = z.object({
  DATABASE_URL: databaseUrl,
});

const databaseSchema = z.object({
  DATABASE_URL: databaseUrl,
});

// Tests create and drop their own databases through this server connection.
const testDatabaseSchema = z.object({
  TEST_DATABASE_URL: databaseUrl,
});

function parseEnv<T extends z.ZodType>(schema: T, source: Record<string, string | undefined>): z.output<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const names = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid environment: ${names}`);
  }
  return result.data;
}

export const loadWebEnv = (source: Record<string, string | undefined> = process.env) =>
  parseEnv(webSchema, source);

export const loadApiEnv = (source: Record<string, string | undefined> = process.env) =>
  parseEnv(apiSchema, source);

export const loadWorkerEnv = (source: Record<string, string | undefined> = process.env) =>
  parseEnv(workerSchema, source);

export const loadDatabaseEnv = (source: Record<string, string | undefined> = process.env) =>
  parseEnv(databaseSchema, source);

/** Uses TEST_DATABASE_URL, or DATABASE_URL when no separate test server is set. */
export const loadTestDatabaseEnv = (source: Record<string, string | undefined> = process.env) =>
  parseEnv(testDatabaseSchema, { TEST_DATABASE_URL: source.TEST_DATABASE_URL ?? source.DATABASE_URL });
