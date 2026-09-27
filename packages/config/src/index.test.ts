import { describe, expect, it } from "vitest";
import { loadApiEnv, loadWebEnv, loadWorkerEnv } from "./index.js";

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
      loadApiEnv({ DATABASE_URL: "postgresql://user:secret@localhost/db", API_PORT: "3002" }).API_PORT,
    ).toBe(3002);
    expect(loadWebEnv({ API_URL: "http://localhost:3001" }).API_URL).toBe("http://localhost:3001");
  });
});
