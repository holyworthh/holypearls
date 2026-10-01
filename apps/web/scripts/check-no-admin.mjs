/**
 * The customer site ships no admin (ADR-017, T00-09): fails when the
 * production build has an admin route, or code that calls admin API routes or
 * the staff authenticator steps. Runs after `next build`, in CI.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("../.next/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const SCAN = ["server", "static"];
const FORBIDDEN_TEXT = [/\/v1\/admin\//, /two-factor\/verify-totp/, /two-factor\/enable/, /StaffSignIn/];
const problems = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (/^admin$/.test(name) && dir.includes(join("server", "app"))) problems.push(`admin route: ${relative(root, path)}`);
      walk(path);
    } else if (/\.(js|mjs|cjs|html|json|rsc|body)$/.test(name)) {
      const text = readFileSync(path, "utf8");
      for (const pattern of FORBIDDEN_TEXT) if (pattern.test(text)) problems.push(`${pattern} in ${relative(root, path)}`);
    }
  }
}

for (const part of SCAN) walk(join(root, part));
if (problems.length) {
  console.error(`The customer build contains admin code (ADR-017):\n${problems.slice(0, 20).join("\n")}`);
  process.exit(1);
}
console.log("No admin routes or admin API calls in the customer build.");
