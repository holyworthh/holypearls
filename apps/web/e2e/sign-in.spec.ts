import { TEST_PEOPLE, totpCode } from "@holypearls/auth";
import { expect, test, type Page } from "@playwright/test";
import { expectNoAxeViolations, ADMIN } from "./helpers";

/*
 * TECH-03 §3 checks in a real browser: a signed-in server-rendered page, a
 * signed-in browser request, sign-out everywhere, staff MFA, and no tokens in
 * browser storage. Runs against the seeded TEST DATA people.
 */


async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

async function signInCustomer(page: Page, person: { email: string; password: string }) {
  await page.goto("/sign-in");
  await page.locator("#sign-in-email").fill(person.email);
  await page.locator("#sign-in-password").fill(person.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/account\/security$/);
}

async function signInStaff(page: Page, person: { email: string; password: string; totpSecret: string }) {
  await page.goto(`${ADMIN}/sign-in`);
  await page.locator("#staff-email").fill(person.email);
  await page.locator("#staff-password").fill(person.password);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Enter your code" })).toBeVisible();
  await page.getByLabel("6-digit code").fill(await totpCode(person.totpSecret));
  await page.getByRole("button", { name: "Verify" }).click();
  // A code can't be used twice; when an earlier test used this one, wait for the next.
  const rejected = page.getByText("That code didn't work. Check your app and try again.");
  if (await rejected.isVisible({ timeout: 3000 }).catch(() => false)) {
    await page.waitForTimeout(30_000 - (Date.now() % 30_000) + 500);
    await page.getByLabel("6-digit code").fill(await totpCode(person.totpSecret));
    await page.getByRole("button", { name: "Verify" }).click();
  }
  await expect(page).toHaveURL(`${ADMIN}/`);
}

test("sign-in pages pass the accessibility check and fit the viewport", async ({ page }) => {
  for (const path of ["/sign-in", `${ADMIN}/sign-in`]) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    await expectNoAxeViolations(page);
    await expectNoHorizontalScroll(page);
  }
});

test("wrong details show the error summary and field errors", async ({ page }) => {
  await page.goto("/sign-in");
  await page.locator("#sign-in-email").fill("ada@okafor");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "We couldn't sign you in" })).toBeVisible();
  await expect(page.getByText("Enter an email like name@example.com").first()).toBeVisible();
  await expect(page.getByText("Enter your password").first()).toBeVisible();
});

test("a signed-in customer gets the server-rendered page and signed-in browser requests", async ({ page, context }) => {
  await signInCustomer(page, TEST_PEOPLE.customerChidi);
  // Server-rendered with the signed-in person.
  await expect(page.getByText(`Signed in as ${TEST_PEOPLE.customerChidi.email}`)).toBeVisible();
  await expect(page.getByText("This device", { exact: true })).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  // A browser request from the signed-in page.
  const me = await page.evaluate(async () => (await fetch("/api/v1/me")).json());
  expect(me.email).toBe(TEST_PEOPLE.customerChidi.email);

  // No tokens where scripts can read them.
  const storage = await page.evaluate(() => ({
    local: Object.keys(localStorage).length,
    session: Object.keys(sessionStorage).length,
    cookie: document.cookie,
  }));
  expect(storage).toEqual({ local: 0, session: 0, cookie: "" });
  const sessionCookie = (await context.cookies()).find((cookie) => cookie.name === "hp.session_token");
  expect(sessionCookie).toMatchObject({ httpOnly: true, sameSite: "Lax" });
});

test("sign out everywhere ends every session", async ({ page, browser }) => {
  const other = await browser.newPage();
  await signInCustomer(other, TEST_PEOPLE.customerAmaka);
  await signInCustomer(page, TEST_PEOPLE.customerAmaka);

  await page.getByRole("button", { name: "Sign out everywhere" }).click();
  const dialog = page.getByRole("dialog", { name: "Sign out everywhere?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Sign out everywhere" }).click();
  await expect(page.getByText("All sessions ended")).toBeVisible();

  for (const tab of [page, other]) {
    const status = await tab.evaluate(async () => (await fetch("/api/v1/me")).status);
    expect(status).toBe(401);
  }
  await other.goto("/account/security");
  await expect(other).toHaveURL(/\/sign-in\?next=/);
  await other.close();
});

test("the customer site has no admin, and non-staff get 404 in the admin app (ADR-017)", async ({ page }) => {
  // Nothing admin lives on the customer site: pages, API routes and authenticator steps are 404.
  expect((await page.goto("/admin"))?.status()).toBe(404);
  expect((await page.request.get("/api/v1/admin/me")).status()).toBe(404);
  expect((await page.request.post("/api/v1/auth/two-factor/verify-totp", { data: { code: "000000" } })).status()).toBe(404);

  const signedOut = await page.goto(`${ADMIN}/`);
  expect(page.url()).toBe(`${ADMIN}/sign-in`);
  expect(signedOut?.ok()).toBe(true);

  // Locally both sites share localhost cookies, so the customer's session reaches the admin and is refused there.
  await signInCustomer(page, TEST_PEOPLE.customerChidi);
  const response = await page.goto(`${ADMIN}/`);
  expect(response?.status()).toBe(404);
  await expect(page).not.toHaveTitle(/Admin/);
  await expect(page.getByRole("heading", { name: "We can’t find that page" })).toBeVisible();
});

test("staff sign in with their authenticator and see only permitted sections", async ({ page }) => {
  test.setTimeout(90_000);
  await signInStaff(page, TEST_PEOPLE.adminAda);
  await expect(page.getByRole("heading", { name: /, Ada$/ })).toBeVisible();
  await expect(page.getByText(/MFA verified/).first()).toBeVisible();

  const nav = page.getByRole("navigation", { name: "Admin" }).first();
  if (await nav.isVisible()) {
    await expect(nav.getByRole("link", { name: "Payments" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Shipments" })).toHaveCount(0);
  }
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  // Permission guard: 403 inside the shell.
  await page.goto(`${ADMIN}/shipments`);
  await expect(page.getByRole("heading", { name: "You don't have access to this" })).toBeVisible();
  await expect(page.getByText("403 · PERMISSION REQUIRED")).toBeVisible();
  await expectNoAxeViolations(page);
});

test("staff without MFA must set up an authenticator first", async ({ page }) => {
  await page.goto(`${ADMIN}/sign-in`);
  await page.locator("#staff-email").fill(TEST_PEOPLE.catalogueNoMfa.email);
  await page.locator("#staff-password").fill(TEST_PEOPLE.catalogueNoMfa.password);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Set up your authenticator" })).toBeVisible();
  await expect(page.getByRole("img", { name: "QR code for your authenticator app" })).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  // Leaving enrolment does not open admin.
  await page.goto(`${ADMIN}/`);
  await expect(page).toHaveURL(`${ADMIN}/sign-in?step=mfa-required`);
  await expect(page.getByText("Admin is locked until you set up MFA.")).toBeVisible();
});

test("a wrong authenticator code shows the field error", async ({ page }) => {
  await page.goto(`${ADMIN}/sign-in`);
  await page.locator("#staff-email").fill(TEST_PEOPLE.adminTunde.email);
  await page.locator("#staff-password").fill(TEST_PEOPLE.adminTunde.password);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("6-digit code").fill("000000");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByText("That code didn't work. Check your app and try again.")).toBeVisible();
});

test("the audit viewer lists entries for AUDIT_VIEW staff", async ({ page }) => {
  test.setTimeout(90_000);
  await signInStaff(page, TEST_PEOPLE.adminAda);
  await page.goto(`${ADMIN}/audit`);
  await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
  await expect(page.getByRole("search", { name: "Filter the audit log" })).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  await page.goto(`${ADMIN}/audit?q=no-such-entry-anywhere`);
  await expect(page.getByRole("heading", { name: "No entries for these filters" })).toBeVisible();
});

test("the admin menu opens at 375 px", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  test.skip(testInfo.project.name !== "mobile-375", "Mobile menu only");
  await signInStaff(page, TEST_PEOPLE.adminAda);
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Operations home" })).toBeVisible();
  await expectNoAxeViolations(page);
});
