import { TEST_PEOPLE } from "@holypearls/auth";
import { expect, test } from "@playwright/test";
import { ADMIN, expectNoAxeViolations, expectNoHorizontalScroll, signInStaff } from "./helpers";

/*
 * T13-05 in a real browser (Pen 121) at 375 and 1440: the refunds list and
 * who may see it. The browser tests run without Paystack, so there's no paid
 * payment to refund here; issuing, the over-limit error, MFA and Paystack's
 * answers are covered by the API tests (payments/refunds.test.ts).
 */

test("refunds: the list for REFUND_ISSUE, 403 for others", async ({ page }) => {
  test.setTimeout(150_000);
  await signInStaff(page, TEST_PEOPLE.adminAda);
  await page.goto(`${ADMIN}/refunds`);
  await expect(page.getByRole("heading", { name: "Refunds", level: 1 })).toBeVisible();
  await expect(page.getByText("No refunds yet")).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);
  // A payment that doesn't exist (or didn't succeed) has no refund form.
  await page.goto(`${ADMIN}/refunds/new?attempt=0190c5b3-0000-7000-8000-000000000001`);
  await expect(page.getByRole("heading", { name: "We can’t find that page" })).toBeVisible();

  await page.context().clearCookies();
  await signInStaff(page, TEST_PEOPLE.financeFolake);
  await page.goto(`${ADMIN}/refunds`);
  await expect(page.getByRole("heading", { name: "You don't have access to this" })).toBeVisible();
  await expect(page.getByText("REFUND_ISSUE")).toBeVisible();
});
