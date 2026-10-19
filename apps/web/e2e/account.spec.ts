import { TEST_PEOPLE } from "@holypearls/auth";
import { expect, test, type Page } from "@playwright/test";
import { expectNoAxeViolations, expectNoHorizontalScroll } from "./helpers";

/*
 * T09-01 in a real browser (Pen frames 88–92), at 375 and 1440 px: sign-up
 * and "verify your email", the account overview, profile, password reset and
 * change password. The API tests cover verification links and linking.
 */

async function signIn(page: Page, person: { email: string; password: string }, next: string) {
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await page.locator("#sign-in-email").fill(person.email);
  await page.locator("#sign-in-password").fill(person.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => url.pathname === next);
}

test("sign-up asks for the email check, and the unverified overview links nothing", async ({ page }) => {
  await page.goto("/sign-up");
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "We couldn't create your account" })).toBeVisible();
  await expect(page.getByText("Enter your name").first()).toBeVisible();

  const email = `e2e.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@example.com`;
  await page.locator("#sign-up-name").fill("E2E Customer (TEST DATA)");
  await page.locator("#sign-up-email").fill(email);
  await page.locator("#sign-up-password").fill("an-e2e-test-password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Verify your email" })).toBeVisible();
  await expect(page.getByText(`We sent a link to ${email}.`)).toBeVisible();
  await expectNoAxeViolations(page);

  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Hello, E2E" })).toBeVisible();
  await expect(page.getByText(`Verify ${email} to add orders you placed as a guest.`)).toBeVisible();
  await expect(page.getByRole("heading", { name: "No orders yet" })).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);
});

test("the overview, profile and security pages work for a verified customer", async ({ page }) => {
  await signIn(page, TEST_PEOPLE.customerChidi, "/account");
  await expect(page.getByRole("heading", { name: "Hello, Chidi" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Account" }).getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  await page.goto("/account/profile");
  await page.getByLabel("Phone").fill("letters");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Enter a phone number like +234 803 000 0000")).toBeVisible();
  await page.getByLabel("Phone").fill("+234 803 000 0000");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved just now")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Phone")).toHaveValue("+234 803 000 0000");
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  await page.goto("/account/security");
  await page.getByRole("button", { name: "Change password" }).click();
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByText("Enter your current password")).toBeVisible();
  await expectNoAxeViolations(page);
});

test("password reset answers the same for any email, and an expired link says so", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);
  await page.getByLabel("Email").fill(`nobody.${Date.now()}@example.com`);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

  await page.goto("/forgot-password?error=INVALID_TOKEN");
  await expect(page.getByRole("heading", { name: "This reset link has expired" })).toBeVisible();
  await page.goto("/forgot-password?token=not-a-real-token");
  await page.locator("#reset-password").fill("a-new-e2e-password-456");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByRole("heading", { name: "This reset link has expired" })).toBeVisible();
  await expectNoAxeViolations(page);
});

test("changing the email shows it pending until verified; each history list has its own page", async ({ page }) => {
  // T09-01b (Pen 91 "Email change pending"): a fresh account asks for a new email.
  const email = `e2e.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@example.com`;
  await page.goto("/sign-up");
  await page.locator("#sign-up-name").fill("E2E Changer (TEST DATA)");
  await page.locator("#sign-up-email").fill(email);
  await page.locator("#sign-up-password").fill("an-e2e-test-password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Verify your email" })).toBeVisible();

  await page.goto("/account/profile");
  await expect(page.getByText("Changing your email needs verification and signs you out on other devices.")).toBeVisible();
  await page.getByLabel("Email").fill("not-an-email");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Enter an email address like name@example.com")).toBeVisible();
  const newEmail = `new.${email}`;
  await page.getByLabel("Email").fill(newEmail);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(`We sent a link to ${newEmail}. Your email stays ${email} until you verify.`)).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveValue(email);
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);
  await page.reload();
  await expect(page.getByText("Verify your new email", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Resend link" }).click();
  await expect(page.getByText(`Sent again to ${newEmail}.`)).toBeVisible();

  // The lists in full, from the account navigation.
  await page.context().clearCookies();
  await signIn(page, TEST_PEOPLE.customerChidi, "/account");
  await page.getByRole("navigation", { name: "Account" }).getByRole("link", { name: "Orders" }).click();
  await expect(page).toHaveURL(/\/account\/orders$/);
  await expect(page.getByRole("heading", { name: "Orders", level: 1 })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Account" }).getByRole("link", { name: "Orders" })).toHaveAttribute("aria-current", "page");
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);
  for (const [path, heading] of [["/account/quotes", "Quotes"], ["/account/projects", "Projects"], ["/account/drafts", "Drafts"], ["/account/receipts", "Receipts"]] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
  }
  expect((await page.goto("/account/payments"))?.status()).toBe(404);
});
