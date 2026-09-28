import { defineConfig } from "vitest/config";

// Creating and migrating a database per test file takes a few seconds on a hosted server.
export default defineConfig({ test: { hookTimeout: 120_000, testTimeout: 60_000 } });
