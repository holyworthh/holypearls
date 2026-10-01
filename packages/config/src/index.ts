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

/**
 * Page refresh after publishing (TECH-07 §4). "off" is an explicit choice
 * (staging's Vercel login refuses the worker), never a missing value.
 */
const revalidation = {
  WEB_REVALIDATE: z.enum(["on", "off"]).default("off"),
  WEB_REVALIDATE_URL: z.url().optional(),
  WEB_REVALIDATE_SECRET: z.string().min(16).optional(),
};

type Deployed = {
  HP_ENV: "local" | "preview" | "staging" | "production";
  STORAGE_DRIVER?: "local" | "s3";
  S3_ENDPOINT?: string;
  S3_BUCKET?: string;
  S3_PUBLIC_BUCKET?: string;
  S3_ACCESS_KEY_ID?: string;
  S3_SECRET_ACCESS_KEY?: string;
  EMAIL_TRANSPORT?: "resend" | "smtp" | "file";
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  HELP_INBOX_EMAIL?: string;
  BETTER_AUTH_URL?: string;
  HP_DEMO_SLICE?: "on" | "off";
  WEB_PROXY_SECRET?: string;
  WEB_REVALIDATE?: "on" | "off";
  WEB_REVALIDATE_URL?: string;
  WEB_REVALIDATE_SECRET?: string;
};

const notReal = (value: string) => /(^|[.@/])localhost([:/]|$)|127\.0\.0\.1|\.test([:/>]|$)/i.test(value);

/**
 * Production fails closed (review P0-01): files live in R2, never on the
 * container's disk, in separate private and public buckets; email is really
 * sent; there are no test addresses or demo routes; page refresh is on.
 * Staging follows the same storage rule once its R2 keys exist (ATTENTION.md).
 */
function deployedRules(env: Deployed, ctx: z.RefinementCtx) {
  const fail = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
  if (env.WEB_REVALIDATE === "on") {
    if (!env.WEB_REVALIDATE_URL) fail("WEB_REVALIDATE_URL", "required when WEB_REVALIDATE=on");
    if (!env.WEB_REVALIDATE_SECRET) fail("WEB_REVALIDATE_SECRET", "required when WEB_REVALIDATE=on");
  }
  if (env.HP_ENV !== "production") return;
  if (env.STORAGE_DRIVER !== undefined) {
    if (env.STORAGE_DRIVER !== "s3") fail("STORAGE_DRIVER", "must be s3 in production");
    for (const name of ["S3_ENDPOINT", "S3_BUCKET", "S3_PUBLIC_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const) if (!env[name]) fail(name, "required in production");
    if (env.S3_BUCKET && env.S3_BUCKET === env.S3_PUBLIC_BUCKET) fail("S3_PUBLIC_BUCKET", "must differ from S3_BUCKET");
  }
  if (env.EMAIL_TRANSPORT !== undefined) {
    if (env.EMAIL_TRANSPORT !== "resend") fail("EMAIL_TRANSPORT", "must be resend in production");
    if (!env.RESEND_API_KEY) fail("RESEND_API_KEY", "required in production");
  }
  if (env.WEB_REVALIDATE !== undefined && env.WEB_REVALIDATE !== "on") fail("WEB_REVALIDATE", "must be on in production");
  if (env.HP_DEMO_SLICE === "on") fail("HP_DEMO_SLICE", "must be off in production");
  for (const name of ["BETTER_AUTH_URL", "EMAIL_FROM", "HELP_INBOX_EMAIL", "WEB_REVALIDATE_URL"] as const) {
    const value = env[name];
    if (value && notReal(value)) fail(name, "can't be a localhost or .test address in production");
  }
}

/** The api also needs the web proxy's secret in production, or every visitor shares one address. */
function apiRules(env: Deployed, ctx: z.RefinementCtx) {
  deployedRules(env, ctx);
  if (env.HP_ENV === "production" && !env.WEB_PROXY_SECRET) ctx.addIssue({ code: "custom", path: ["WEB_PROXY_SECRET"], message: "required in production" });
}

const webSchema = z.object({
  API_URL: z.url(),
  WEB_PROXY_SECRET: z.string().min(32).optional(),
  SITE_URL: z.url().optional(),
  INDEXNOW_KEY: z.string().optional(),
  HP_DEMO_SLICE: z.enum(["on", "off"]).default("off"),
  ...monitoring,
});

const apiSchema = z
  .object({
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
    /** Shared with the web app: proves its proxy sent the visitor's address (review P1-08). */
    WEB_PROXY_SECRET: z.string().min(32).optional(),
    ...storage,
  })
  .superRefine(apiRules);

/** IndexNow (PUB-SEO-009): production only. SITE_URL is the public web address; the key is also served at /indexnow-key.txt. */
const seo = {
  SITE_URL: z.url().optional(),
  INDEXNOW_KEY: z
    .string()
    .regex(/^[A-Za-z0-9-]{8,128}$/)
    .optional(),
};

const workerSchema = z
  .object({
    DATABASE_URL: databaseUrl,
    ...seo,
    ...directUrl,
    ...monitoring,
    ...encryption,
    ...email,
    ...storage,
    ...revalidation,
  })
  .superRefine(deployedRules);

/**
 * Migrations log in as the schema owner (DATABASE_MIGRATION_URL); the api and
 * worker use DATABASE_URL, a role that can only read and write rows
 * (TECH-06 §3, review P1-02). Locally one URL does both.
 */
const databaseSchema = z
  .object({
    DATABASE_URL: databaseUrl,
    DATABASE_MIGRATION_URL: databaseUrl.optional(),
    HP_ENV: monitoring.HP_ENV,
  })
  .superRefine((env, ctx) => {
    if (env.HP_ENV === "production" && !env.DATABASE_MIGRATION_URL) ctx.addIssue({ code: "custom", path: ["DATABASE_MIGRATION_URL"], message: "required in production" });
  });

// Tests create and drop their own databases through this server connection.
const testDatabaseSchema = z.object({
  TEST_DATABASE_URL: databaseUrl,
});

function parseEnv<T extends z.ZodType>(schema: T, source: Record<string, string | undefined>): z.output<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    // Names and rule messages only, never the values (they may be secrets).
    const names = result.error.issues.map((issue) => (issue.code === "custom" ? `${issue.path.join(".")} (${issue.message})` : issue.path.join("."))).join(", ");
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

/** Storage settings alone, for tools such as the seed that write sample files. */
export const loadStorageEnv = (source: Record<string, string | undefined> = process.env) => parseEnv(z.object(storage), source);

/** Uses TEST_DATABASE_URL, or DATABASE_URL when no separate test server is set. */
export const loadTestDatabaseEnv = (source: Record<string, string | undefined> = process.env) =>
  parseEnv(testDatabaseSchema, { TEST_DATABASE_URL: source.TEST_DATABASE_URL ?? source.DATABASE_URL });

/** The schema owner's connection for migrations, falling back to DATABASE_URL locally. */
export const migrationConnectionString = (env: { DATABASE_URL: string; DATABASE_MIGRATION_URL?: string }) => env.DATABASE_MIGRATION_URL ?? env.DATABASE_URL;

/** The connection pg-boss should use: direct when set, otherwise the main URL. */
export const jobsConnectionString = (env: { DATABASE_URL: string; DATABASE_DIRECT_URL?: string }) =>
  env.DATABASE_DIRECT_URL ?? env.DATABASE_URL;
