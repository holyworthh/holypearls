import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/.next/**", "**/node_modules/**", "**/playwright-report/**", "**/test-results/**"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Node build and check scripts.
    files: ["**/*.mjs"],
    languageOptions: {
      globals: { process: "readonly", console: "readonly", URL: "readonly" },
    },
  },
);
