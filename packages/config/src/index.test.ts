import { describe, expect, it } from "vitest";
import { loadApiEnv, loadDatabaseEnv, loadTestDatabaseEnv, loadWebEnv, loadWorkerEnv } from "./index.js";

describe("environment configuration", () => {
  it("rejects missing required values without printing secrets", () => {
    expect(() => loadApiEnv({})).toThrow("DATABASE_URL");
    expect(() => loadWorkerEnv({})).toThrow("DATABASE_URL");
    expect(() => loadWebEnv({})).toThrow("API_URL");
  });

  it("rejects wrong database URLs and ports", () => {
    expect(() => loadApiEnv({ DATABASE_URL: "https://example.com" })).toThrow("DATABASE_URL");
    expect(() =>
      loadApiEnv({ DATABASE_URL: "postgresql://user:secret@localhost/db", API_PORT: "0" }),
    ).toThrow("API_PORT");
  });

  it("returns typed values for valid configuration", () => {
    expect(
      loadApiEnv({
        DATABASE_URL: "postgresql://user:secret@localhost/db",
        API_PORT: "3002",
        BETTER_AUTH_SECRET: "x".repeat(32),
        BETTER_AUTH_URL: "http://localhost:3000",
        DATA_ENCRYPTION_KEY: "k".repeat(32),
      }).API_PORT,
    ).toBe(3002);
    expect(loadWebEnv({ API_URL: "http://localhost:3001" }).API_URL).toBe("http://localhost:3001");
  });

  it("falls back to DATABASE_URL for tests and rejects a missing database", () => {
    expect(() => loadDatabaseEnv({})).toThrow("DATABASE_URL");
    expect(() => loadTestDatabaseEnv({})).toThrow("TEST_DATABASE_URL");
    expect(loadTestDatabaseEnv({ DATABASE_URL: "postgresql://localhost/a" }).TEST_DATABASE_URL).toBe(
      "postgresql://localhost/a",
    );
    expect(
      loadTestDatabaseEnv({ DATABASE_URL: "postgresql://localhost/a", TEST_DATABASE_URL: "postgresql://localhost/b" })
        .TEST_DATABASE_URL,
    ).toBe("postgresql://localhost/b");
  });
});
