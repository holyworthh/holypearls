import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { openApiMatches, renderOpenApi } from "./openapi.js";

const target = fileURLToPath(new URL("../openapi.json", import.meta.url));
const mode = process.argv[2];
const generated = renderOpenApi();

if (mode === "write") {
  writeFileSync(target, generated);
  console.log(`Wrote ${target}`);
} else if (mode === "check") {
  const committed = existsSync(target) ? readFileSync(target, "utf8") : "";
  if (!openApiMatches(committed, generated)) {
    console.error("apps/api/openapi.json does not match the contracts. Run `pnpm openapi:generate` and commit the result.");
    process.exit(1);
  }
  console.log("apps/api/openapi.json matches the contracts.");
} else {
  throw new Error("Usage: openapi-cli.js write|check");
}
