import { loadTestDatabaseEnv } from "@holypearls/config";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "../database.js";
import { buildSeedSteps, runSeed, TEST_DATA_LABEL, type SeedStep } from "./index.js";

describe("runSeed", () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase(loadTestDatabaseEnv().TEST_DATABASE_URL);
    await database.db.execute(sql`create table seed_probe (label text not null)`);
  });

  afterAll(async () => {
    await database?.drop();
  });

  const insertStep: SeedStep = {
    name: "probe",
    run: async (tx) => {
      await tx.execute(sql`insert into seed_probe (label) values (${TEST_DATA_LABEL})`);
    },
  };

  it("loads steps in order and reports them", async () => {
    await expect(runSeed(database.db, [insertStep])).resolves.toEqual(["probe"]);
    const result = await database.db.execute<{ label: string }>(sql`select label from seed_probe`);
    expect(result.rows).toEqual([{ label: "TEST DATA" }]);
  });

  it("leaves nothing behind when a step fails", async () => {
    const failing: SeedStep = { name: "broken", run: async () => Promise.reject(new Error("bad seed")) };
    await expect(runSeed(database.db, [insertStep, failing])).rejects.toThrow("bad seed");
    const result = await database.db.execute<{ n: number }>(sql`select count(*)::int as n from seed_probe`);
    expect(result.rows[0]?.n).toBe(1);
  });

  it("runs with no steps", async () => {
    await expect(runSeed(database.db, [])).resolves.toEqual([]);
  });

  it("loads the identity test people with staff profiles and grants", async () => {
    await runSeed(database.db, buildSeedSteps({ authSecret: "t".repeat(32) }));
    const result = await database.db.execute<{ users: number; staff: number; admins: number }>(sql`
      select (select count(*)::int from users) as users,
             (select count(*)::int from staff_profiles) as staff,
             (select count(*)::int from staff_permission_grants where permission = 'STAFF_ADMIN') as admins`);
    expect(result.rows[0]).toEqual({ users: 12, staff: 4, admins: 2 });
    // Running it again changes nothing.
    await runSeed(database.db, buildSeedSteps({ authSecret: "t".repeat(32) }));
    const again = await database.db.execute<{ users: number }>(sql`select count(*)::int as users from users`);
    expect(again.rows[0]?.users).toBe(12);
    const catalogue = await database.db.execute<{ families: number; top: number }>(sql`
      select (select count(distinct family)::int from products) as families,
             (select count(*)::int from categories where parent_id is null) as top`);
    expect(catalogue.rows[0]).toEqual({ families: 10, top: 9 });
    // ACME with Lekki and Victoria Island and one member per role (T10-01), once however often the seed runs.
    const acme = await database.db.execute<{ organizations: number; locations: string; roles: string; invitations: string }>(sql`
      select (select count(*)::int from organizations) as organizations,
             (select string_agg(name, ', ' order by name) from locations) as locations,
             (select string_agg(role::text, ', ' order by role) from memberships where status = 'ACTIVE') as roles,
             (select string_agg(status::text, ', ' order by status) from invitations) as invitations`);
    expect(acme.rows[0]).toEqual({
      organizations: 1,
      locations: "Lekki, Victoria Island",
      roles: "OWNER, ADMIN, BUYER, LOCATION_MANAGER, APPROVER, VIEWER",
      invitations: "PENDING, EXPIRED",
    });
    // The Event order (balance due ₦340,000, Name Badge proof V1 changes requested and V2 awaiting) and a paid checkout (T14-03), also once.
    const orders = await database.db.execute<{ orders: string; balance: string; proof: string; versions: string }>(sql`
      select (select string_agg(number, ', ' order by number) from orders) as orders,
             (select amount_minor::text from installments where label = 'Balance' and status = 'DUE') as balance,
             (select status::text from proofs where status <> 'NOT_REQUIRED') as proof,
             (select string_agg(status::text, ', ' order by number) from proof_versions) as versions`);
    expect(orders.rows[0]).toEqual({ orders: "HP-TEST-0001, HP-TEST-0002", balance: "34000000", proof: "AWAITING_APPROVAL", versions: "CHANGES_REQUESTED, PUBLISHED" });
  });
});
