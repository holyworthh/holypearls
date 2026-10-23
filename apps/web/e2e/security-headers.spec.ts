import { expect, test, type APIResponse, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { ADMIN } from "./helpers";

/* T15-01, TECH-06 §3 and §9: security headers for each kind of route, and script nonces on every page. */

const nonceOf = (response: APIResponse) => /'nonce-([^']+)'/.exec(response.headers()["content-security-policy"] ?? "")?.[1];

/** Every script on the page (except JSON-LD data blocks, which never run) carries this request's nonce. */
async function expectNonced(response: APIResponse) {
  const nonce = nonceOf(response);
  expect(nonce, "the CSP header has a nonce").toBeTruthy();
  const scripts = (await response.text()).match(/<script\b[^>]*>/g) ?? [];
  expect(scripts.length).toBeGreaterThan(0);
  for (const tag of scripts.filter((script) => !script.includes("application/ld+json"))) expect(tag).toContain(`nonce="${nonce}"`);
}

function expectPageHeaders(response: APIResponse, surface: "web" | "admin") {
  const headers = response.headers();
  const csp = headers["content-security-policy"] ?? "";
  const scriptSrc = /script-src ([^;]*)/.exec(csp)?.[1] ?? "";
  expect(response.headersArray().filter((header) => header.name.toLowerCase() === "content-security-policy")).toHaveLength(1);
  expect(scriptSrc).toContain("'strict-dynamic'");
  expect(scriptSrc).not.toContain("'unsafe-inline'");
  expect(scriptSrc).not.toContain("'unsafe-eval'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
  expect(csp.includes("paystack")).toBe(surface === "web");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["permissions-policy"]).toContain("camera=()");
  expect(headers["x-powered-by"]).toBeUndefined();
}

test.skip(({ viewport }) => viewport?.width !== 1440, "Headers don't depend on the viewport");

test("public pages: nonce policy with Paystack, and a new nonce on every request", async ({ request }) => {
  for (const path of ["/", "/products/business-cards"]) {
    const response = await request.get(path);
    expectPageHeaders(response, "web");
    expect(response.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(response.headers()["x-robots-tag"]).toBeUndefined();
    await expectNonced(response);
  }
  expect(nonceOf(await request.get("/"))).not.toBe(nonceOf(await request.get("/")));
});

test("private pages are also noindex", async ({ request }) => {
  for (const path of ["/cart", "/account"]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.headers()["x-robots-tag"], path).toContain("noindex");
    expectPageHeaders(response, "web");
  }
  await expectNonced(await request.get("/cart"));
});

test("guest-link pages send no referrer", async ({ request }) => {
  for (const path of ["/l", `/orders/${randomUUID()}`]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.headers()["referrer-policy"], path).toBe("no-referrer");
    expect(response.headers()["x-robots-tag"], path).toContain("noindex");
    expectPageHeaders(response, "web");
  }
});

test("the admin: its own policy with no third parties, never indexed or cached", async ({ request }) => {
  const response = await request.get(`${ADMIN}/sign-in`);
  expectPageHeaders(response, "admin");
  expect(response.headers()["referrer-policy"]).toBe("no-referrer");
  expect(response.headers()["x-robots-tag"]).toContain("noindex");
  expect(response.headers()["cache-control"]).toBe("private, no-store");
  await expectNonced(response);
  expect(nonceOf(await request.get(`${ADMIN}/sign-in`))).not.toBe(nonceOf(response));
});

test("the API through the web app has exactly one policy, its own", async ({ request }) => {
  const response = await request.get("/api/v1/catalogue/navigation");
  const policies = response.headersArray().filter((header) => header.name.toLowerCase() === "content-security-policy");
  expect(policies.map((header) => header.value)).toEqual([expect.stringContaining("default-src 'none'")]);
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["permissions-policy"]).toContain("camera=()");
});

test("the Paystack webhook, refused for its signature, still answers with the API headers", async ({ request }) => {
  const response = await request.post("/api/v1/webhooks/paystack", { data: "{}", headers: { "content-type": "application/json", "x-paystack-signature": "bad" } });
  expect(response.status()).toBeGreaterThanOrEqual(400);
  expect(response.headers()["content-security-policy"]).toContain("default-src 'none'");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["permissions-policy"]).toContain("camera=()");
});

/** A page that runs under the policy without anything blocked. */
function watchViolations(page: Page) {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy|Refused to/i.test(message.text())) violations.push(message.text());
  });
  page.on("pageerror", (error) => violations.push(error.message));
  return violations;
}

test("pages run under the policy: nothing is blocked", async ({ page }) => {
  test.setTimeout(240_000);
  const violations = watchViolations(page);
  for (const path of ["/", "/products/business-cards", "/cart"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
  }
  await page.goto(`${ADMIN}/sign-in`);
  await expect(page.getByRole("button", { name: /sign in/i }).first()).toBeVisible();

  // One checkout page, reached the way a customer does.
  await page.goto("/products/business-cards");
  await page.getByLabel(/^500/).check();
  await expect(page.getByText("₦69,875").first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Add to cart", exact: true }).click();
  await expect(page).toHaveURL(/\/cart$/, { timeout: 30_000 });
  await page.getByRole("button", { name: "Check out ready items" }).click();
  await expect(page).toHaveURL(/\/checkout\//, { timeout: 30_000 });
  await expect(page.getByText("You're checking out as a guest. No account needed.")).toBeVisible();
  expect(violations).toEqual([]);
});
