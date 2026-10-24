import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { signInActors } from "../testing/actors.js";
import { createHarness, type Harness } from "../testing/harness.js";

/*
 * T15-05, runbook 2: rotating the Better Auth secret by adding
 * BETTER_AUTH_SECRETS=2:<new> and keeping BETTER_AUTH_SECRET=<old> must not
 * lock staff out of their authenticator. The seeded authenticator is
 * encrypted under the old secret.
 */

vi.setConfig({ testTimeout: 300_000 });

let harness: Harness;

beforeAll(async () => {
  process.env.BETTER_AUTH_SECRETS = "2:rotated-secret-for-the-rotation-test-0123456789";
  harness = await createHarness();
});

afterAll(async () => {
  delete process.env.BETTER_AUTH_SECRETS;
  await harness?.close();
});

describe("auth secret rotation (runbook 2)", () => {
  it("lets staff sign in with an authenticator set up under the old secret", async () => {
    const actors = await signInActors(harness, ["adminTunde"]);
    expect(actors.adminTunde).toBeTruthy();
  });
});
