import { TEST_PEOPLE } from "@holypearls/auth";
import { expect, type Page, test } from "@playwright/test";
import { ADMIN, expectNoAxeViolations, expectNoHorizontalScroll, signInStaff } from "./helpers";

/*
 * T05-01 in a real browser at 375 and 1440: /start (Pen 23), the six-step
 * builder and its recommendations (Pen 24), resuming on the same step, and
 * the recommendation rules admin (Pen 110). Stage 3.1D tests D1, D4, D5,
 * D13 and D14.
 */

async function answerNumber(page: Page, label: string, value: string) {
  const field = page.getByRole("textbox", { name: label });
  await field.fill(value);
  await expect(page.getByRole("status").filter({ hasText: "Saved just now" })).toBeVisible();
}

async function continueTo(page: Page, step: string) {
  await page.getByRole("button", { name: /^(Continue|Review project)$/ }).click();
  await expect(page).toHaveURL(new RegExp(`/${step}$`));
}

test("start from a goal, edit the suggestions, and come back to the same step", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/start");
  await expect(page.getByRole("heading", { name: /What are we\s*making together\?/, level: 1 })).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  await page.getByRole("button", { name: "Start a project: Event branding" }).click();
  await expect(page).toHaveURL(/\/start\/[0-9a-f-]{36}\/project$/);
  await expect(page.getByText("STEP 1 OF 6 · PROJECT")).toBeVisible();
  await page.getByRole("group", { name: "What kind of event?" }).getByText("Conference", { exact: true }).click();
  await page.getByRole("group", { name: "Is there a stage or photo area?" }).getByText("Yes", { exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved just now" })).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  await continueTo(page, "scale");
  await answerNumber(page, "How many guests?", "250");
  await answerNumber(page, "How many staff or crew?", "30");
  await continueTo(page, "date-location");
  await continueTo(page, "brand");
  await continueTo(page, "recommendations");

  const badges = page.getByRole("article", { name: "Name badges and lanyards" });
  await expect(badges.getByRole("textbox", { name: "Quantity of Name badges and lanyards" })).toHaveValue("250");
  await expect(page.getByRole("article", { name: "Main backdrop" })).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  // D4/D14: a removed suggestion stays removed after the scale changes.
  await badges.getByRole("button", { name: "Remove Name badges and lanyards" }).click();
  await expect(badges.getByRole("button", { name: "Undo Name badges and lanyards" })).toBeVisible();
  // D5: a custom item is kept.
  await page.getByRole("button", { name: "Something custom" }).click();
  await page.getByRole("textbox", { name: "What is it?" }).fill("Sponsor welcome kit");
  await page.getByRole("textbox", { name: "About how many?" }).fill("About 20");
  await page.getByRole("button", { name: "Add to project" }).click();
  await expect(page.getByRole("button", { name: "Remove Sponsor welcome kit" })).toBeVisible();

  await page.getByRole("link", { name: "Edit brief" }).click();
  await expect(page).toHaveURL(/\/scale$/);
  await answerNumber(page, "How many guests?", "400");
  await page.getByRole("navigation", { name: "Project steps" }).getByRole("link", { name: /5 Recommendations/ }).click();
  await expect(page).toHaveURL(/\/recommendations$/);
  await expect(page.getByRole("article", { name: "Name badges and lanyards" }).getByRole("button", { name: "Undo Name badges and lanyards" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove Sponsor welcome kit" })).toBeVisible();

  // D13: /start offers to continue, on the step the customer was on.
  await page.goto("/start");
  await page.getByRole("region", { name: "Your saved project" }).getByRole("link", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/recommendations$/);
});

test("project drafts are private and never indexed", async ({ page }) => {
  const response = await page.goto("/start/0190c5b3-0000-7000-8000-000000000001/project");
  expect(response?.status()).toBe(404);
  await page.goto("/start");
  await page.getByRole("button", { name: "Start a project: Staff uniforms" }).click();
  await expect(page).toHaveURL(/\/project$/);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("staff edit recommendation rules (Pen 110)", async ({ page }) => {
  test.setTimeout(150_000);
  await signInStaff(page, TEST_PEOPLE.adminAda);
  await page.goto(`${ADMIN}/projects/rules?type=EVENT`);
  await expect(page.getByRole("heading", { name: "Event branding", level: 1 })).toBeVisible();
  await expect(page.getByRole("table").getByText("Crew polo shirts")).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);
  await page.getByRole("button", { name: "Run preview" }).click();
  await expect(page.getByRole("complementary", { name: "Edit rule and preview" }).getByText("Name badges and lanyards")).toBeVisible();
  await page.getByRole("button", { name: "Edit rule: Table displays" }).click();
  await expect(page.getByRole("heading", { name: "Edit rule · Table displays" })).toBeVisible();
  await expectNoAxeViolations(page);
});
