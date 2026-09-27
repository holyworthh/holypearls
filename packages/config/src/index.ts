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
});

const workerSchema = z.object({
  DATABASE_URL: databaseUrl,
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
