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
  await page.locator("summary", { hasText: "Fabric & fit" }).scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 600);
  await expect(bar).toBeVisible();
  // The bar says the same price state as the page, from the one shared rule (customerPriceState).
  await expect(page.getByText("ESTIMATE READY · FROM")).toBeVisible();
  await page.locator("summary", { hasText: "Quantity bands" }).click();
  await expect(page.getByText("Standard minimum 10").last()).toBeVisible();
  await expectNoAxeViolations(page);
});

/* The product's stored routes and decorations are the rule (COM-FR-020, 024); the pages render what the API allows. */

type ProductData = { configurator: { allowedRoutes: string[]; allowedDecorations: string[] } };
const SOURCING_LABEL: Record<string, RegExp> = {
  SOURCE_CUSTOMIZE: /Source & Customize/,
  MAKE_FROM_SCRATCH: /Make From Scratch/,
  CUSTOMER_SUPPLIED: /I'll Supply the Garment|Customer Supplied/,
  HELP_ME_CHOOSE: /Help Me Choose/,
};
const DECORATION_LABEL: Record<string, RegExp> = { EMBROIDERY: /^Embroidery/, PRINT: /^Print/, BOTH: /^Both/, RECOMMEND: /^Recommend for me/ };

test("the garment page shows only the routes the product offers", async ({ page }) => {
  const apron = (await (await page.request.get("/api/v1/catalogue/products/apron")).json()) as ProductData;
  expect(apron.configurator.allowedRoutes).toEqual(["SOURCE_CUSTOMIZE", "MAKE_FROM_SCRATCH", "HELP_ME_CHOOSE"]);
  await page.goto("/products/apron");
  const routes = page.getByRole("group", { name: /How should we make it/ }).getByRole("radio");
  await expect(routes).toHaveCount(2);
  await expect(page.getByRole("radio", { name: /Source & Customize/ })).toBeChecked();
  await expect(page.getByRole("radio", { name: /Make From Scratch/ })).toBeVisible();
  await expect(page.getByRole("radio", { name: /Customer Supplied/ })).toHaveCount(0);
});

test("the configurator offers only the product's sourcing and decoration choices", async ({ page }) => {
  test.setTimeout(120_000);
  const apron = (await (await page.request.get("/api/v1/catalogue/products/apron")).json()) as ProductData;
  await page.goto("/products/apron/configure");
  const sourcing = page.locator('input[name="sourcing"]');
  await expect(sourcing).toHaveCount(apron.configurator.allowedRoutes.length);
  for (const route of apron.configurator.allowedRoutes) await expect(page.getByLabel(SOURCING_LABEL[route]!)).toBeVisible();
  await expect(page.getByLabel(/I'll Supply the Garment/)).toHaveCount(0);

  await page.getByRole("button", { name: /Continue to customize/ }).click();
  const decoration = page.locator('input[name="decoration"]');
  await expect(decoration).toHaveCount(apron.configurator.allowedDecorations.length);
  for (const value of apron.configurator.allowedDecorations) await expect(page.getByLabel(DECORATION_LABEL[value]!)).toBeVisible();
});

test("the address can't choose a route the product doesn't offer", async ({ page }) => {
  await page.goto("/products/apron/configure?sourcing=CUSTOMER_SUPPLIED");
  // Not taken as chosen: the configurator stays on the first step with nothing picked.
  await expect(page.getByRole("heading", { level: 1, name: "How should we make it?" })).toBeVisible();
  await expect(page.getByLabel(/I'll Supply the Garment/)).toHaveCount(0);
  await expect(page.locator('input[name="sourcing"]:checked')).toHaveCount(0);
});
