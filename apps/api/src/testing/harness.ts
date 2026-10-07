import type { Type } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { createBetterAuthIdentity, MemoryOutbox, signInAs, TEST_PEOPLE, type TestPersonKey } from "@holypearls/auth";
import { loadTestDatabaseEnv } from "@holypearls/config";
import { buildSeedSteps, createTestDatabase, FakeGateway, runSeed, type TestDatabase } from "@holypearls/testkit";
import type { PaymentGateway } from "@holypearls/payments";
import type { AddressInfo } from "node:net";
import { Writable } from "node:stream";
import { Jobs } from "@holypearls/jobs";
import { LocalDiskStorage } from "@holypearls/storage";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../app.js";
import type { Courier } from "../sales/courier.js";
import { findActiveStaff } from "../identity/actor.js";
import { createLogger } from "../logger.js";

export const TEST_WEB_ORIGIN = "http://localhost:3000";
export const TEST_AUTH_SECRET = "test-secret-for-api-tests-only-0123456789";
export const TEST_SEAL_KEY = "test-seal-key-for-api-tests-only-0123456789";
export const TEST_HELP_INBOX = "help@holypearls.test";

export interface Harness {
  app: NestExpressApplication;
  storage: LocalDiskStorage;
  publicStorage: LocalDiskStorage;
  jobs: Jobs;
  database: TestDatabase;
  outbox: MemoryOutbox;
  /** The payment provider the API uses: a FakeGateway unless the test passed another (or none). */
  payments: PaymentGateway | null;
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
  options: {
    controllers?: Type[];
    rateLimit?: boolean;
    /** WEB_PROXY_SECRET, for tests of the visitor's address. */
    proxySecret?: string;
    /** The admin app's origin and secret: two front ends (ADR-017). Unset: one front end, as older tests expect. */
    adminOrigin?: string;
    adminProxySecret?: string;
    /** Mounts the demo routes (on by default when a Jobs sender is passed). */
    demoSlice?: boolean;
    seed?: boolean;
    /** Serve the demo slice routes. */
    jobs?: boolean;
    /** The payment provider; a FakeGateway by default, null for "not set up". */
    payments?: PaymentGateway | null;
    /** The courier for prices outside the zones (T08-05); none by default, so staff price them. */
    courier?: Courier | null;
    /** Share another harness's database, for example to run two API instances. */
    database?: TestDatabase;
  } = {},
): Promise<Harness> {
  const ownDatabase = !options.database;
  const database = options.database ?? (await createTestDatabase(loadTestDatabaseEnv().TEST_DATABASE_URL));
  if (ownDatabase && options.seed !== false) await runSeed(database.db, buildSeedSteps({ authSecret: TEST_AUTH_SECRET }));
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
    adminOrigin: options.adminOrigin ?? null,
    secureCookies: false,
    outbox,
    now: () => now.value ?? new Date(),
    log: (level, message) => logger[level]({ source: "identity" }, message),
  isStaff: async (userId) => (await findActiveStaff(database.db, userId)) !== null,
  });
  const jobs = new Jobs({
    connectionString: database.url,
    role: "sender",
    settings: {
      "demo.slice": { retryLimit: 1, retryDelay: 1, retryBackoff: false },
      "email.send": { retryLimit: 2, retryDelay: 1, retryBackoff: false },
    },
  });
  await jobs.start();
  const storageDir = await mkdtemp(join(tmpdir(), "hp-files-"));
  const storage = new LocalDiskStorage(join(storageDir, "private"), `${TEST_WEB_ORIGIN}/api`, TEST_SEAL_KEY);
  const publicStorage = new LocalDiskStorage(join(storageDir, "public-media"), `${TEST_WEB_ORIGIN}/api`, TEST_SEAL_KEY);
  const payments = options.payments === undefined ? new FakeGateway() : options.payments;
  const app = await createApp({
    payments,
    courier: options.courier ?? null,
    storage,
    publicStorage,
    db: database.db,
    logger,
    identity,
    jobs,
    sealKey: TEST_SEAL_KEY,
    helpInboxEmail: TEST_HELP_INBOX,
    demoSlice: options.demoSlice ?? Boolean(options.jobs),
    rateLimit: options.rateLimit ?? false,
    proxySecret: options.proxySecret ?? null,
    adminOrigin: options.adminOrigin ?? null,
    adminProxySecret: options.adminProxySecret ?? null,
    now: () => now.value ?? new Date(),
    webOrigin: TEST_WEB_ORIGIN,
    controllers: options.controllers,
  });
  await app.listen(0, "127.0.0.1");
  const { port } = app.getHttpServer().address() as AddressInfo;
  const url = `http://127.0.0.1:${port}`;
  const authUrl = `${url}/v1/auth`;
  return {
    app,
    storage,
    publicStorage,
    jobs,
    database,
    outbox,
    payments,
    logs,
    url,
    authUrl,
    now,
    // With two front ends (ADR-017) staff sign in through the admin, customers through the customer site.
    signInAs: async (key) => {
      const staff = "staff" in TEST_PEOPLE[key] && Boolean(options.adminOrigin);
      const headers: Record<string, string> = staff ? { "x-hp-surface": "admin", ...(options.adminProxySecret ? { "x-hp-proxy-secret": options.adminProxySecret } : {}) } : {};
      return (await signInAs(key, { authUrl, origin: staff ? options.adminOrigin! : TEST_WEB_ORIGIN, headers })).cookie;
    },
    close: async () => {
      await app.close();
      await jobs.stop(1000);
      if (ownDatabase) await database.drop();
    },
  };
}
