import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const PAGES = [
  "/design-system",
  "/design-system/shells/public",
  "/design-system/shells/account",
  "/design-system/shells/workspace",
  "/design-system/shells/admin",
  "/design-system/states/loading",
  "/design-system/states/not-found",
  "/design-system/states/error",
];

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

for (const path of PAGES) {
  test(`${path} passes the automated accessibility check`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test(`${path} has no horizontal scroll`, async ({ page }) => {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test("the not-found page returns 404", async ({ page }) => {
  const response = await page.goto("/design-system/states/not-found");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "We can’t find that page" })).toBeVisible();
});

test("an unknown URL returns 404 with the not-found page", async ({ page }) => {
  const response = await page.goto("/this-page-does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("link", { name: "Go to the homepage" })).toBeVisible();
});

test("a slow route shows the loading page first", async ({ page }) => {
  await page.goto("/design-system/states/loading?delay=3000", { waitUntil: "commit" });
  await expect(page.getByRole("status")).toContainText("Loading");
  await expect(page.getByRole("heading", { name: "Content arrived" })).toBeVisible({ timeout: 10_000 });
});

test("the error page offers a retry", async ({ page }) => {
  await page.goto("/design-system/states/error");
  await expect(page.getByRole("heading", { name: "Something went wrong" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("the skip link is the first focusable element and moves focus to main", async ({ page }) => {
  await page.goto("/design-system");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
});

test("an invalid form shows an error summary that links to each field", async ({ page }) => {
  await page.goto("/design-system");
  await page.getByRole("button", { name: "Save" }).click();
  const summary = page.getByRole("alert").filter({ hasText: "There is a problem" });
  await expect(summary).toBeFocused();
  await expect(summary.getByRole("link")).toHaveCount(4);
  await expect(page.getByLabel("Full name")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Full name")).toHaveAccessibleDescription(/Enter your full name/);
  await expectNoAxeViolations(page);

  await summary.getByRole("link", { name: "Select a quantity" }).click();
  await expect(page.getByLabel("Quantity")).toBeFocused();
});

test("a valid form submits by keyboard and confirms with a toast", async ({ page }) => {
  await page.goto("/design-system");
  await page.getByLabel("Full name").fill("Ada Obi");
  await page.getByLabel("Quantity").selectOption("100");
  await page.getByRole("radio", { name: /Lagos delivery/ }).check();
  await page.getByRole("checkbox", { name: "I understand this is test data" }).check();
  await page.getByRole("button", { name: "Save" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("list", { name: "Notifications" })).toContainText("Sample form saved.");
  await expect(page.getByRole("alert").filter({ hasText: "There is a problem" })).toHaveCount(0);
});

test("radio cards move with arrow keys and skip disabled options", async ({ page }) => {
  await page.goto("/design-system");
  await page.getByRole("radio", { name: /Lagos delivery/ }).focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("radio", { name: /Pick up/ })).toBeChecked();
  await expect(page.getByRole("radio", { name: /Nationwide/ })).toBeDisabled();
});

test("the dialog traps focus, closes on Escape and returns focus", async ({ page }) => {
  await page.goto("/design-system");
  const opener = page.getByRole("button", { name: "Open dialog" });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Remove this item?" });
  await expect(dialog).toBeVisible();
  await expectNoAxeViolations(page);
  for (const key of ["Tab", "Tab", "Tab", "Tab", "Shift+Tab", "Shift+Tab", "Shift+Tab"]) {
    await page.keyboard.press(key);
    expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test("interactive controls meet the 44 px touch target", async ({ page }) => {
  await page.goto("/design-system");
  const controls = page.locator("main button, main input:not([type=checkbox]):not([type=radio]), main select, main a[class]");
  const sizes = await controls.evaluateAll((nodes) =>
    nodes
      .filter((node) => (node as HTMLElement).offsetParent !== null)
      .map((node) => ({ text: node.textContent?.trim() || node.getAttribute("name"), height: node.getBoundingClientRect().height })),
  );
  expect(sizes.length).toBeGreaterThan(10);
  expect(sizes.filter((size) => size.height < 44)).toEqual([]);
});

test("body text uses Geist at 16 px or more", async ({ page }) => {
  await page.goto("/design-system");
  const style = await page.evaluate(() => {
    const body = getComputedStyle(document.body);
    return { size: Number.parseFloat(body.fontSize), family: body.fontFamily };
  });
  expect(style.size).toBeGreaterThanOrEqual(16);
  expect(style.family).toMatch(/Geist/);
});
