import { TEST_PEOPLE } from "@holypearls/auth";
import { expect, test } from "@playwright/test";
import { expectNoAxeViolations, expectNoHorizontalScroll, signInStaff, ADMIN } from "./helpers";

/* T04-01: cart (Pen 41/42), checkout (Pen 43/44/45 A) and delivery zones (Pen 108); COM-FR-080–084, OPS-FR-100–101. */

test("Business Cards go in the bag, check out as a guest, and the server's total includes delivery and VAT", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "Desktop layout; the phone flow is the next test");
  test.setTimeout(240_000);
  await page.goto("/products/business-cards");
  await page.getByLabel(/^500/).check();
  await expect(page.getByText("₦69,875").first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Add to cart", exact: true }).click();

  // Cart: the ready group and "Pay today" (Pen 41).
  await expect(page).toHaveURL(/\/cart$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Ready to check out" })).toBeVisible();
  await expect(page.getByText("PRICE READY")).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Pay today" }).getByText("₦69,875")).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  await page.getByRole("button", { name: "Check out ready items" }).click();
  await expect(page).toHaveURL(/\/checkout\//, { timeout: 30_000 });
  await expect(page.getByText("You're checking out as a guest. No account needed.")).toBeVisible();
  await expectNoAxeViolations(page);

  // An empty step shows the error summary and keeps focus there (Pen 45 A).
  await page.getByRole("button", { name: "Continue to delivery address" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Fix 3 things to continue" })).toBeFocused();
  await page.getByLabel("Full name").fill("Adaeze Okafor");
  await page.getByLabel("Email").fill("adaeze@example.com");
  await page.getByLabel("Phone").fill("0800 000 0000");
  await page.getByRole("button", { name: "Continue to delivery address" }).click();

  // A short Nigerian number is refused with the Pen message; answers are kept.
  await expect(page.getByLabel("Street address")).toBeVisible({ timeout: 30_000 });
  await page.getByLabel("Phone").fill("+234 800 000");
  await page.getByLabel("Street address").fill("12 Admiralty Way");
  await page.getByLabel("State").selectOption("Lagos");
  await page.getByLabel("Area / LGA").selectOption("Eti-Osa");
  await page.getByRole("button", { name: "Continue to shipping" }).click();
  await expect(page.getByText("Enter all 11 digits, e.g. 0800 000 0000")).toBeVisible();
  await expect(page.getByLabel("Street address")).toHaveValue("12 Admiralty Way");
  await page.getByLabel("Phone").fill("0800 000 0000");
  await page.getByRole("button", { name: "Continue to shipping" }).click();

  // Delivery comes from the zone for the address (Lagos Island, ₦6,500), shown apart from production time.
  await expect(page.getByText("Standard delivery · Lagos Island")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("1–2 working days in transit, after production")).toBeVisible();
  await page.getByRole("button", { name: "Continue to billing" }).click();
  await page.getByRole("button", { name: "Continue to review" }).click();

  // ₦65,000 + ₦6,500 delivery + VAT 7.5% on both (₦5,362.50) = ₦76,862.50.
  const summary = page.getByRole("complementary", { name: "Order summary" });
  await expect(summary.getByText("₦76,862.50")).toBeVisible({ timeout: 30_000 });
  await expect(summary.getByText("₦5,362.50")).toBeVisible();
  // Online payments start switched off (T04-03): Pay waits until staff turn them on.
  await expect(page.getByRole("button", { name: "Pay ₦76,862.50" })).toBeDisabled();
  await expectNoAxeViolations(page);
});

test("the phone checkout keeps the total visible and the summary one tap away (Pen 44)", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-375", "Phone layout");
  test.setTimeout(180_000);
  await page.goto("/products/business-cards");
  await page.getByLabel(/^100/).check();
  await expect(page.getByText("Saved")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Add to cart", exact: true }).click();
  await expect(page).toHaveURL(/\/cart$/, { timeout: 30_000 });
  await expectNoHorizontalScroll(page);
  await page.getByRole("button", { name: "Check out", exact: true }).click();
  await expect(page).toHaveURL(/\/checkout\//, { timeout: 30_000 });
  await expect(page.getByText("Step 1 of 5 · Contact")).toBeVisible();
  const toggle = page.getByRole("button", { name: "Show order summary" });
  await toggle.click();
  await expect(page.getByRole("complementary", { name: "Order summary" })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectNoAxeViolations(page);
});

test("an empty cart points somewhere useful (Pen 42 B)", async ({ page }) => {
  await page.goto("/cart");
  await expect(page.getByRole("heading", { name: "Your cart is empty" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Browse products" })).toBeVisible();
  await expectNoAxeViolations(page);
});

test("staff see the delivery zones and can't save an overlapping zone (Pen 108)", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "Admin is a desktop tool");
  test.setTimeout(180_000);
  await signInStaff(page, TEST_PEOPLE.adminAda);
  await page.goto(`${ADMIN}/delivery`);
  // The zones table (installation and freight tables follow it, T13-01c).
  const table = page.getByRole("table", { name: /^Delivery zones/ });
  await expect(table.getByRole("rowheader", { name: "Lagos Island" })).toBeVisible();
  await expect(table.getByText("Quote required")).toBeVisible();
  await expect(table.getByText("Freight by quote")).toBeVisible();
  await expectNoAxeViolations(page);

  await page.getByRole("button", { name: "New zone" }).click();
  await page.getByLabel("Zone name").fill("Lekki Corridor");
  await page.getByLabel("State").selectOption("Lagos");
  await page.getByLabel("LGA").selectOption("Eti-Osa");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByLabel("Rate (NGN, before VAT)").fill("7000");
  await page.getByRole("button", { name: "Save zone" }).click();
  await expect(page.getByText("Eti-Osa is already in Lagos Island. Remove it from one zone.").first()).toBeVisible({ timeout: 30_000 });
});
