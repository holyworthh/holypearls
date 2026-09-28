import { loadTestDatabaseEnv } from "@holypearls/config";
import { newId, withTransaction } from "@holypearls/db";
import { createTestDatabase, type TestDatabase } from "@holypearls/testkit";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Jobs } from "./jobs.js";
import { deadLetterName, JOB_DEFAULTS, queueSettings } from "./queues.js";

let database: TestDatabase;
const started: Jobs[] = [];

const newJobs = async (role: "worker" | "sender" = "worker") => {
  const jobs = new Jobs({
    connectionString: database.url,
    role,
    // Fast retries so the test sees the dead-letter queue in seconds.
    settings: { "demo.slice": { retryLimit: 2, retryDelay: 1, retryBackoff: false } },
  });
  await jobs.start();
  started.push(jobs);
  return jobs;
};

const until = async (check: () => Promise<boolean>, timeoutMs = 30_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Timed out waiting");
};

const payload = () => ({ v: 1 as const, requestId: "req_test", demoId: newId() });

beforeAll(async () => {
  database = await createTestDatabase(loadTestDatabaseEnv().TEST_DATABASE_URL);
});

afterAll(async () => {
  for (const jobs of started) await jobs.stop(1000);
  await database?.drop();
});

describe("job settings (TECH-02 §8)", () => {
  it("default to 5 retries, 30-second doubling backoff and a 5-minute timeout", () => {
    expect(JOB_DEFAULTS).toEqual({ retryLimit: 5, retryDelay: 30, retryBackoff: true, expireInSeconds: 300 });
    expect(queueSettings("demo.slice")).toEqual(JOB_DEFAULTS);
  });

  it("reject payloads that don't match the queue's schema", async () => {
    const jobs = await newJobs("sender");
    await expect(jobs.send("demo.slice", { v: 1, requestId: "req_x", demoId: "not-a-uuid" })).rejects.toThrow();
    await expect(
      jobs.send("demo.slice", { ...payload(), email: "someone@example.com" } as unknown as ReturnType<typeof payload>),
    ).rejects.toThrow();
  });
});

describe("queueing inside a transaction", () => {
  it("keeps the job only when the business change commits", async () => {
    const jobs = await newJobs("sender");
    let rolledBackId = "";
    await expect(
      withTransaction(database.db, async (tx) => {
        rolledBackId = await jobs.send("demo.slice", payload(), { tx });
        throw new Error("business rule failed");
      }),
    ).rejects.toThrow("business rule failed");
    expect(await jobs.findJob("demo.slice", rolledBackId)).toBeNull();

    const committedId = await withTransaction(database.db, (tx) => jobs.send("demo.slice", payload(), { tx }));
    expect(await jobs.findJob("demo.slice", committedId)).not.toBeNull();
  });
});

describe("workers", () => {
  it("retry a failing job, then move it to the dead-letter queue", async () => {
    const jobs = await newJobs();
    const failing = payload();
    const attempts: number[] = [];
    const dead: string[] = [];
    await jobs.work(
      "demo.slice",
      async (data, job) => {
        if (data.demoId !== failing.demoId) return;
        attempts.push(job.retryCount);
        throw new Error("demo failure");
      },
      { pollingIntervalSeconds: 0.5 },
    );
    await jobs.workDeadLetters("demo.slice", async (data) => void dead.push(data.demoId), { pollingIntervalSeconds: 0.5 });

    const id = await jobs.send("demo.slice", failing);
    await until(async () => dead.includes(failing.demoId), 60_000);
    expect(attempts).toEqual([0, 1, 2]);
    expect((await jobs.findJob("demo.slice", id))?.state).toBe("failed");
    expect(await jobs.queueSize(deadLetterName("demo.slice"))).toBe(0);
    await jobs.stop(1000);
  });

  it("pick up queued jobs after a restart", async () => {
    const sender = await newJobs("sender");
    const queued = payload();
    await sender.send("demo.slice", queued);

    const worker = await newJobs();
    const done: string[] = [];
    await worker.work("demo.slice", async (data) => void done.push(data.demoId), { pollingIntervalSeconds: 0.5 });
    await until(async () => done.includes(queued.demoId));
    await worker.stop(1000);
  });
});
