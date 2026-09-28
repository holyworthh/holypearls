import { TEST_PEOPLE } from "@holypearls/auth";
import { expect, test, type Page } from "@playwright/test";
import { expectNoAxeViolations, signInStaff } from "./helpers";

/*
 * T01-02: "Need help" carries the page's context to staff; a guest sees only
 * their own request; staff reply from the help inbox; the notification log
 * and guest links show their states.
 */

const signInAda = (page: Page) => signInStaff(page, TEST_PEOPLE.adminAda);

test("a guest asks for help with context, sees their own request, and staff reply", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const question = `Can you embroider a 12-colour logo? ${Date.now()}`;
  await page.goto("/dev/slice");
  await page.getByRole("button", { name: "Need help?" }).click();
  const dialog = page.getByRole("dialog", { name: "Ask HolyPearls" });
  await dialog.getByRole("button", { name: "Send to HolyPearls" }).click();
  await expect(dialog.getByText("Tell us what you need help with").first()).toBeVisible();
  await dialog.getByLabel("Your question").fill(question);
  await dialog.getByLabel("Email").fill("bisi.e2e@holypearls.test");
  await dialog.getByLabel("Name").fill("Bisi");
  await expectNoAxeViolations(page);
  await dialog.getByRole("button", { name: "Send to HolyPearls" }).click();
  await expect(page.getByRole("dialog", { name: "We got your question" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("link", { name: "See your request" }).click();
  await expect(page.getByText(question)).toBeVisible();
  const url = page.url();

  // Another browser (no guest session) can't see it.
  const stranger = await (await browser.newContext()).newPage();
  const response = await stranger.goto(url);
  expect(response?.status()).toBe(404);
  await stranger.close();

  const staff = await (await browser.newContext()).newPage();
  await signInAda(staff);
  await staff.goto("/admin/help");
  await expect(staff.getByRole("heading", { name: "Help inbox" })).toBeVisible();
  await staff.getByRole("link", { name: /Bisi · guest/ }).first().click();
  await expect(staff.getByText("Context attached automatically")).toBeVisible();
  await expect(staff.getByRole("region", { name: "Context attached automatically" }).getByText("End-to-end slice (demo) · step Send a message")).toBeVisible();
  await expectNoAxeViolations(staff);
  await staff.getByLabel("Reply to customer (sent by email)").fill("Yes — 12 colours works on a 9 cm logo.");
  await staff.getByRole("button", { name: "Send reply and mark ANSWERED" }).click();
  await expect(staff.getByText("Reply sent")).toBeVisible();
  await staff.close();

  await page.reload();
  await expect(page.getByText("Yes — 12 colours works on a 9 cm logo.")).toBeVisible();
});

test("the notification log lists emails for support staff", async ({ page }) => {
  test.setTimeout(150_000);
  await signInAda(page);
  await page.goto("/admin/notifications");
  await expect(page.getByRole("heading", { name: "Notification log" })).toBeVisible();
  await expectNoAxeViolations(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("a broken guest link explains itself and leaves no secret in the address bar", async ({ page }) => {
  await page.goto("/l#this-is-not-a-real-secret-this-is-not-a-real-secret-xyz");
  await expect(page.getByRole("heading", { name: "This link doesn't work" })).toBeVisible();
  expect(page.url()).toMatch(/\/l$/);
  await expectNoAxeViolations(page);
});
