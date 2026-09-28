import { demoSliceSchema } from "@holypearls/contracts";
import { Jobs } from "@holypearls/jobs";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHarness, type Harness, TEST_WEB_ORIGIN } from "../testing/harness.js";
import { markDemoSliceFailed, processDemoSlice } from "./demo-slice.js";

let harness: Harness;
let worker: Jobs;

const until = async (check: () => Promise<boolean>, timeoutMs = 45_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error("Timed out waiting");
};

const read = async (id: string) =>
  demoSliceSchema.parse((await request(harness.url).get(`/v1/demo/slice/${id}`)).body);

beforeAll(async () => {
  harness = await createHarness({ jobs: true, seed: false });
  // The worker process, in-process: same services the worker app runs.
  worker = new Jobs({
    connectionString: harness.database.url,
    role: "worker",
    settings: { "demo.slice": { retryLimit: 1, retryDelay: 1, retryBackoff: false } },
  });
  await worker.start();
  await worker.work("demo.slice", (payload) => processDemoSlice(harness.database.db, payload.demoId), {
    pollingIntervalSeconds: 0.5,
  });
  await worker.workDeadLetters("demo.slice", (payload) => markDemoSliceFailed(harness.database.db, payload.demoId), {
    pollingIntervalSeconds: 0.5,
  });
});

afterAll(async () => {
  await worker?.stop(1000);
  await harness?.close();
});

describe("end-to-end slice (TECH-00 §14)", () => {
  it("goes API → database → background job → visible result", async () => {
    const created = await request(harness.url)
      .post("/v1/demo/slice")
      .set("origin", TEST_WEB_ORIGIN)
      .send({ message: "hello holypearls" });
    expect(created.status).toBe(201);
    const demo = demoSliceSchema.parse(created.body);
    expect(demo.status).toBe("PENDING");

    await until(async () => (await read(demo.id)).status === "DONE");
    expect(await read(demo.id)).toMatchObject({ status: "DONE", result: "HELLO HOLYPEARLS", attempts: 1 });
  });

  it("retries a failing job, then marks it FAILED from the dead-letter queue", async () => {
    const created = await request(harness.url)
      .post("/v1/demo/slice")
      .set("origin", TEST_WEB_ORIGIN)
      .send({ message: "please fail" });
    const demo = demoSliceSchema.parse(created.body);
    await until(async () => (await read(demo.id)).status === "FAILED");
    expect((await read(demo.id)).attempts).toBe(2);
  });

  it("validates input and hides unknown requests", async () => {
    const bad = await request(harness.url).post("/v1/demo/slice").set("origin", TEST_WEB_ORIGIN).send({ message: "" });
    expect(bad.status).toBe(400);
    expect(bad.body.fieldErrors).toEqual({ message: "Enter a message" });
    expect((await request(harness.url).get("/v1/demo/slice/0190a0e0-0000-7000-8000-000000000000")).status).toBe(404);
  });

  it("runs the job safely twice", async () => {
    const created = await request(harness.url).post("/v1/demo/slice").set("origin", TEST_WEB_ORIGIN).send({ message: "twice" });
    const demo = demoSliceSchema.parse(created.body);
    await until(async () => (await read(demo.id)).status === "DONE");
    await processDemoSlice(harness.database.db, demo.id);
    expect(await read(demo.id)).toMatchObject({ status: "DONE", result: "TWICE" });
  });
});
