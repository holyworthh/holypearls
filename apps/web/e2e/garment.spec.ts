import { expect, test } from "@playwright/test";
import { expectNoAxeViolations, expectNoHorizontalScroll } from "./helpers";

/* T03-05: garment configurator (Pen 22; COM-FR-020–029, 050–054). */

test("polo: sourcing, a placement conflict fixed without resetting, sizes priced", async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto("/products/polo-shirt");
  await expect(page.getByRole("heading", { level: 1, name: "Polo Shirt" })).toBeVisible();
  await expect(page.getByText("Preview only, not to scale.", { exact: false })).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  await page.getByLabel(/Source & Customize/).check();
  await page.getByLabel(/^Embroidery/).check();
  await page.getByRole("checkbox", { name: "Left chest" }).first().check();
  await page.getByRole("checkbox", { name: "Full front" }).first().check();
  await page.getByLabel("M", { exact: true }).fill("20");
  await page.getByLabel("L", { exact: true }).fill("30");

  // Both conflicts appear with fixes; fixing one keeps both placements.
  await expect(page.getByText("Full front covers the left chest area", { exact: false })).toBeVisible({ timeout: 45_000 });
  await page.getByRole("button", { name: "Print this area instead" }).click();
  await expect(page.getByText("Embroidery can't cover", { exact: false })).toHaveCount(0, { timeout: 45_000 });
  await expect(page.getByRole("checkbox", { name: "Left chest" }).first()).toBeChecked();
  await expectNoAxeViolations(page);

  // 50 polos at ₦8,000 + VAT.
  await expect(page.getByText("₦430,000").first()).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText("ESTIMATED", { exact: false }).first()).toBeVisible();
});

test("customer-supplied garments are final after inspection, and unknown sizes are accepted", async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto("/products/polo-shirt");
  await page.getByLabel(/I'll Supply the Garment/).check();
  await expect(page.getByText("The price is final after we inspect your garments.")).toBeVisible();
  await page.getByLabel(/I don't know the sizes yet/).check();
  await page.getByLabel("Total quantity").fill("40");
  await expect(page.getByText("Your garments: the price is final after we inspect them.")).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText("Sizes can be added later", { exact: false })).toBeVisible();
  await expectNoAxeViolations(page);
});
