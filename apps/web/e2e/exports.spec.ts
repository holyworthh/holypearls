import { TEST_PEOPLE } from "@holypearls/auth";
import { expect, test } from "@playwright/test";
import { ADMIN, expectNoAxeViolations, expectNoHorizontalScroll, signInStaff } from "./helpers";

/*
 * T13-03b in a real browser (Pen 120) at 375 and 1440: requesting exports,
 * the personal-data warning, and the types each person may export. The
 * worker isn't running here, so files stay "Generating…"; building and
 * downloading are covered by the API tests.
 */

test("exports: request one, personal-data warning, and only permitted types", async ({ page }) => {
  test.setTimeout(150_000);
  await signInStaff(page, TEST_PEOPLE.adminAda);
  await page.goto(`${ADMIN}/exports`);
  await expect(page.getByRole("heading", { name: "Exports", level: 1 })).toBeVisible();
  const type = page.getByRole("combobox", { name: "What to export" });

  await type.selectOption("CUSTOMERS");
  await expect(page.getByText("Contains personal data")).toBeVisible();
  await type.selectOption("PAYMENTS");
  await expect(page.getByText("Contains personal data")).toHaveCount(0);
  await page.getByRole("button", { name: "Request export" }).click();
  await expect(page.getByText("Export requested")).toBeVisible();
  await expect(page.getByRole("table").getByText("Generating…").first()).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  // The catalogue has no date range.
  await type.selectOption("CATALOGUE");
  await expect(page.getByLabel("From")).toHaveCount(0);

  // Finance: orders and payments only.
  await page.context().clearCookies();
  await signInStaff(page, TEST_PEOPLE.financeFolake);
  await page.goto(`${ADMIN}/exports`);
  await expect(page.getByRole("combobox", { name: "What to export" }).locator("option")).toHaveText(["Orders", "Payments"]);
});
