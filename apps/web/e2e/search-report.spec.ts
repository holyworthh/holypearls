import { TEST_PEOPLE } from "@holypearls/auth";
import { expect, test } from "@playwright/test";
import { ADMIN, expectNoAxeViolations, expectNoHorizontalScroll, signInStaff } from "./helpers";

/* T14-01b: a search that finds nothing and a Start a Project click show up in the admin search report (PRD-01 §11). */

test("the search report lists a zero-result query and entries, and a query can become a phrase", async ({ page }) => {
  // Letters only: a long run of digits looks like a phone number and is removed from stored searches.
  const query = `zzqv-report-${String(Date.now()).replace(/\d/g, (digit) => "abcdefghij"[Number(digit)])}`;
  await page.goto(`/search?q=${query}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.goto("/");
  const sent = page.waitForRequest((request) => request.url().includes("/api/v1/analytics/events"));
  await page.locator("main").getByRole("link", { name: "Start a Project" }).first().click();
  await sent;
  await page.goBack();
  await expect(page).toHaveURL("/");

  await signInStaff(page, TEST_PEOPLE.adminAda);
  await page.goto(`${ADMIN}/content/search-report`);
  await expect(page.getByRole("heading", { level: 1, name: "Search report" })).toBeVisible();
  const nothing = page.getByRole("region", { name: "Searches that found nothing" });
  await expect(nothing.getByRole("cell", { name: query, exact: true })).toBeVisible();
  const entries = page.getByRole("region", { name: "Where people went" });
  const total = await entries.getByRole("row", { name: /Start a Project/ }).getByRole("cell").nth(1).innerText();
  expect(Number(total)).toBeGreaterThanOrEqual(1);
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  await nothing.getByRole("link", { name: `Add a phrase for “${query}”` }).click();
  await expect(page).toHaveURL(`${ADMIN}/content/search-phrases?phrase=${encodeURIComponent(query)}`);
  await expect(page.getByLabel("Phrase", { exact: true })).toHaveValue(query);
});
