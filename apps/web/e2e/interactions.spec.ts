import { expect, test } from "@playwright/test";
import { expectNoAxeViolations, expectNoHorizontalScroll } from "./helpers";

/*
 * Site interactions: search suggestions (Pen 09 · R8Aqc), the product image
 * viewer, several filters of one kind at once, and scroll reveals.
 */

const isPhone = (width: number | undefined) => (width ?? 0) < 768;

test("search suggests searches, categories and products as you type, by keyboard", async ({ page }) => {
  await page.goto("/products");
  const box = page.getByRole("combobox", { name: "Search products" }).last();
  await box.fill("emb");
  const list = page.getByRole("listbox", { name: /Suggestions/ });
  await expect(list).toBeVisible();
  await expect(list.getByRole("option", { name: /embroidered polos/ })).toBeVisible();
  await expect(list.getByRole("option", { name: /Flat Embroidery/ })).toBeVisible();
  await expect(list.getByText("Searches", { exact: true })).toBeVisible();
  await expect(list.getByText("Products", { exact: true })).toBeVisible();
  await expectNoAxeViolations(page);
  if (isPhone(page.viewportSize()?.width)) await expectNoHorizontalScroll(page);

  // ↓ moves through the options; the input names the active one.
  await box.press("ArrowDown");
  const active = await box.getAttribute("aria-activedescendant");
  expect(active).toBeTruthy();
  await expect(page.locator(`[id="${active}"]`)).toHaveAttribute("aria-selected", "true");
  await box.press("Escape");
  await expect(list).toBeHidden();
  await expect(box).toHaveValue("emb");

  // Picking a product opens its page.
  await box.fill("flat emb");
  await page.getByRole("option", { name: /Flat Embroidery/ }).click();
  await expect(page).toHaveURL(/\/products\/flat-embroidery/);
});

test("the header search opens the same suggestions and 'See all results' searches the directory", async ({ page }) => {
  test.skip(isPhone(page.viewportSize()?.width), "The header search field is desktop only; phones use the menu search.");
  await page.goto("/");
  await page.getByRole("banner").getByRole("button", { name: "Search products" }).click();
  const box = page.getByRole("dialog", { name: "Search" }).getByRole("combobox", { name: "Search products" });
  await expect(box).toBeFocused();
  await box.fill("polo");
  await expect(page.getByRole("listbox", { name: /Suggestions/ })).toBeVisible();
  await expectNoAxeViolations(page);
  await page.getByRole("link", { name: /See all results for ‘polo’/ }).click();
  await expect(page).toHaveURL(/\/products\?q=polo/);
});

test("a search with no suggestions says so and still offers the full search", async ({ page }) => {
  await page.goto("/products");
  const box = page.getByRole("combobox", { name: "Search products" }).last();
  await box.fill("zzqx");
  await expect(page.getByText(/No suggestions for ‘zzqx’/)).toBeVisible();
  await expect(page.getByRole("link", { name: /See all results for ‘zzqx’/ })).toBeVisible();
});

test("the product image viewer opens in place and moves between images", async ({ page }) => {
  test.skip(isPhone(page.viewportSize()?.width), "Phones swipe the gallery; the viewer opens from desktop and tablet.");
  await page.goto("/products/polo-shirt");
  const url = page.url();
  await page.getByRole("button", { name: "View images full size" }).click();
  const viewer = page.getByRole("dialog", { name: /Polo Shirt images/ });
  await expect(viewer).toBeVisible();
  expect(page.url()).toBe(url);
  await expect(viewer.getByText("1 / 6")).toBeVisible();
  await expectNoAxeViolations(page);
  await viewer.getByRole("button", { name: "Next image" }).click();
  await expect(viewer.getByText("2 / 6")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(viewer.getByText("3 / 6")).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(viewer.getByText("2 / 6")).toBeVisible();
  await viewer.getByRole("button", { name: "Show image 5" }).click();
  await expect(viewer.getByText("5 / 6")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(viewer).toBeHidden();
  // The page gallery follows the image last viewed.
  await expect(page.getByText("5 / 6")).toBeVisible();
});

test("several filters of the same kind can be chosen together", async ({ page }) => {
  const sheet = (page.viewportSize()?.width ?? 0) < 1024;
  await page.goto("/products");
  const filters = () => page.getByRole("form", { name: "Filter products" });
  if (sheet) {
    await page.getByRole("button", { name: "Filter" }).click();
    await filters().getByRole("checkbox", { name: "Embroidery" }).check();
    await filters().getByRole("checkbox", { name: "Paper print" }).check();
    await filters().getByRole("button", { name: "Show results" }).click();
  } else {
    // The desktop rail applies each tick at once (Pen 17 has no apply button).
    await filters().getByRole("checkbox", { name: "Embroidery" }).check();
    await expect(page).toHaveURL(/decoration=EMBROIDERY/);
    await filters().getByRole("checkbox", { name: "Paper print" }).check();
  }
  await expect(page).toHaveURL(/decoration=EMBROIDERY/);
  await expect(page).toHaveURL(/decoration=PAPER_PRINT/);
  await expect(page.getByRole("link", { name: "Remove filter Embroidery available" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Remove filter Paper print available" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Business Cards" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Polo Shirt" }).first()).toBeVisible();
  await expectNoAxeViolations(page);

  // Removing one keeps the other.
  await page.getByRole("link", { name: "Remove filter Embroidery available" }).click();
  await expect(page).toHaveURL(/decoration=PAPER_PRINT/);
  await expect(page).not.toHaveURL(/decoration=EMBROIDERY/);
});

test("the rail's price, quantity and needed-by filters narrow the list", async ({ page }) => {
  await page.goto("/products?price=QUOTE_REQUIRED");
  await expect(page.getByRole("link", { name: "Remove filter Quote required" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Team & Staff Branding" }).first()).toBeVisible();
  await page.goto("/products?qty=1-9");
  await expect(page.getByRole("link", { name: "Remove filter 1–9 pieces" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Polo Shirt" })).toHaveCount(0);
  const soon = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  await page.goto(`/products?neededBy=${soon}`);
  await expect(page.getByRole("link", { name: /Remove filter Needed by/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Team & Staff Branding" })).toHaveCount(0);
  await expectNoAxeViolations(page);
});

test("category tabs scroll without a visible scrollbar and the sort caret has room", async ({ page }) => {
  await page.goto("/products");
  for (const list of await page.locator("nav[aria-label='Categories'] ul, ul[aria-label='Categories']").all()) {
    if (!(await list.isVisible())) continue;
    expect(await list.evaluate((element) => getComputedStyle(element).scrollbarWidth)).toBe("none");
  }
  const sort = page.getByRole("combobox", { name: "Sort by" }).locator("visible=true").first();
  const padding = await sort.evaluate((element) => parseFloat(getComputedStyle(element).paddingRight));
  expect(padding).toBeGreaterThanOrEqual(32);
});

test("sections reveal as they scroll into view", async ({ page }) => {
  await page.goto("/");
  const reveals = page.locator("[data-reveal]");
  await expect.poll(() => reveals.count()).toBeGreaterThan(2);
  const last = reveals.last();
  await last.scrollIntoViewIfNeeded();
  await expect(last).toHaveAttribute("data-revealed", "true");
  await expect.poll(() => last.evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
});

test("with reduced motion, content shows at once", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(`${test.info().project.use.baseURL ?? ""}/`);
  // Nothing is hidden: motion never turns on.
  expect(await page.evaluate(() => document.documentElement.dataset.motion)).toBeUndefined();
  const blocks = page.locator("main h2");
  expect(await blocks.last().evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
  await context.close();
});

test("desktop mega-menus open on hover and close when the pointer leaves", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1200, "The mega-menus are desktop only.");
  await page.goto("/");
  const products = page.getByRole("button", { name: "Products", exact: true });
  await products.hover();
  await expect(products).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("link", { name: "Apparel & Garment Production" }).first()).toBeVisible();
  // Moving into the open menu keeps it open; leaving the header closes it.
  await page.getByRole("link", { name: "Apparel & Garment Production" }).first().hover();
  await expect(products).toHaveAttribute("aria-expanded", "true");
  await page.mouse.move(700, 800);
  await expect(products).toHaveAttribute("aria-expanded", "false");
  // Moving to the next menu switches in place: Projects opens as Products closes, no gap.
  await products.hover();
  await expect(products).toHaveAttribute("aria-expanded", "true");
  const projects = page.getByRole("button", { name: "Projects", exact: true });
  await projects.hover();
  await expect(projects).toHaveAttribute("aria-expanded", "true");
  await expect(products).toHaveAttribute("aria-expanded", "false");
  await page.mouse.move(700, 800);
  await expect(projects).toHaveAttribute("aria-expanded", "false");
  // A click right after hover opened it doesn't close it again.
  await products.hover();
  await expect(products).toHaveAttribute("aria-expanded", "true");
  await products.click();
  await expect(products).toHaveAttribute("aria-expanded", "true");
});

test("icon-only actions show a tooltip with their name on hover and keyboard focus", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1024, "Header icons are desktop only; touch never shows tooltips.");
  await page.goto("/");
  // The header icon, not the utility strip's text link (which has visible text, so no tooltip).
  await page.getByRole("banner").getByRole("link", { name: "Track an order" }).hover();
  const tip = page.locator("[role='presentation'][aria-hidden='true']", { hasText: "Track an order" });
  await expect(tip).toBeVisible();
  const box = await tip.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.mouse.move(700, 800);
  await expect(tip).toBeHidden();
  // Buttons with visible text get no tooltip.
  await page.getByRole("link", { name: "Start a Project" }).first().hover();
  await page.waitForTimeout(600);
  await expect(page.locator("[role='presentation'][aria-hidden='true']")).toHaveCount(0);
  // Keyboard focus shows it at once.
  await page.getByRole("banner").getByRole("link", { name: "Your account" }).focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(page.locator("[role='presentation'][aria-hidden='true']", { hasText: "Your account" })).toBeVisible();
});
