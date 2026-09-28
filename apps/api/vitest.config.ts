import { defineConfig } from "vitest/config";

export default defineConfig({
  // NestJS uses legacy (TypeScript) decorators, including parameter decorators.
  oxc: { decorator: { legacy: true } },
  // Each test file creates, migrates and seeds its own database, which takes a
  // few seconds locally and up to several minutes against a hosted server as
  // migrations grow.
  test: { hookTimeout: 360_000, testTimeout: 30_000 },
});
