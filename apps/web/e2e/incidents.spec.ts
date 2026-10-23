import { TEST_PEOPLE } from "@holypearls/auth";
import { expect, test } from "@playwright/test";
import { ADMIN, expectNoAxeViolations, expectNoHorizontalScroll, signInStaff } from "./helpers";

/*
 * T15-05 in a real browser (Pen 123): the five switches, pausing and
 * resuming uploads, the revoke-sessions form, and 403 for others. Read-only
 * mode is never switched on here; the API tests cover it.
 */

test("incident switches: pause and resume uploads, revoke form, and 403 for others", async ({ page }) => {
  test.setTimeout(150_000);
  await signInStaff(page, TEST_PEOPLE.adminAda);
  await page.goto(`${ADMIN}/incidents`);
  await expect(page.getByRole("heading", { name: "Incident switches", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2 })).toHaveCount(5);
  await expect(page.getByText("Alerts aren't shown here")).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  const card = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Pause uploads" }) });
  try {
    await card.getByRole("button").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Pause uploads for the whole site" })).toBeVisible();
    await dialog.getByRole("button", { name: "Confirm" }).click();
    await expect(card.getByText(/ON · since/)).toBeVisible();
    await expect(page.getByText("Recorded in the audit log")).toBeVisible();
    await expectNoAxeViolations(page);
    await card.getByRole("button").click();
    await page.getByRole("dialog").getByRole("button", { name: "Confirm" }).click();
    await expect(card.getByText("Off", { exact: true })).toBeVisible();
  } finally {
    // Never leave uploads paused for other tests.
    await page.request.post(`${ADMIN}/api/v1/admin/incidents/switch`, { data: { switch: "UPLOADS_PAUSED", on: false } });
  }

  await page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Revoke sessions" }) }).getByRole("button").click();
  const revoke = page.getByRole("dialog");
  await expect(revoke.getByText("Everyone (all customers and staff, including you)")).toBeVisible();
  await revoke.getByText("One person").click();
  await expect(revoke.getByLabel("Person")).toBeVisible();
  await revoke.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expectNoHorizontalScroll(page);

  await page.context().clearCookies();
  await signInStaff(page, TEST_PEOPLE.financeFolake);
  await page.goto(`${ADMIN}/incidents`);
  await expect(page.getByRole("heading", { name: "You don't have access to this" })).toBeVisible();
});
