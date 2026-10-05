import { TEST_PEOPLE } from "@holypearls/auth";
import { expect, test } from "@playwright/test";
import { expectNoAxeViolations, expectNoHorizontalScroll, signInStaff, ADMIN } from "./helpers";

/* T02-01: catalogue staff list products, use bulk select, edit a product and manage categories (Pen frames 96, 98 and 104). */

test("catalogue staff list products, select in bulk and open the editor tabs", async ({ page }) => {
  test.setTimeout(150_000);
  await signInStaff(page, TEST_PEOPLE.adminAda);
  await page.goto(`${ADMIN}/products`);
  await expect(page.getByRole("heading", { name: "Products" })).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  await page.getByRole("checkbox", { name: "Select Business Cards" }).check();
  const bar = page.getByRole("region", { name: "Bulk actions" });
  await expect(bar.getByText("1 selected")).toBeVisible();
  await expect(bar.getByRole("button", { name: "Archive" })).toBeVisible();
  await expectNoAxeViolations(page);
  await page.getByRole("checkbox", { name: "Select Business Cards" }).uncheck();

  await page.getByRole("link", { name: "Business Cards" }).click();
  await expect(page.getByRole("heading", { name: "Business Cards" })).toBeVisible();
  for (const tab of ["Media", "Specifications & FAQ", "SEO", "Related"]) {
    await page.getByRole("tab", { name: tab }).click();
    await expect(page.getByRole("tabpanel")).toBeVisible();
    await expectNoAxeViolations(page);
  }
  await expect(page.getByRole("button", { name: "Unpublish" })).toHaveCount(0);
  await expectNoHorizontalScroll(page);
});

test("catalogue staff see categories with their products and editor", async ({ page }) => {
  test.setTimeout(150_000);
  await signInStaff(page, TEST_PEOPLE.adminAda);
  await page.goto(`${ADMIN}/categories`);
  await expect(page.getByRole("heading", { name: "Categories", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Print & business stationery" })).toBeVisible();
  await expect(page.getByLabel("Name")).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);
});
