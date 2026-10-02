import { describe, expect, it } from "vitest";
import { loadAdminEnv, loadApiEnv, loadDatabaseEnv, loadTestDatabaseEnv, loadWebEnv, loadWorkerEnv } from "./index.js";

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

  describe("production fails closed (review P0-01)", () => {
    const api = {
      DATABASE_URL: "postgresql://user:secret@db.example.com/db",
      BETTER_AUTH_SECRET: "x".repeat(32),
      BETTER_AUTH_URL: "https://holypearls.example.com",
      DATA_ENCRYPTION_KEY: "k".repeat(32),
      HELP_INBOX_EMAIL: "help@holypearls.example.com",
      WEB_PROXY_SECRET: "p".repeat(32),
      ADMIN_ORIGIN: "https://admin.holypearls.example.com",
      ADMIN_PROXY_SECRET: "a".repeat(32),
      HP_ENV: "production",
    };
    const r2 = {
      STORAGE_DRIVER: "s3",
      S3_ENDPOINT: "https://account.r2.cloudflarestorage.com",
      S3_BUCKET: "holypearls-prod-private",
      S3_PUBLIC_BUCKET: "holypearls-prod-public",
      S3_ACCESS_KEY_ID: "id",
      S3_SECRET_ACCESS_KEY: "s3-secret-value",
    };
    const worker = {
      DATABASE_URL: api.DATABASE_URL,
      BETTER_AUTH_URL: api.BETTER_AUTH_URL,
      DATA_ENCRYPTION_KEY: api.DATA_ENCRYPTION_KEY,
      HP_ENV: "production",
      EMAIL_TRANSPORT: "resend",
      RESEND_API_KEY: "re_key",
      EMAIL_FROM: "HolyPearls <hello@holypearls.example.com>",
      WEB_REVALIDATE: "on",
      WEB_REVALIDATE_URL: "https://holypearls.example.com/api/revalidate",
      WEB_REVALIDATE_SECRET: "r".repeat(32),
      ...r2,
    };

    it("refuses local disk storage", () => {
      expect(() => loadApiEnv(api)).toThrow("STORAGE_DRIVER (must be s3 in production)");
      expect(() => loadWorkerEnv({ ...worker, STORAGE_DRIVER: "local" })).toThrow("STORAGE_DRIVER");
    });

    it("refuses an incomplete R2 setup, or one bucket for both", () => {
      expect(() => loadApiEnv({ ...api, ...r2, S3_SECRET_ACCESS_KEY: undefined })).toThrow("S3_SECRET_ACCESS_KEY");
      expect(() => loadApiEnv({ ...api, ...r2, S3_PUBLIC_BUCKET: r2.S3_BUCKET })).toThrow("S3_PUBLIC_BUCKET");
    });

    it("never prints the secret values", () => {
      try {
        loadApiEnv({ ...api, ...r2, S3_PUBLIC_BUCKET: r2.S3_BUCKET });
      } catch (error) {
        expect(String(error)).not.toContain("s3-secret-value");
        expect(String(error)).not.toContain("secret@");
      }
    });

    it("refuses file email, test addresses, demo routes and switched-off page refresh", () => {
      expect(() => loadWorkerEnv({ ...worker, EMAIL_TRANSPORT: "file" })).toThrow("EMAIL_TRANSPORT");
      expect(() => loadWorkerEnv({ ...worker, EMAIL_FROM: "HolyPearls <hello@holypearls.test>" })).toThrow("EMAIL_FROM");
      expect(() => loadApiEnv({ ...api, ...r2, BETTER_AUTH_URL: "http://localhost:3000" })).toThrow("BETTER_AUTH_URL");
      expect(() => loadApiEnv({ ...api, ...r2, HELP_INBOX_EMAIL: undefined })).toThrow("HELP_INBOX_EMAIL");
      expect(() => loadApiEnv({ ...api, ...r2, HP_DEMO_SLICE: "on" })).toThrow("HP_DEMO_SLICE");
      expect(() => loadApiEnv({ ...api, ...r2, WEB_PROXY_SECRET: undefined })).toThrow("WEB_PROXY_SECRET");
      expect(() => loadWorkerEnv({ ...worker, WEB_REVALIDATE: "off" })).toThrow("WEB_REVALIDATE");
      expect(() => loadWorkerEnv({ ...worker, WEB_REVALIDATE_SECRET: undefined })).toThrow("WEB_REVALIDATE_SECRET");
    });

    it("needs the admin app on its own domain with its own secret (ADR-017)", () => {
      expect(() => loadApiEnv({ ...api, ...r2, ADMIN_ORIGIN: undefined })).toThrow("ADMIN_ORIGIN");
      expect(() => loadApiEnv({ ...api, ...r2, ADMIN_PROXY_SECRET: undefined })).toThrow("ADMIN_PROXY_SECRET");
      expect(() => loadApiEnv({ ...api, ...r2, ADMIN_PROXY_SECRET: api.WEB_PROXY_SECRET })).toThrow("ADMIN_PROXY_SECRET (must differ from WEB_PROXY_SECRET)");
      expect(() => loadApiEnv({ ...api, ...r2, ADMIN_ORIGIN: "https://holypearls.example.com" })).toThrow("ADMIN_ORIGIN (must be its own domain");
      expect(() => loadApiEnv({ ...api, ...r2, ADMIN_ORIGIN: "http://localhost:3002" })).toThrow("ADMIN_ORIGIN");
      const admin = { API_URL: "https://api.holypearls.example.com", SITE_URL: "https://holypearls.example.com", HP_ENV: "production" };
      expect(() => loadAdminEnv(admin)).toThrow("ADMIN_PROXY_SECRET");
      expect(() => loadAdminEnv({ ...admin, ADMIN_PROXY_SECRET: "a".repeat(32), SITE_URL: "http://localhost:3000" })).toThrow("SITE_URL");
      expect(loadAdminEnv({ ...admin, ADMIN_PROXY_SECRET: "a".repeat(32) }).SITE_URL).toBe(admin.SITE_URL);
    });

    it("accepts a complete R2 production setup", () => {
      expect(loadApiEnv({ ...api, ...r2 }).STORAGE_DRIVER).toBe("s3");
      expect(loadWorkerEnv(worker).WEB_REVALIDATE).toBe("on");
    });

    it("leaves local development and staging on their defaults", () => {
      const { HP_ENV: _env, ...local } = api;
      void _env;
      expect(loadApiEnv(local).STORAGE_DRIVER).toBe("local");
      expect(loadApiEnv({ ...local, HP_ENV: "staging" }).STORAGE_DRIVER).toBe("local");
      expect(loadWorkerEnv({ DATABASE_URL: api.DATABASE_URL, DATA_ENCRYPTION_KEY: api.DATA_ENCRYPTION_KEY, BETTER_AUTH_URL: "http://localhost:3000" }).WEB_REVALIDATE).toBe("off");
      // Turning refresh on anywhere needs both values.
      expect(() => loadWorkerEnv({ DATABASE_URL: api.DATABASE_URL, DATA_ENCRYPTION_KEY: api.DATA_ENCRYPTION_KEY, BETTER_AUTH_URL: "http://localhost:3000", WEB_REVALIDATE: "on" })).toThrow("WEB_REVALIDATE_URL");
    });
  });
});
