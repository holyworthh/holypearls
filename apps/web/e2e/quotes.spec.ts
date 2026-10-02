import { TEST_PEOPLE } from "@holypearls/auth";
import { expect, type Page, test } from "@playwright/test";
import { ADMIN, expectNoAxeViolations, expectNoHorizontalScroll, signInStaff } from "./helpers";

/*
 * T05-03 in a real browser at 375 and 1440: Request Project Quote and the
 * confirmation (Pen 124), the staff queue (Pen 124B), and building and
 * sending a quote version (Pen 111). Stage 3.1D D15 and D16.
 */

/** A small Event project, submitted as a guest. Returns its reference. */
async function submitProject(page: Page) {
  await page.goto("/start");
  await page.getByRole("button", { name: "Start a project: Event branding" }).click();
  await expect(page).toHaveURL(/\/project$/);
  await page.getByRole("textbox", { name: "Project name" }).fill("Quote e2e summit (TEST DATA)");
  await expect(page.getByRole("status").filter({ hasText: "Saved just now" })).toBeVisible();
  await page.getByRole("navigation", { name: "Project steps" }).getByRole("link", { name: /2 Scale/ }).click();
  await page.getByRole("textbox", { name: "How many guests?" }).fill("120");
  await page.getByRole("textbox", { name: "How many staff or crew?" }).fill("12");
  await expect(page.getByRole("status").filter({ hasText: "Saved just now" })).toBeVisible();
  await page.getByRole("navigation", { name: "Project steps" }).getByRole("link", { name: /6 Review/ }).click();
  await expect(page).toHaveURL(/\/review$/);
  await expect(page.getByRole("heading", { name: "Check your project before we quote", level: 1 })).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  // D15: one thing to fix.
  await page.getByRole("button", { name: "Request Project Quote" }).click();
  await expect(page.getByText("Add an email so we can send your quote.").first()).toBeVisible();
  await page.getByRole("textbox", { name: "Email for your quote" }).fill("quote.e2e@example.com");
  await page.getByRole("button", { name: "Request Project Quote" }).click();

  // D16: submitted.
  await expect(page.getByRole("heading", { name: "We've got your project", level: 1 })).toBeVisible();
  const reference = (await page.getByText(/^PROJECT HP-P-\d{4}-\d{4,}$/).textContent())!.replace("PROJECT ", "");
  await expect(page.getByText("PENDING REVIEW")).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);
  return reference;
}

test("a guest requests a project quote and sees the confirmation", async ({ page }) => {
  test.setTimeout(180_000);
  const reference = await submitProject(page);
  // The builder can't change a sent project: its pages lead to the confirmation.
  const url = page.url();
  await page.goto(`${url}/review`);
  await expect(page).toHaveURL(url);
  expect(reference).toMatch(/^HP-P-/);
});

test("staff review the request and send a quote", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: test.info().project.use.viewport ?? null });
  const customer = await context.newPage();
  const reference = await submitProject(customer);

  await signInStaff(page, TEST_PEOPLE.adminAda);
  await page.goto(`${ADMIN}/projects`);
  await expect(page.getByRole("heading", { name: "New requests", level: 1 })).toBeVisible();
  await page.getByRole("link", { name: new RegExp(reference) }).click();
  const detail = page.getByRole("complementary", { name: "Request detail" });
  await expect(detail.getByText("Everything the customer sent")).toBeVisible();
  await expect(detail.getByText("How many guests?")).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  await detail.getByRole("button", { name: "Start review (UNDER_REVIEW)" }).click();
  await expect(detail.getByText("UNDER_REVIEW").first()).toBeVisible();
  await detail.getByRole("link", { name: "Build quote" }).click();

  await expect(page.getByRole("heading", { name: "No version yet", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Start quote (V1)" }).click();
  await expect(page.getByRole("heading", { name: "Version 1 (draft)", level: 1 })).toBeVisible();
  await page.getByRole("combobox", { name: "Add line from project item" }).selectOption({ label: "Name badges and lanyards × 120" });
  await page.getByRole("textbox", { name: "Line 1 unit price" }).fill("2400");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved.")).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  await page.getByRole("button", { name: "Send V1" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Send V1" }).click();
  await expect(page.getByText(/V1 sent\./)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Version 1", level: 1 })).toBeVisible();
  await expect(page.getByText(/can't change\. Create a new version to revise\./)).toBeVisible();

  // T05-05: the customer opens the quote (Pen 25/46) from the browser that sent the project.
  const quoteId = new URL(page.url()).pathname.split("/").pop()!;
  await customer.goto(`/quotes/${quoteId}`);
  await expect(customer.getByRole("heading", { name: "Quote e2e summit (TEST DATA)", level: 1 })).toBeVisible();
  await expect(customer.getByText("Quote V1 · ready for your decision")).toBeVisible();
  await expect(customer.getByRole("button", { name: "Accept Quote V1" })).toBeEnabled();
  await expectNoAxeViolations(customer);
  await expectNoHorizontalScroll(customer);
  await customer.getByRole("button", { name: "Request changes" }).click();
  await customer.getByRole("dialog").getByRole("textbox", { name: "What would you like changed?" }).fill("Please add 20 more badges.");
  await customer.getByRole("dialog").getByRole("button", { name: "Send" }).click();
  await expect(customer.getByText("We'll revise the quote and email you the new version.")).toBeVisible();
  await expect(customer.getByText("Quote V1 · being revised")).toBeVisible();
  await context.close();

  await page.goto(`${ADMIN}/quotes/settings`);
  await expect(page.getByRole("heading", { name: "Quote settings", level: 1 })).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);
});
