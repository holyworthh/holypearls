import type { Type } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { createBetterAuthIdentity, MemoryOutbox, signInAs, type TestPersonKey } from "@holypearls/auth";
import { loadTestDatabaseEnv } from "@holypearls/config";
import { buildSeedSteps, createTestDatabase, runSeed, type TestDatabase } from "@holypearls/testkit";
import type { AddressInfo } from "node:net";
import { Writable } from "node:stream";
import { Jobs } from "@holypearls/jobs";
import { createApp } from "../app.js";
import { findActiveStaff } from "../identity/actor.js";
import { createLogger } from "../logger.js";

export const TEST_WEB_ORIGIN = "http://localhost:3000";
export const TEST_AUTH_SECRET = "test-secret-for-api-tests-only-0123456789";

export interface Harness {
  app: NestExpressApplication;
  jobs: Jobs | null;
  database: TestDatabase;
  outbox: MemoryOutbox;
  logs: string[];
  /** Base URL of the listening API. */
  url: string;
  /** Sign-in routes as the API serves them. */
  authUrl: string;
  now: { value: Date | null };
  signInAs(key: TestPersonKey): Promise<string>;
  close(): Promise<void>;
}

/** A migrated, seeded database and a listening API, for one test file. */
export async function createHarness(
  options: { controllers?: Type[]; rateLimit?: boolean; seed?: boolean; jobs?: boolean } = {},
): Promise<Harness> {
  const database = await createTestDatabase(loadTestDatabaseEnv().TEST_DATABASE_URL);
  if (options.seed !== false) await runSeed(database.db, buildSeedSteps({ authSecret: TEST_AUTH_SECRET }));
  const logs: string[] = [];
  const logger = createLogger({
    environment: "test",
    destination: new Writable({
      write(chunk, _encoding, done) {
        logs.push(...String(chunk).trim().split("\n"));
        done();
      },
    }),
  });
  const outbox = new MemoryOutbox();
  const now: { value: Date | null } = { value: null };
  const identity = createBetterAuthIdentity({
    db: database.db,
    secret: TEST_AUTH_SECRET,
    webOrigin: TEST_WEB_ORIGIN,
    secureCookies: false,
    outbox,
    rateLimit: options.rateLimit ?? false,
    now: () => now.value ?? new Date(),
    log: (level, message) => logger[level]({ source: "identity" }, message),
  isStaff: async (userId) => (await findActiveStaff(database.db, userId)) !== null,
  });
  const jobs = options.jobs
    ? new Jobs({
        connectionString: database.url,
        role: "sender",
        settings: { "demo.slice": { retryLimit: 1, retryDelay: 1, retryBackoff: false } },
      })
    : null;
  await jobs?.start();
  const app = await createApp({
    db: database.db,
    logger,
    identity,
    jobs: jobs ?? undefined,
    demoSlice: Boolean(jobs),
    webOrigin: TEST_WEB_ORIGIN,
    controllers: options.controllers,
  });
  await app.listen(0, "127.0.0.1");
  const { port } = app.getHttpServer().address() as AddressInfo;
  const url = `http://127.0.0.1:${port}`;
  const authUrl = `${url}/v1/auth`;
  return {
    app,
    jobs,
    database,
    outbox,
    logs,
    url,
    authUrl,
    now,
    signInAs: async (key) => (await signInAs(key, { authUrl, origin: TEST_WEB_ORIGIN })).cookie,
    close: async () => {
      await app.close();
      await jobs?.stop(1000);
      await database.drop();
    },
  };
}
