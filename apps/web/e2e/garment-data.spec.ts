import { TEST_PEOPLE } from "@holypearls/auth";
import { expect, test, type Page } from "@playwright/test";
import { ADMIN, expectNoAxeViolations, expectNoHorizontalScroll, signInStaff } from "./helpers";

/*
 * T13-01b in a real browser (Pen 118) at 375 and 1440: garment data in the
 * admin, and the customer's "Price updated" notice. The seed is left as it
 * was: the placement is unblocked again and the banner price restored.
 */

/** Calls the admin API from an admin page (the staff session is the page's). */
const adminCall = (page: Page, method: string, path: string, body?: unknown) =>
  page.evaluate(
    async ([verb, url, payload]) => {
      const response = await fetch(`/api${url}`, { method: verb, headers: { "content-type": "application/json" }, body: payload === undefined ? undefined : JSON.stringify(payload) });
      return response.json();
    },
    [method, path, body] as const,
  );

test("garment data: fabrics with staff-only supplier codes, blocked placements and how products are made", async ({ page }, info) => {
  test.setTimeout(150_000);
  await signInStaff(page, TEST_PEOPLE.adminAda);
  await page.goto(`${ADMIN}/garment-data`);
  await expect(page.getByRole("heading", { name: "Garment and production data", level: 1 })).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  const key = `e2e-twill-${info.project.name.includes("375") ? "m" : "d"}-${Date.now()}`;
  await page.getByLabel("Name").fill("E2E twill");
  await page.getByLabel("Key").fill(key);
  await page.getByLabel("Colours").fill("White, Black");
  await page.getByLabel("Supplier code (staff only)").fill("SUP: E2E-TW65");
  await page.getByRole("button", { name: "Add fabric" }).click();
  await expect(page.getByText("E2E twill saved.")).toBeVisible();
  await expect(page.getByRole("cell", { name: "SUP: E2E-TW65" }).first()).toBeVisible();

  // Block print on the left sleeve, then put it back.
  await page.getByRole("navigation", { name: "Garment data" }).getByRole("link", { name: "Decorations & placements" }).click();
  const sleeve = page.getByRole("checkbox", { name: "Print on left sleeve" });
  await expect(sleeve).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Embroidery on full back" })).not.toBeChecked();
  await sleeve.uncheck();
  await expect(page.getByLabel(/What the customer is told: print on the left sleeve/)).toBeVisible();
  await page.getByRole("button", { name: "Save placements" }).click();
  await expect(page.getByText(/^Saved\./)).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);
  await sleeve.check();
  await page.getByRole("button", { name: "Save placements" }).click();
  await expect(page.getByText(/^Saved\./)).toBeVisible();

  await page.getByRole("navigation", { name: "Garment data" }).getByRole("link", { name: "Garment sourcing" }).click();
  await expect(page.getByRole("link", { name: "Polo Shirt" })).toBeVisible();
  await expectNoAxeViolations(page);
});

test("a draft repriced after a price change says so, with the old and new totals", async ({ page, browser }, info) => {
  test.setTimeout(150_000);
  // The customer saves a roll-up banner.
  const customer = await browser.newContext({ viewport: page.viewportSize() ?? undefined, baseURL: info.project.use.baseURL });
  const shopper = await customer.newPage();
  await shopper.goto("/products/roll-up-banner");
  const draft = await shopper.evaluate(async () => {
    const response = await fetch("/api/v1/configurations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productSlug: "roll-up-banner", choices: { size: "85-200-cm" }, quantity: 2 }) });
    return (await response.json()) as { id: string };
  });

  // Staff raise the price from now, then put it back once the customer has seen the change.
  await signInStaff(page, TEST_PEOPLE.adminAda);
  await page.goto(`${ADMIN}/rules`);
  const products = (await adminCall(page, "GET", "/v1/admin/pricing/products")) as { products: { id: string; slug: string }[] };
  const banner = products.products.find((product) => product.slug === "roll-up-banner")!;
  type Price = { current: boolean; currency: string; basis: string; packSize: number; baseMinor: string; tiers: unknown[]; addOns: unknown[]; state: string; includesVat: boolean };
  const prices = (await adminCall(page, "GET", `/v1/admin/pricing/products/${banner.id}/prices`)) as { entries: Price[] };
  const current = prices.entries.find((entry) => entry.current)!;
  const rule = { currency: current.currency, basis: current.basis, packSize: current.packSize, baseMinor: current.baseMinor, tiers: current.tiers, addOns: current.addOns, state: current.state, includesVat: current.includesVat };
  await adminCall(page, "POST", `/v1/admin/pricing/products/${banner.id}/prices`, { ...rule, effectiveFrom: new Date().toISOString(), baseMinor: String(BigInt(rule.baseMinor) + 500_000n), note: "E2E raise" });
  try {
    await shopper.goto(`/products/roll-up-banner?draft=${draft.id}`);
    await expect(shopper.getByText("Price updated", { exact: true })).toBeVisible();
    await expect(shopper.getByText(/^Was ₦[\d,.]+ · now ₦[\d,.]+ for 2 × Roll-Up Banner\. Your choices are unchanged\.$/)).toBeVisible();
    await expectNoAxeViolations(shopper);
    await expectNoHorizontalScroll(shopper);
  } finally {
    await adminCall(page, "POST", `/v1/admin/pricing/products/${banner.id}/prices`, { ...rule, effectiveFrom: new Date().toISOString(), note: "E2E restore" });
    await customer.close();
  }
});
