import { TEST_PEOPLE } from "@holypearls/auth";
import { expect, test } from "@playwright/test";
import { ADMIN, expectNoAxeViolations, expectNoHorizontalScroll, signInStaff } from "./helpers";

/*
 * T13-03 in a real browser (Pen 95) at 375 and 1440: the admin home's work
 * queues, each opening its filtered list, and only the queues a person's
 * permissions allow.
 */

test("operations home: each queue opens its filtered list; finance sees only payments", async ({ page }) => {
  test.setTimeout(150_000);
  await signInStaff(page, TEST_PEOPLE.adminAda);
  await page.goto(`${ADMIN}/`);
  await expect(page.getByRole("heading", { name: "Operations home", level: 1 })).toBeVisible();
  // The cards, not the sidebar's links of the same name.
  const queues = page.getByRole("main");
  for (const label of ["New Requests", "Quotes to Prepare", "Proofs and Artwork", "Blocked Orders", "Production", "Quality Check", "Ready to Dispatch", "Payments Needing Attention", "Help Requests", "Problem Reports"]) {
    await expect(queues.getByRole("link", { name: new RegExp(`^${label}\\b`) })).toBeVisible();
  }
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  await queues.getByRole("link", { name: /^Quality Check\b/ }).click();
  await expect(page).toHaveURL(`${ADMIN}/production?view=list&group=QUALITY_CHECK`);
  await expect(page.getByRole("heading", { name: "Production board", level: 1 })).toBeVisible();
  await expect(page.getByText(/^Showing Quality check/i)).toBeVisible();

  await page.goto(`${ADMIN}/`);
  await queues.getByRole("link", { name: /^Quotes to Prepare\b/ }).click();
  await expect(page).toHaveURL(`${ADMIN}/quotes?status=PENDING_REVIEW`);

  // Finance: one queue.
  await page.context().clearCookies();
  await signInStaff(page, TEST_PEOPLE.financeFolake);
  await page.goto(`${ADMIN}/`);
  await expect(queues.getByRole("link", { name: /^Payments Needing Attention\b/ })).toBeVisible();
  await expect(queues.getByRole("link", { name: /^New Requests\b/ })).toHaveCount(0);
});
