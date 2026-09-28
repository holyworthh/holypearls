import { defineConfig } from "vitest/config";

// NestJS uses legacy (TypeScript) decorators, including parameter decorators.
export default defineConfig({
  oxc: { decorator: { legacy: true } },
});
