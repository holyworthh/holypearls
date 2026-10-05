import { expect, test } from "@playwright/test";
import { expectNoAxeViolations, expectNoHorizontalScroll } from "./helpers";

/* T03-03: the shared product page and the Business Cards flow (Pen 21; COM-FR-001–005, 010–014, 040–044). */

test("Business Cards: quantities are priced, autosave keeps the draft, and foil on gloss is blocked before Review", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/products/business-cards");
  await expect(page.getByRole("heading", { level: 1, name: "Business Cards" })).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  // Standard quantity buttons show the per-card price before VAT (COM-FR-043; owner, 2026-10-05).
  await expect(page.getByText(/^₦150(.00)? each$/).first()).toBeVisible();
  await page.getByLabel(/^500/).check();
  await expect(page.getByText("₦69,875").first()).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/\?draft=/);
  await expect(page.getByText("Saved")).toBeVisible({ timeout: 30_000 });

  // A custom quantity is priced too.
  await page.getByLabel(/^More/).check();
  await page.getByLabel("Or enter a quantity").fill("250");
  await expect(page.getByText("₦40,312.50").first()).toBeVisible({ timeout: 30_000 });

  // Choosing gloss paper disables foil, with the reason, before Review (COM-FR-042).
  await page.getByLabel(/gloss/i).check();
  await expect(page.getByLabel(/Foil/)).toBeDisabled();
  await expect(page.getByText("Foil doesn't hold on gloss paper.", { exact: false })).toBeVisible();
  await expectNoAxeViolations(page);

  // Review lists each choice with an Edit link (COM-FR-014).
  await expect(page.getByRole("link", { name: "Edit quantity" })).toBeVisible();
  await expect(page.getByText("Saved")).toBeVisible({ timeout: 30_000 });

  // The draft comes back after a reload.
  await page.reload();
  await expect(page.getByLabel(/gloss/i)).toBeChecked();
});

test("changing an earlier choice warns before removing a later answer", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/products/business-cards");
  await page.getByLabel(/^100/).check();
  await page.getByLabel(/^Foil/).check();
  await expect(page.getByText("Saved")).toBeVisible({ timeout: 30_000 });
  await page.getByLabel(/gloss/i).check();
  const dialog = page.getByRole("dialog", { name: "This change affects later answers" });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByText("Foil doesn't hold on gloss paper", { exact: false })).toBeVisible();
  await expectNoAxeViolations(page);
  await dialog.getByRole("button", { name: "Keep my earlier choice" }).click();
  await expect(page.getByLabel(/matte/i)).toBeChecked();
});

test("consultative products offer a project instead of a configurator", async ({ page }) => {
  await page.goto("/products/team-staff-branding");
  await expect(page.getByRole("link", { name: "Start a project" }).first()).toBeVisible();
  await expect(page.getByLabel("Or enter a quantity")).toHaveCount(0);
  await expectNoAxeViolations(page);
});
