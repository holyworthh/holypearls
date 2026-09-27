import { existsSync } from "node:fs";

const checks = {
  openapi: ["apps/api/openapi.json"],
};
const kind = process.argv[2];
if (!(kind in checks)) {
  throw new Error("Expected openapi");
}
for (const path of checks[kind]) {
  if (existsSync(path)) {
    throw new Error(`${path} was added. Replace this baseline check with a real ${kind} check.`);
  }
}
console.log(`T00-01: no ${kind} artifact exists yet; baseline check passed.`);
