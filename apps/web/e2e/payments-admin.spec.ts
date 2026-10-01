import { TEST_PEOPLE } from "@holypearls/auth";
import { expect, test } from "@playwright/test";
import { ADMIN, expectNoAxeViolations, expectNoHorizontalScroll, signInStaff } from "./helpers";

/*
 * T04-05 in a real browser: the payments admin (Pen 109, 99, 100) at 375 and
 * 1440, and the customer order page's privacy (anyone else gets 404).
 */

test("payments admin: list, review queue and settings pass the accessibility check", async ({ page }) => {
  test.setTimeout(150_000);
  await signInStaff(page, TEST_PEOPLE.adminAda);

  await page.goto(`${ADMIN}/payments`);
  await expect(page.getByRole("heading", { name: "Payments", level: 1 })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Payments" }).getByRole("link", { name: /Review queue/ })).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  await page.goto(`${ADMIN}/payments/reviews`);
  await expect(page.getByRole("heading", { name: "Review queue", level: 1 })).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  await page.goto(`${ADMIN}/payments/settings`);
  await expect(page.getByRole("heading", { name: "Payment settings", level: 1 })).toBeVisible();
  await expect(page.getByText("Paystack setup checklist")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /Apple Pay/ })).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);
});

test("someone else's order is a 404", async ({ page }) => {
  const response = await page.goto("/orders/0190c5b3-0000-7000-8000-000000000001");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "We can’t find that page" })).toBeVisible();
});
