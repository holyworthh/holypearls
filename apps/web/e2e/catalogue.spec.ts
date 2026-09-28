import { TEST_PEOPLE } from "@holypearls/auth";
import { expect, test } from "@playwright/test";
import { expectNoAxeViolations, expectNoHorizontalScroll, signInStaff } from "./helpers";

/* T02-01: catalogue staff see the product list and open the editor (Pen frames 96 and 98). */

test("catalogue staff list products and open the editor", async ({ page }) => {
  test.setTimeout(150_000);
  await signInStaff(page, TEST_PEOPLE.adminAda);
  await page.goto("/admin/products");
  await expect(page.getByRole("heading", { name: "Products" })).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);
  await page.getByRole("link", { name: "Business Cards" }).click();
  await expect(page.getByRole("heading", { name: "Business Cards" })).toBeVisible();
  await expect(page.getByText("PUBLISHED").first()).toBeVisible();
  await expectNoAxeViolations(page);
});
