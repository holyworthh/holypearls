import { expect, test } from "@playwright/test";
import { expectNoAxeViolations, expectNoHorizontalScroll } from "./helpers";

/* Garments: product page (Pen 19) and the stepped configurator (Pen 22; COM-FR-020–029, 050–054). */

test("the polo product page leads to the configurator with the colour and route already chosen", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/products/polo-shirt");
  await expect(page.getByRole("heading", { level: 1, name: "Polo Shirt" })).toBeVisible();
  await expect(page.getByText("From ₦8,500", { exact: false }).first()).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);
  // Pen 19: the uniform set, the quantity bands and the questions come from the product's data.
  await expect(page.getByRole("heading", { name: "Complete the uniform" })).toBeVisible();
  await expect(page.getByText("Priced in quote")).toBeVisible();
  await page.getByLabel("Black").check();
  await page.getByLabel(/Make From Scratch/).check();
  await page.getByRole("link", { name: /Configure yours/ }).click();
  await expect(page).toHaveURL(/\/products\/polo-shirt\/configure\?.*sourcing=MAKE_FROM_SCRATCH/);
  await expect(page.getByText(/Step 2 of 6/i)).toBeVisible();
});

test("polo: a placement conflict fixed without resetting, then sizes priced", async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto("/products/polo-shirt/configure");
  await expect(page.getByRole("heading", { level: 1, name: "How should we make it?" })).toBeVisible();
  await expect(page.getByText("Preview only, not to scale.", { exact: false })).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  await page.getByLabel(/Source & Customize/).check();
  await page.getByRole("button", { name: /Continue to customize/ }).click();
  await page.getByLabel(/^Embroidery/).check();
  await page.getByRole("checkbox", { name: "Left chest" }).first().check();
  await page.getByRole("checkbox", { name: "Full front" }).first().check();

  // Both conflicts appear with fixes; fixing one keeps both placements.
  await expect(page.getByText("Full front covers the left chest area", { exact: false })).toBeVisible({ timeout: 45_000 });
  await page.getByRole("button", { name: "Print this area instead" }).click();
  await expect(page.getByText("Embroidery can't cover", { exact: false })).toHaveCount(0, { timeout: 45_000 });
  await expect(page.getByRole("checkbox", { name: "Left chest" }).first()).toBeChecked();
  await expectNoAxeViolations(page);

  await page.getByRole("button", { name: /Continue to quantity/ }).click();
  await page.getByLabel("M", { exact: true }).fill("20");
  await page.getByLabel("L", { exact: true }).fill("30");
  // 50 polos at ₦8,000 + VAT.
  await expect(page.getByText("₦430,000").first()).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText("ESTIMATED", { exact: false }).first()).toBeVisible();
});

test("customer-supplied garments are final after inspection, and unknown sizes are accepted", async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto("/products/polo-shirt/configure");
  await page.getByLabel(/I'll Supply the Garment/).check();
  await expect(page.getByText("The price is final after we inspect your garments.")).toBeVisible();
  await page.getByRole("button", { name: /Continue to customize/ }).click();
  await page.getByRole("button", { name: /Continue to quantity/ }).click();
  await page.getByLabel(/I don't know the sizes yet/).check();
  await page.getByLabel("Total quantity").fill("40");
  await expect(page.getByText("Your garments: the price is final after we inspect them.")).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText("Sizes can be added later", { exact: false })).toBeVisible();
  await expectNoAxeViolations(page);
});

test("on a phone the Configure bar appears only after the in-page button scrolls away (Pen 20)", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1440) >= 1024, "phone layout");
  await page.goto("/products/polo-shirt");
  const bar = page.getByRole("link", { name: "Configure", exact: true });
  await expect(bar).toBeHidden();
  await page.getByText("Fabric & fit").scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 600);
  await expect(bar).toBeVisible();
  await page.locator("summary", { hasText: "Quantity bands" }).click();
  await expect(page.getByText("Standard minimum 10").last()).toBeVisible();
  await expectNoAxeViolations(page);
});
