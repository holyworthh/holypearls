import { loadTestDatabaseEnv } from "@holypearls/config";
import { createDatabaseClient, type DatabaseClient, runtimePrivilegeProblems, sql } from "@holypearls/db";
import { Jobs } from "@holypearls/jobs";
import { createTestDatabase, type TestDatabase } from "@holypearls/testkit";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/*
 * The running app logs in as a row-only role (TECH-06 §3, review P1-02).
 * This makes such a login the way production does, a member of
 * holypearls_runtime that acts as it, and checks what it may and may not do.
 */

const { TEST_DATABASE_URL } = loadTestDatabaseEnv();

async function onServer(statement: string) {
  const server = createDatabaseClient(TEST_DATABASE_URL, { max: 1 });
  try {
    await server.db.execute(sql.raw(statement));
  } finally {
    await server.close();
  }
}

describe("the app's database role", () => {
  let database: TestDatabase;
  let runtime: DatabaseClient;
  let runtimeUrl: string;
  const login = `hp_runtime_test_${randomBytes(6).toString("hex")}`;

  beforeAll(async () => {
    database = await createTestDatabase(TEST_DATABASE_URL);
    const password = randomBytes(24).toString("base64url");
    await onServer(`CREATE ROLE "${login}" LOGIN PASSWORD '${password}' IN ROLE holypearls_runtime`);
    await onServer(`ALTER ROLE "${login}" SET role = 'holypearls_runtime'`);
    const url = new URL(database.url);
    url.username = login;
    url.password = password;
    runtimeUrl = url.toString();
    runtime = createDatabaseClient(runtimeUrl, { max: 2 });
  }, 120_000);

  afterAll(async () => {
    await runtime?.close();
    await database?.drop();
    await onServer(`DROP ROLE IF EXISTS "${login}"`);
  });

  const refused = (statement: ReturnType<typeof sql>) => expect(runtime.db.execute(statement)).rejects.toThrow();

  it("reads and writes rows", async () => {
    await runtime.db.execute(sql`insert into rate_limit_buckets (key, window_start, count, expires_at) values ('probe', now(), 1, now() + interval '1 minute')`);
    await runtime.db.execute(sql`update rate_limit_buckets set count = 2 where key = 'probe'`);
    const result = await runtime.db.execute<{ count: number }>(sql`select count from rate_limit_buckets where key = 'probe'`);
    expect(result.rows[0]?.count).toBe(2);
    await runtime.db.execute(sql`delete from rate_limit_buckets where key = 'probe'`);
  });

  it("can't create, alter or drop anything", async () => {
    await refused(sql`create table intruder (id int)`);
    await refused(sql`alter table customers add column intruder text`);
    await refused(sql`drop table rate_limit_buckets`);
    await refused(sql`drop trigger audit_log_no_update_or_delete on audit_log`);
    await refused(sql`alter table audit_log disable trigger all`);
  });

  it("can't change or delete audit log rows", async () => {
    await refused(sql`update audit_log set summary = 'rewritten'`);
    await refused(sql`delete from audit_log`);
    await refused(sql`truncate audit_log`);
  });

  it("passes the production start-up check, which the schema owner fails", async () => {
    expect(await runtimePrivilegeProblems(runtime.db)).toEqual([]);
    expect((await runtimePrivilegeProblems(database.db)).length).toBeGreaterThan(0);
  });

  it("can run the job queue in its own schema", async () => {
    const jobs = new Jobs({ connectionString: runtimeUrl, role: "sender", maxConnections: 1 });
    await jobs.start();
    await jobs.stop();
  }, 60_000);
});
