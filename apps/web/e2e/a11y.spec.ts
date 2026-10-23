import { TEST_PEOPLE } from "@holypearls/auth";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { ADMIN, axeViolations, expectNoAxeViolations, focusProblems, signInCustomer, signInStaff } from "./helpers";

/*
 * T14-03: WCAG 2.2 AA across every surface. One test per kind of person, each
 * walking its route list. Every route gets axe (wcag2a/aa, 2.1, 2.2, which
 * includes 24 px target size and contrast); at 375 px the page must still fit
 * at 320 px (1.4.10); at 1440 px a Tab walk checks each stop shows focus and
 * isn't hidden under something (2.4.7, 2.4.11). One run reports every route.
 * Pages that only read are opened; forms are never submitted.
 */

// The fixtures in packages/testkit/src/seed/orders.ts (SEED_ORDERS).
const ORDER_A = "0190c5b3-0000-7000-8000-00000000a106";
const ITEM_A2 = "0190c5b3-0000-7000-8000-00000000a108";
const QUOTE_A = "0190c5b3-0000-7000-8000-00000000a101";
const PROOF_A = "0190c5b3-0000-7000-8000-00000000a111";
const RECEIPT_A = "0190c5b3-0000-7000-8000-00000000a110";
const BALANCE_INTENT = "0190c5b3-0000-7000-8000-00000000a10e";
const ORDER_B = "0190c5b3-0000-7000-8000-00000000b102";
const CHECKOUT_B = "0190c5b3-0000-7000-8000-00000000b101";

test.beforeEach(() => {
  test.setTimeout(900_000);
});

/** Opens each path (a site path, or a full admin address) and returns every accessibility problem found. */
async function walk(page: Page, paths: string[], testInfo: TestInfo): Promise<string[]> {
  const mobile = testInfo.project.name === "mobile-375";
  const failures: string[] = [];
  for (const path of paths) {
    const label = path.replace(ADMIN, "admin");
    try {
      const response = await page.goto(path);
      // Unknown routes are meant to be 404 pages; everything else must open.
      if (!response?.ok() && !path.includes("does-not-exist")) failures.push(`${label}: opened with ${response?.status()}`);
      for (const violation of await axeViolations(page)) failures.push(`${label}: ${violation}`);
      if (mobile) {
        await page.setViewportSize({ width: 320, height: 812 });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        if (overflow > 0) failures.push(`${label}: reflow at 320 px, ${overflow} px too wide`);
        await page.setViewportSize({ width: 375, height: 812 });
      } else {
        for (const problem of await focusProblems(page)) failures.push(`${label}: ${problem}`);
      }
    } catch (error) {
      failures.push(`${label}: ${(error as Error).message.split("\n")[0]}`);
    }
  }
  return failures;
}

test("public pages", async ({ page }, testInfo) => {
  expect(await walk(
      page,
      [
      "/",
      "/products",
      "/products/business-cards",
      "/products/polo-shirt",
      "/products/roll-up-banner",
      "/products/team-staff-branding",
      "/categories/apparel-garment-production",
      "/search?q=polo",
      "/search?q=embroidered%20glass%20cup",
      "/projects",
      "/projects/conference-kit",
      "/our-work",
      "/our-work/hotel-front-desk-uniforms",
      "/resources",
      "/resources/fabric-for-hot-kitchens",
      "/about",
      "/contact",
      "/photo-credits",
      "/start",
      "/cart",
      "/track",
      "/sign-in",
      "/sign-up",
      "/forgot-password",
      "/invitations",
      "/l",
      "/g",
      "/this-page-does-not-exist",
    ],
    testInfo,
  )).toEqual([]);
});

test("customer pages", async ({ page }, testInfo) => {
  await signInCustomer(page, TEST_PEOPLE.customerChidi, "/account");
  expect(await walk(
    page,
    [
      "/account",
      "/account/profile",
      "/account/security",
      "/account/quotes",
      "/account/projects",
      "/account/drafts",
      "/account/receipts",
      "/account/payments",
      "/account/workspace",
      `/orders/${ORDER_A}`,
      `/orders/${ORDER_A}/proofs/${PROOF_A}`,
      `/orders/${ORDER_A}/receipts/${RECEIPT_A}`,
      `/orders/${ORDER_A}/cancel`,
      `/orders/${ORDER_A}/change`,
      `/orders/${ORDER_A}/problem`,
      `/orders/${ORDER_A}/items/1/reorder`,
      `/quotes/${QUOTE_A}`,
      `/orders/${ORDER_B}`,
      `/checkout/${CHECKOUT_B}/processing`,
    ],
    testInfo,
  )).toEqual([]);
});

test("workspace pages", async ({ page }, testInfo) => {
  await signInCustomer(page, TEST_PEOPLE.acmeOwner, "/workspace");
  const ws = new URL(page.url()).pathname.split("/")[2]!;
  const base = `/workspace/${ws}`;
  expect(await walk(
page,
    [base, ...["orders", "projects", "more", "team", "locations", "approval-rule", "billing", "approvals", "assets", "templates", "groups", "groups/new", "stores", "search?q=acme"].map((path) => `${base}/${path}`)],
    testInfo,
  )).toEqual([]);
});

test("staff pages", async ({ page }, testInfo) => {
  await signInStaff(page, TEST_PEOPLE.adminAda);
  const paths = [
    "/",
    "/products",
    "/products/new",
    "/categories",
    "/merchandising",
    "/content",
    "/content/search-phrases",
    "/rules",
    "/garment-data",
    "/delivery",
    "/delivery-prices",
    "/projects",
    "/projects/rules",
    "/quotes",
    "/quotes/settings",
    "/proofs",
    "/production",
    "/shipments",
    "/problems",
    "/payments",
    "/payments/reviews",
    "/payments/settings",
    "/refunds",
    "/exports",
    "/organizations",
    "/organization-requests",
    "/brand-assets",
    "/templates",
    "/staff",
    "/audit",
    "/help",
    "/notifications",
    `/quotes/${QUOTE_A}`,
    `/proofs/${PROOF_A}`,
    `/production/items/${ITEM_A2}`,
    `/shipments/orders/${ORDER_A}`,
    `/payments/intents/${BALANCE_INTENT}`,
  ].map((path) => `${ADMIN}${path}`);
  const failures = await walk(page, paths, testInfo);
  // The first organization and the first staff member in the lists.
  for (const [list, prefix] of [
    ["/organizations?q=ACME", "/organizations/"],
    ["/staff", "/staff/"],
  ] as const) {
    await page.goto(`${ADMIN}${list}`);
    const href = await page.locator(`main a[href^="${prefix}"]`).first().getAttribute("href");
    if (href) failures.push(...(await walk(page, [`${ADMIN}${href}`], testInfo)));
    else failures.push(`${list}: no link to open`);
  }
  expect(failures).toEqual([]);
});

test("the proof viewer works by keyboard", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "Keyboard walkthrough runs at desktop width");
  await signInCustomer(page, TEST_PEOPLE.customerChidi, "/account");
  await page.goto(`/orders/${ORDER_A}/proofs/${PROOF_A}`);
  const stage = page.getByRole("group", { name: /view\. Use the zoom buttons/ });
  await expect(page.getByRole("img", { name: /proof V2/ })).toBeVisible();
  const zoom = page.locator("[aria-live='polite']", { hasText: /Fit|%/ });
  await stage.focus();
  await page.keyboard.press("+");
  await expect(zoom).toHaveText("150%");
  await page.keyboard.press("-");
  await expect(zoom).toHaveText("Fit");

  const pinTool = page.getByRole("button", { name: "Add pin" });
  await pinTool.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Cancel pin" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("group", { name: /Placing a pin/ }).focus();
  for (let i = 0; i < 3; i += 1) await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(page.locator("#pin-text")).toBeFocused();
  // Saving an empty pin explains itself beside the pin's field.
  await page.getByRole("button", { name: "Save pin" }).click();
  await expect(page.locator("#pin-text")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#pin-error")).toHaveText("Say what this pin is about.");
  await page.getByRole("button", { name: "Cancel pin" }).click();

  const comments = page.getByRole("tab", { name: /^Comments/ });
  await comments.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Details" })).toBeFocused();
  await expect(page.getByRole("tab", { name: "Details" })).toHaveAttribute("aria-selected", "true");

  await page.getByRole("button", { name: "Approve for production" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#proof-ack")).toBeFocused();
  await expect(page.locator("#proof-ack")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Tick the box to confirm you've reviewed the proof.")).toBeVisible();
  await expectNoAxeViolations(page);
});

test("the phone menu holds focus and gives it back", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-375", "Phone menu only");
  await page.goto("/");
  const open = page.getByRole("button", { name: "Open menu" });
  await open.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("dialog", { name: "Menu" });
  await expect(menu).toBeVisible();
  for (let i = 0; i < 25; i += 1) {
    await page.keyboard.press("Tab");
    // Focus stays in the menu; at the end of its order it leaves to the browser (the body), never to the page behind.
    expect(await page.evaluate(() => document.activeElement === document.body || !!document.activeElement?.closest("dialog"))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(open).toBeFocused();
});

test("ambient motion can be paused", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "Desktop only");
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "on");
  const pause = page.getByRole("button", { name: "Pause motion" });
  await pause.focus();
  await page.keyboard.press("Space");
  await expect(pause).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("html")).not.toHaveAttribute("data-motion", /.*/);
  expect(await page.locator("[class*='marqueeTrack']").first().evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
});
