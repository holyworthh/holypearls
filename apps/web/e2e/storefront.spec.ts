import { TEST_PEOPLE } from "@holypearls/auth";
import { expect, test } from "@playwright/test";
import { expectNoAxeViolations, expectNoHorizontalScroll, signInStaff } from "./helpers";

/* T02-03: homepage, navigation, Product Directory and category hubs (Pen 15–18, 105). */

test("a product is reachable from the homepage in three clicks", async ({ page }) => {
  const isMobile = (page.viewportSize()?.width ?? 0) < 768;
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Branded uniforms, print and merch" })).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);
  // 1: a category on the homepage, 2: a product card.
  await page.getByRole("link", { name: "Print & Business Stationery" }).first().click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expectNoAxeViolations(page);
  await page.getByRole("link", { name: "Business Cards" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Business Cards" })).toBeVisible();
  await expectNoAxeViolations(page);
  if (!isMobile) await expectNoHorizontalScroll(page);
});

test("the Products mega-menu works by keyboard", async ({ page }) => {
  const isMobile = (page.viewportSize()?.width ?? 0) < 768;
  test.skip(isMobile, "The mega-menu is desktop only; mobile uses the drill-down menu.");
  await page.goto("/");
  const products = page.getByRole("button", { name: "Products", exact: true });
  await products.focus();
  await page.keyboard.press("Enter");
  await expect(products).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("link", { name: "Apparel & Garment Production" }).first()).toBeVisible();
  await expectNoAxeViolations(page);
  await page.keyboard.press("Escape");
  await expect(products).toHaveAttribute("aria-expanded", "false");
  await expect(products).toBeFocused();
});

test("the mobile menu drills down with 44 px targets", async ({ page }) => {
  const isMobile = (page.viewportSize()?.width ?? 0) < 768;
  test.skip(!isMobile, "Mobile only.");
  await page.goto("/");
  await page.getByRole("button", { name: "Open menu" }).click();
  const menu = page.getByRole("dialog", { name: "Menu" });
  await expect(menu.getByRole("combobox", { name: "Search products" })).toBeVisible();
  await expectNoAxeViolations(page);
  const rows = menu.getByRole("button", { name: "Products" });
  expect((await rows.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await rows.click();
  await expect(menu.getByRole("link", { name: "Bags & Packaging" })).toBeVisible();
  for (const link of await menu.getByRole("link").all()) {
    const box = await link.boundingBox();
    if (box) expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await menu.getByRole("button", { name: "Back" }).click();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
});

test("the directory searches, filters and marks filtered pages noindex", async ({ page }) => {
  await page.goto("/products");
  await expect(page.getByRole("heading", { level: 1, name: "Everything we make" })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  await page.getByRole("combobox", { name: "Search products" }).last().fill("mug");
  await page.getByRole("combobox", { name: "Search products" }).last().press("Enter");
  await expect(page).toHaveURL(/q=mug/);
  await expect(page.getByRole("link", { name: "Standard Mug" })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

  await page.goto("/products?mode=CONSULTATIVE_PROJECT");
  await expect(page.getByRole("link", { name: "Team & Staff Branding" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Business Cards" })).toHaveCount(0);
  await page.getByRole("link", { name: /Remove filter/ }).click();
  await expect(page).toHaveURL(/\/products$/);

  await page.goto("/products?q=zzzz-nothing");
  await expect(page.getByRole("heading", { name: "Nothing matches these filters" })).toBeVisible();
  await expectNoAxeViolations(page);
});

test("category hubs render on the server and staff edit them", async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto("/categories/apparel-garment-production");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "T-Shirts & Tops" })).toBeVisible();
  await expectNoAxeViolations(page);
  expect((await page.request.get("/categories/not-a-category")).status()).toBe(404);

  await signInStaff(page, TEST_PEOPLE.adminAda);
  await page.goto("/admin/categories");
  await page.getByRole("link", { name: "Edit hub page sections →" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /hub$/ })).toBeVisible();
  await page.getByRole("button", { name: "FAQ", exact: true }).click();
  await expect(page.getByRole("heading", { name: /^FAQ/ })).toBeVisible();
  await expectNoAxeViolations(page);

  await page.goto("/admin/merchandising");
  await expect(page.getByRole("heading", { name: "Menus & homepage" })).toBeVisible();
  await expect(page.getByText("Polo Shirt").first()).toBeVisible();
  await expectNoAxeViolations(page);
});
