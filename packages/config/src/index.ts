import { z } from "zod";

const databaseUrl = z.url().refine(
  (value) => value.startsWith("postgresql://") || value.startsWith("postgres://"),
  "Expected a PostgreSQL URL",
);

/** Neon's direct (unpooled) URL for pg-boss; falls back to DATABASE_URL locally (TECH-07 §1). */
const directUrl = { DATABASE_DIRECT_URL: databaseUrl.optional() };

/** Error monitoring (TECH-07 §11); off when unset. */
const monitoring = {
  SENTRY_DSN: z.url().optional(),
  /** Which environment this is (TECH-07 §2). Guards that must never run in production check this. */
  HP_ENV: z.enum(["local", "preview", "staging", "production"]).default("local"),
};

/** Encrypts stored email data that carries a secret (TECH-03 §5). 32+ random characters. */
const encryption = { DATA_ENCRYPTION_KEY: z.string().min(32) };

/** How the worker sends email: Resend in staging and production, Mailpit (smtp) or files locally. */
const email = {
  EMAIL_TRANSPORT: z.enum(["resend", "smtp", "file"]).default("file"),
  EMAIL_FROM: z.string().default("HolyPearls <hello@holypearls.test>"),
  RESEND_API_KEY: z.string().optional(),
  SMTP_URL: z.string().optional(),
  EMAIL_FILE_DIR: z.string().default(".outbox/emails"),
};

/** Private files and public media (TECH-04 §2): R2 or MinIO over S3, or the local disk. */
const storage = {
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  LOCAL_STORAGE_DIR: z.string().default(".storage"),
  S3_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_PUBLIC_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).default("false"),
};

const webSchema = z.object({
  API_URL: z.url(),
  HP_DEMO_SLICE: z.enum(["on", "off"]).default("off"),
  ...monitoring,
});

const apiSchema = z.object({
  DATABASE_URL: databaseUrl,
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  /** Signs session cookies and encrypts authenticator secrets (TECH-03 §3). */
  BETTER_AUTH_SECRET: z.string().min(32),
  /** The web app's origin; the browser only ever talks to this domain (TECH-03 §4). */
  BETTER_AUTH_URL: z.url(),
  /** Browser tests sign in many times from one address; they turn sign-in limits off. */
  AUTH_RATE_LIMIT: z.enum(["on", "off"]).default("on"),
  ...directUrl,
  /** The T00-04 end-to-end demo routes; on locally and in staging, never in production. */
  HP_DEMO_SLICE: z.enum(["on", "off"]).default("off"),
  ...monitoring,
  ...encryption,
  /** Where new help requests are announced to staff (PRD-00 §18). */
  HELP_INBOX_EMAIL: z.email().default("help@holypearls.test"),
  ...storage,
});

const workerSchema = z.object({
  DATABASE_URL: databaseUrl,
  ...directUrl,
  ...monitoring,
  ...encryption,
  ...email,
  ...storage,
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

/** The connection pg-boss should use: direct when set, otherwise the main URL. */
export const jobsConnectionString = (env: { DATABASE_URL: string; DATABASE_DIRECT_URL?: string }) =>
  env.DATABASE_DIRECT_URL ?? env.DATABASE_URL;
