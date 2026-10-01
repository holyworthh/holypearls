import { expect, test } from "@playwright/test";
import { expectNoAxeViolations, expectNoHorizontalScroll } from "./helpers";

/* Garments configure on their product page (Pen Stage 4.3 · mfOQO, Q7ml3; COM-FR-010–014, 020–029, 050–054). */

test("the polo product page configures in place, with a route and colour carried in the address", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/products/polo-shirt?sourcing=MAKE_FROM_SCRATCH&colour=black");
  await expect(page.getByRole("heading", { level: 1, name: "Polo Shirt" })).toBeVisible();
  await expect(page.getByText("From ₦8,500", { exact: false }).first()).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);
  // The uniform set and the questions come from the product's data.
  await expect(page.getByRole("heading", { name: "Complete the uniform" })).toBeVisible();
  await expect(page.getByText("Priced in quote").first()).toBeVisible();
  // The route from the address is chosen (the Garment step closes on it) and the next step is open (COM-FR-010: six steady steps).
  await expect(page.locator("#sourcing-MAKE_FROM_SCRATCH")).toBeChecked();
  await expect(page.getByRole("button", { name: /^Garment/ })).toContainText("Make From Scratch");
  await expect(page.getByRole("button", { name: /^Decoration/ })).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("[id^='step-'][id$='-head']")).toHaveCount(6);
});

test("the old configurator address opens the product page, keeping the link's choices", async ({ page }) => {
  await page.goto("/products/polo-shirt/configure?sourcing=MAKE_FROM_SCRATCH");
  await expect(page).toHaveURL(/\/products\/polo-shirt\?sourcing=MAKE_FROM_SCRATCH$/);
  await expect(page.locator("#sourcing-MAKE_FROM_SCRATCH")).toBeChecked();
});

test("polo: a placement conflict fixed without resetting, then sizes priced", async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto("/products/polo-shirt");
  await expect(page.getByText("Approximate preview. You'll approve a production proof.")).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  await page.getByRole("radio", { name: /Source & Customize/ }).check();
  await page.getByRole("button", { name: /Continue to decoration/ }).click();
  await page.getByRole("radio", { name: /^Embroidery/ }).check();
  await page.getByRole("button", { name: /Continue to placement/ }).click();
  await page.getByRole("checkbox", { name: "Left chest" }).first().check();
  await page.getByRole("checkbox", { name: "Full front" }).first().check();

  // Both conflicts appear with fixes; fixing one keeps both placements.
  await expect(page.getByText("Full front covers the left chest area", { exact: false })).toBeVisible({ timeout: 45_000 });
  await page.getByRole("button", { name: "Print this area instead" }).click();
  await expect(page.getByText("Embroidery can't cover", { exact: false })).toHaveCount(0, { timeout: 45_000 });
  await expect(page.getByRole("checkbox", { name: "Left chest" }).first()).toBeChecked();
  await expectNoAxeViolations(page);

  await page.getByRole("button", { name: /Continue to sizes/ }).click();
  await page.getByLabel("M", { exact: true }).fill("20");
  await page.getByLabel("L", { exact: true }).fill("30");
  // 50 polos at ₦8,000 + VAT.
  await expect(page.getByText("₦430,000").first()).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText(/Estimate · 50 pieces/)).toBeVisible();
  // The steppers change a size by one.
  await page.getByRole("button", { name: "One more M" }).click();
  await expect(page.getByLabel("M", { exact: true })).toHaveValue("21");
});

test("customer-supplied garments are final after inspection, and unknown sizes are accepted", async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto("/products/polo-shirt");
  await page.getByRole("radio", { name: /I'll Supply the Garment/ }).check();
  await expect(page.getByText("The price is final after we inspect your garments.")).toBeVisible();
  await page.getByRole("button", { name: /^Sizes & quantity/ }).click();
  await page.getByLabel(/I don't know the sizes yet/).check();
  await page.getByLabel("Total quantity").fill("40");
  await expect(page.getByText("Your garments: the price is final after we inspect them.")).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText("Sizes can be added later", { exact: false })).toBeVisible();
  await expectNoAxeViolations(page);
});

test("on a phone the price bar follows the page until the price ticket is in view (Pen Q7ml3)", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1440) >= 1024, "phone layout");
  await page.goto("/products/polo-shirt");
  const bar = page.getByLabel("Polo Shirt price");
  await expect(bar).toHaveAttribute("aria-hidden", "false");
  await expect(bar.getByRole("link", { name: "Request Final Quote" })).toHaveAttribute("href", "#price-ticket");
  // The step strip says where you are.
  await expect(page.getByText(/STEP 1 OF 6/)).toBeVisible();
  await page.locator("#price-ticket").scrollIntoViewIfNeeded();
  await expect(bar).toHaveAttribute("aria-hidden", "true");
  await expectNoAxeViolations(page);
});

/* The product's stored routes and decorations are the rule (COM-FR-020, 024); the page renders what the API allows. */

type ProductData = { configurator: { allowedRoutes: string[]; allowedDecorations: string[] } };
const SOURCING_LABEL: Record<string, RegExp> = {
  SOURCE_CUSTOMIZE: /Source & Customize/,
  MAKE_FROM_SCRATCH: /Make From Scratch/,
  CUSTOMER_SUPPLIED: /I'll Supply the Garment/,
  HELP_ME_CHOOSE: /Help Me Choose/,
};
const DECORATION_LABEL: Record<string, RegExp> = { EMBROIDERY: /^Embroidery/, PRINT: /^Print/, BOTH: /^Both/, RECOMMEND: /^Recommend for Me/ };

test("the garment page offers only the product's sourcing and decoration choices", async ({ page }) => {
  test.setTimeout(120_000);
  const apron = (await (await page.request.get("/api/v1/catalogue/products/apron")).json()) as ProductData;
  expect(apron.configurator.allowedRoutes).toEqual(["SOURCE_CUSTOMIZE", "MAKE_FROM_SCRATCH", "HELP_ME_CHOOSE"]);
  await page.goto("/products/apron");
  const sourcing = page.locator('input[name="sourcing"]');
  await expect(sourcing).toHaveCount(apron.configurator.allowedRoutes.length);
  for (const route of apron.configurator.allowedRoutes) await expect(page.getByRole("radio", { name: SOURCING_LABEL[route]! })).toBeVisible();
  await expect(page.getByRole("radio", { name: /I'll Supply the Garment/ })).toHaveCount(0);

  await page.getByRole("button", { name: /Continue to decoration/ }).click();
  const decoration = page.locator('input[name="decoration"]');
  await expect(decoration).toHaveCount(apron.configurator.allowedDecorations.length);
  for (const value of apron.configurator.allowedDecorations) await expect(page.getByRole("radio", { name: DECORATION_LABEL[value]! })).toBeVisible();
});

test("the address can't choose a route the product doesn't offer", async ({ page }) => {
  await page.goto("/products/apron?sourcing=CUSTOMER_SUPPLIED");
  // Not taken as chosen: the page opens on the first step with nothing picked.
  await expect(page.getByRole("button", { name: /^Garment/ })).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("radio", { name: /I'll Supply the Garment/ })).toHaveCount(0);
  await expect(page.locator('input[name="sourcing"]:checked')).toHaveCount(0);
});
