import { TEST_PEOPLE } from "@holypearls/auth";
import { expect, test } from "@playwright/test";
import { ADMIN, expectNoAxeViolations, expectNoHorizontalScroll, signInStaff } from "./helpers";

/*
 * T06-01 in a real browser at 375 and 1440: the proofs and artwork queue
 * (Pen 112) and the customer proof page's privacy. Publishing and deciding
 * are covered by the API tests (the e2e run has no worker to make uploaded
 * proof files READY).
 */

test("staff see proofs to prepare and files needing review (Pen 112)", async ({ page }) => {
  test.setTimeout(150_000);
  await signInStaff(page, TEST_PEOPLE.adminAda);
  await page.goto(`${ADMIN}/proofs`);
  await expect(page.getByRole("heading", { name: "Proofs and artwork", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Artwork review/ })).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);
  const first = page.getByRole("table", { name: "Proofs, oldest first" }).getByRole("link").first();
  if (await first.count()) {
    await first.click();
    await expect(page.getByText(/^PROOF · ORDER/)).toBeVisible();
    await expectNoAxeViolations(page);
    await expectNoHorizontalScroll(page);
  }
});

test("someone else's proof is a 404", async ({ page }) => {
  const response = await page.goto("/orders/0190c5b3-0000-7000-8000-000000000001/proofs/0190c5b3-0000-7000-8000-000000000002");
  expect(response?.status()).toBe(404);
});
