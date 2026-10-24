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

test("the header search opens the same suggestions and 'See all results' searches the whole site", async ({ page }) => {
  test.skip(isPhone(page.viewportSize()?.width), "The header search field is desktop only; phones use the menu search.");
  await page.goto("/");
  await page.getByRole("banner").getByRole("button", { name: "Search", exact: true }).click();
  const box = page.getByRole("dialog", { name: "Search" }).getByRole("combobox", { name: "Search", exact: true });
  await expect(box).toBeFocused();
  await box.fill("polo");
  await expect(page.getByRole("listbox", { name: /Suggestions/ })).toBeVisible();
  await expectNoAxeViolations(page);
  await page.getByRole("link", { name: /See all results for ‘polo’/ }).click();
  await expect(page).toHaveURL(/\/search\?q=polo/);
});

test("the header search is a modal dialog: focus starts in it, stays in it, and returns to the trigger", async ({ page }) => {
  test.skip(isPhone(page.viewportSize()?.width), "The header search field is desktop only; phones use the menu search.");
  await page.goto("/");
  const trigger = page.getByRole("banner").getByRole("button", { name: "Search", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Search" });
  await expect(dialog.getByRole("combobox", { name: "Search", exact: true })).toBeFocused();
  await dialog.getByRole("combobox").fill("polo");
  await expect(page.getByRole("listbox", { name: /Suggestions/ })).toBeVisible();
  // Tab and Shift+Tab never reach the header links or anything else behind it.
  for (const key of [...Array(8).fill("Tab"), ...Array(8).fill("Shift+Tab")] as string[]) {
    await page.keyboard.press(key);
    const inside = await page.evaluate(() => {
      const active = document.activeElement;
      return !active || active === document.body || Boolean(active.closest("dialog[open]"));
    });
    expect(inside).toBe(true);
  }
  // The rest of the page can't be clicked while it's open.
  const logo = (await page.locator('header a[href="/"]').first().boundingBox())!;
  const hit = await page.evaluate(({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest("dialog[open]")), { x: logo.x + logo.width / 2, y: logo.y + logo.height / 2 });
  expect(hit).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("on a phone, filters open in a sheet that holds focus, counts results and applies them", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1440) >= 1024, "The sheet is the phone and tablet layout; desktop has the rail.");
  await page.goto("/products");
  const opener = page.getByRole("button", { name: "Filter", exact: true });
  await opener.click();
  const sheet = page.getByRole("dialog", { name: "Filter" });
  await expect(sheet).toBeVisible();
  const show = sheet.getByRole("button", { name: /^Show \d+ products?$/ });
  const before = await show.textContent();
  await sheet.getByRole("checkbox", { name: "Paper print" }).check();
  // The count follows the ticks before anything is applied.
  await expect(show).not.toHaveText(before!);
  expect(page.url()).not.toContain("decoration=");
  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !document.activeElement || document.activeElement === document.body || Boolean(document.activeElement.closest("dialog[open]")))).toBe(true);
  }
  await expectNoAxeViolations(page);
  // Closing discards; the page behind is unchanged.
  await sheet.getByRole("button", { name: "Close filters" }).click();
  await expect(sheet).toBeHidden();
  await expect(opener).toBeFocused();
  await opener.click();
  await sheet.getByRole("checkbox", { name: "Paper print" }).check();
  await show.click();
  await expect(page).toHaveURL(/decoration=PAPER_PRINT/);
});

test("'Load more' adds the next products below the ones shown", async ({ page }) => {
  await page.goto("/products?limit=4&sort=name");
  await expect(page.getByText(/Showing 4 of \d+/)).toBeVisible();
  const cards = page.locator("[data-directory-results] article:visible");
  const first = await cards.count();
  const url = page.url();
  await page.getByRole("link", { name: /^Load 4 more$/ }).click();
  await expect(page.getByText(/Showing 8 of \d+/)).toBeVisible();
  await expect(cards).toHaveCount(first + 4);
  // The first products stay; nothing navigated away.
  expect(page.url()).toBe(url);
});

test("the footer doesn't ask for an email it can't keep", async ({ page }) => {
  await page.goto("/");
  const footer = page.getByRole("contentinfo");
  // The phone footer (Pen 16) has no newsletter slot; the desktop one shows the notice in its place.
  if ((page.viewportSize()?.width ?? 0) >= 1024) await expect(footer.getByText("Email updates are coming soon.")).toBeVisible();
  await expect(footer.getByRole("textbox")).toHaveCount(0);
  await expect(footer.getByRole("button", { name: "Subscribe" })).toHaveCount(0);
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
  // Garments open on their placement map; the photos follow it in the gallery.
  await page.getByRole("button", { name: /^Show image 1/ }).click();
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
    await page.getByRole("button", { name: "Filter", exact: true }).click();
    await filters().getByRole("checkbox", { name: "Embroidery" }).check();
    await filters().getByRole("checkbox", { name: "Paper print" }).check();
    await page.getByRole("dialog", { name: "Filter" }).getByRole("button", { name: /^Show \d+ products?$/ }).click();
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
  if (await sort.evaluate((element) => element.tagName === "SELECT")) {
    expect(await sort.evaluate((element) => parseFloat(getComputedStyle(element).paddingRight))).toBeGreaterThanOrEqual(32);
  } else {
    // The chevron sits after the label, never over it.
    const [label, caret] = await Promise.all([sort.locator("span").first().boundingBox(), sort.locator("svg").boundingBox()]);
    expect(caret!.x).toBeGreaterThanOrEqual(label!.x + label!.width);
  }
});

test("sections reveal as they scroll into view", async ({ page }) => {
  await page.goto("/");
  const reveals = page.locator("[data-reveal]");
  await expect.poll(() => reveals.count()).toBeGreaterThan(2);
  // Pin the element: Motion keeps tagging content that arrives later, so "last" could move after the scroll.
  const last = reveals.nth((await reveals.count()) - 1);
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
  test.skip((page.viewportSize()?.width ?? 0) < 1280, "The mega-menus are desktop only (the main nav shows from 1280).");
  await page.goto("/");
  const products = page.getByRole("button", { name: "Products", exact: true });
  await products.hover();
  await expect(products).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("link", { name: "Apparel & garment production" }).first()).toBeVisible();
  // Moving into the open menu keeps it open; leaving the header closes it.
  await page.getByRole("link", { name: "Apparel & garment production" }).first().hover();
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
  await page.getByRole("banner").getByLabel("Your cart").hover();
  const tip = page.locator("[role='presentation'][aria-hidden='true']", { hasText: "Your cart" });
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

test("with reduced motion, the marquee and floating swatches stand still", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(`${test.info().project.use.baseURL ?? ""}/`);
  const track = page.getByLabel("Things we make").locator("ul");
  expect(await track.evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
  await context.close();
});
