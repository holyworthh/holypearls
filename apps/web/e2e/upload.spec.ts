import { TEST_PEOPLE } from "@holypearls/auth";
import { expect, test } from "@playwright/test";
import { expectNoAxeViolations, expectNoHorizontalScroll } from "./helpers";

/*
 * T01-05: the upload component shows progress, hands the file to the server
 * for checking, explains refusals and works at 375 px. The worker that makes
 * previews isn't running in browser tests; its steps are covered by API tests.
 */

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test.beforeEach(async ({ page }) => {
  await page.goto("/sign-in");
  await page.locator("#sign-in-email").fill(TEST_PEOPLE.customerChidi.email);
  await page.locator("#sign-in-password").fill(TEST_PEOPLE.customerChidi.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/account\/security$/);
});

test("uploads a file straight to storage and hands it over for checking", async ({ page }) => {
  await page.goto("/dev/slice");
  await expect(page.getByText("Drop your logo or browse files")).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  await page.locator('input[type="file"]').setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG_1X1 });
  await expect(page.getByText("Checking file…")).toBeVisible();
  await expect(page.getByText("logo.png")).toBeVisible();
});

test("explains a file type that isn't allowed, before anything is uploaded", async ({ page }) => {
  await page.goto("/dev/slice");
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: "logo.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>") });
  await expect(page.getByText("Upload JPEG, PNG or PDF.")).toBeVisible();
  await expect(page.getByText("Browse files").first()).toBeVisible();
});
