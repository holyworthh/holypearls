import type { TestPersonKey } from "@holypearls/auth";
import { apiErrorSchema } from "@holypearls/contracts";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { expect } from "vitest";
import { type Harness, TEST_WEB_ORIGIN } from "./harness.js";

/*
 * Test actors and cross-tenant helpers (TECH-03 §17). Every private route
 * gets a negative test: another person's record is 404, a missing permission
 * is 403, and a signed-out request is 401 or 404.
 */

export type Actors = Record<TestPersonKey | "signedOut", string>;

/** Signs in every test person once; `signedOut` is an empty cookie. */
export async function signInActors(harness: Harness, keys: readonly TestPersonKey[]): Promise<Partial<Actors>> {
  const actors: Partial<Actors> = { signedOut: "" };
  for (const key of keys) actors[key] = await harness.signInAs(key);
  return actors;
}

/** A browser-like request as one actor, with the web origin set. */
export function as(harness: Harness, cookie: string) {
  const agent = request(harness.url);
  const withHeaders = (test: request.Test) => test.set("origin", TEST_WEB_ORIGIN).set("cookie", cookie);
  return {
    get: (path: string) => withHeaders(agent.get(path)),
    post: (path: string, body: object = {}, key?: string) =>
      withHeaders(agent.post(path)).set("idempotency-key", key ?? `test_${randomUUID().replaceAll("-", "")}`).send(body),
    delete: (path: string) => withHeaders(agent.delete(path)),
    patch: (path: string) => withHeaders(agent.patch(path)),
    put: (path: string, body: object = {}) => withHeaders(agent.put(path)).send(body),
  };
}

/** The person must not learn the record exists. */
export function expectHidden(response: request.Response) {
  expect(response.status).toBe(404);
  expect(apiErrorSchema.parse(response.body).code).toBe("NOT_FOUND");
}

/** The person can see it but may not do this. */
export function expectForbidden(response: request.Response, reason?: string) {
  expect(response.status).toBe(403);
  const body = apiErrorSchema.parse(response.body);
  expect(["FORBIDDEN", "MFA_REQUIRED", "RECENT_MFA_REQUIRED"]).toContain(body.code);
  if (reason) expect(JSON.stringify(body.context)).toContain(reason);
}

/** Runs the same request as several actors and checks each outcome. */
export async function expectOutcomes(
  harness: Harness,
  actors: Partial<Actors>,
  send: (client: ReturnType<typeof as>) => Promise<request.Response>,
  expected: Partial<Record<keyof Actors, number>>,
) {
  for (const [actor, status] of Object.entries(expected)) {
    const response = await send(as(harness, actors[actor as keyof Actors] ?? ""));
    expect({ actor, status: response.status }).toEqual({ actor, status });
  }
}
