import { defineConfig } from "vitest/config";

export default defineConfig({
  // NestJS uses legacy (TypeScript) decorators, including parameter decorators.
  oxc: { decorator: { legacy: true } },
  // Each test file creates, migrates and seeds its own database, which takes a
  // few seconds against a hosted server.
  test: { hookTimeout: 120_000, testTimeout: 30_000 },
});
