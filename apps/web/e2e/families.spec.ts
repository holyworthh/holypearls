import { expect, test } from "@playwright/test";
import { expectNoAxeViolations, expectNoHorizontalScroll } from "./helpers";

/* T03-08: other product families, timing and destinations, Request Final Quote (COM-FR-045–047, 060–061, 070–072). */

test("roll-up banner: a custom size switches to a quote, keeps every choice, and Request Final Quote gives a reference", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/products/roll-up-banner");
  await expect(page.getByRole("heading", { level: 1, name: "Roll-Up Banner" })).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  await page.getByLabel(/^85 × 200 cm/).check();
  await page.getByLabel(/^More/).check();
  await page.getByLabel("Or enter a quantity").fill("2");
  await expect(page.getByText("PRICE READY", { exact: false }).first()).toBeVisible({ timeout: 45_000 });

  // Custom size shows the area and switches to a quote without losing the size or quantity.
  await page.getByLabel(/^Custom size/).check();
  await page.getByLabel("Width (cm)").fill("300");
  await page.getByLabel("Height (cm)").fill("150");
  await expect(page.getByText("4.5 m²").first()).toBeVisible();
  await expect(page.getByText("QUOTE REQUIRED", { exact: false }).first()).toBeVisible({ timeout: 45_000 });
  await expect(page.getByLabel(/^85 × 200 cm/)).toBeChecked();
  await expect(page.getByLabel("Or enter a quantity")).toHaveValue("2");

  // Production and transit are shown separately.
  await page.getByLabel(/^Lagos/).check();
  await expect(page.getByText(/Production: \d+–\d+ working days/).first()).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText(/Delivery: 1–2 working days/).first()).toBeVisible();
  await expectNoAxeViolations(page);

  await page.getByRole("button", { name: "Request Final Quote" }).click();
  await page.getByRole("dialog").getByLabel("Your name").fill("Chidi Okafor");
  await page.getByRole("dialog").getByLabel("Email").fill("chidi.e2e@holypearls.test");
  await page.getByRole("button", { name: "Send quote request" }).click();
  await expect(page.getByText(/HP-Q-\d{4}-\d{4}/).first()).toBeVisible({ timeout: 45_000 });
  await expectNoAxeViolations(page);
});

test("business cards to an international address continue as a quote with freight confirmed in it", async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto("/products/business-cards");
  await page.getByLabel(/^500/).check();
  await page.getByLabel(/^Outside Nigeria/).check();
  await page.getByLabel("Country").fill("Ghana");
  await expect(page.getByText("International delivery: freight is confirmed in your quote.").first()).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText("QUOTE REQUIRED", { exact: false }).first()).toBeVisible();
  await expect(page.getByLabel(/^500/)).toBeChecked();
});

test("a tight deadline suggests rush", async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto("/products/roll-up-banner");
  await page.getByLabel(/^85 × 200 cm/).check();
  await page.getByLabel(/^More/).check();
  await page.getByLabel("Or enter a quantity").fill("1");
  await page.getByLabel(/^Lagos/).check();
  const soon = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
  await page.getByLabel("Needed by").fill(soon);
  await expect(page.getByText(/tighter than our usual timing|should arrive by/).first()).toBeVisible({ timeout: 45_000 });
});
