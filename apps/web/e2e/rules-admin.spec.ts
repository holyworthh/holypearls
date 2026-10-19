import { TEST_PEOPLE } from "@holypearls/auth";
import { expect, test } from "@playwright/test";
import { ADMIN, expectNoAxeViolations, expectNoHorizontalScroll, signInStaff } from "./helpers";

/*
 * T13-01 in a real browser: Rules & prices (Pen 107) at 375 and 1440. Saving
 * leaves the seed as it was: the rules are saved unchanged and the new price
 * version starts in 2030.
 */

test("rules & prices: products, product rules, a scheduled price version, price states and VAT", async ({ page }, info) => {
  test.setTimeout(150_000);
  await signInStaff(page, TEST_PEOPLE.adminAda);

  await page.goto(`${ADMIN}/rules`);
  await expect(page.getByRole("heading", { name: "Rules & prices", level: 1 })).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);
  // The products table (a scheduled-changes panel above may link the product too).
  await page.getByRole("table").getByRole("link", { name: "Business Cards" }).click();

  // Product rules (Pen 107 pGEKn).
  await expect(page.getByRole("navigation", { name: "Rules" }).getByRole("link", { name: "Product rules" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByLabel("Minimum order quantity")).toHaveValue("100");
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);
  await page.getByRole("button", { name: "Save rules" }).click();
  await expect(page.getByText(/^Rules saved\./)).toBeVisible();

  // Price rules (Pen 107 JElIg): a version from November 2030, a day apart per viewport (two versions can't start at the same moment).
  const day = info.project.name.includes("375") ? "01" : "02";
  await page.getByRole("navigation", { name: "Rules" }).getByRole("link", { name: "Price rules" }).click();
  await expect(page.getByText("CURRENT", { exact: true })).toBeVisible();
  await page.getByLabel("Effective from (Lagos time)").fill(`2030-11-${day}T00:00`);
  await page.getByRole("button", { name: "Save price version" }).click();
  await expect(page.getByText(new RegExp(`^Price version scheduled\\. New prices take effect ${day} NOV 00:00\\.`))).toBeVisible();
  await expect(page.getByText("SCHEDULED", { exact: true }).first()).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  await page.getByRole("navigation", { name: "Rules" }).getByRole("link", { name: "Price-state rules" }).click();
  await expect(page.getByRole("heading", { name: "How the price state is decided (OPS-FR-015)" })).toBeVisible();
  await expectNoAxeViolations(page);

  await page.getByRole("navigation", { name: "Rules" }).getByRole("link", { name: "VAT" }).click();
  await expect(page.getByRole("heading", { name: "VAT (OPS-FR-019)" })).toBeVisible();
  await expect(page.getByText("CURRENT", { exact: true })).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);
});
