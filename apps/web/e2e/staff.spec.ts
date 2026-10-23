import { TEST_PEOPLE } from "@holypearls/auth";
import { expect, test } from "@playwright/test";
import { ADMIN, expectNoAxeViolations, expectNoHorizontalScroll, signInStaff } from "./helpers";

/*
 * T13-05b in a real browser (Pen 122) at 375 and 1440: the staff list, an
 * invitation, the last-two STAFF_ADMIN block on a member, and 403 for others.
 */

test("staff: invite, the last-two STAFF_ADMIN block, and 403 for others", async ({ page }, info) => {
  test.setTimeout(150_000);
  await signInStaff(page, TEST_PEOPLE.adminAda);
  await page.goto(`${ADMIN}/staff`);
  await expect(page.getByRole("heading", { name: "Staff", level: 1 })).toBeVisible();
  const table = page.getByRole("table", { name: "Staff and invitations" });
  await expect(table.getByRole("link", { name: "Tunde Bello (TEST DATA)" })).toBeVisible();

  await page.getByRole("button", { name: "Invite staff" }).click();
  const email = `invite.${info.project.name}.${Date.now()}@holypearls.test`;
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Name").fill("Invited (TEST DATA)");
  await page.getByRole("checkbox", { name: "PRODUCTION_MANAGE" }).check();
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText("Invitation sent")).toBeVisible();
  await expect(table.getByText(email)).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);
  await page.getByRole("button", { name: `Cancel invitation for ${email}` }).click();
  await expect(page.getByText("Invitation cancelled")).toBeVisible();

  // Tunde and Ada are the only STAFF_ADMIN: removing it from Tunde is refused.
  await table.getByRole("link", { name: "Tunde Bello (TEST DATA)" }).click();
  await expect(page.getByRole("heading", { name: "Tunde Bello (TEST DATA)", level: 1 })).toBeVisible();
  await page.getByRole("checkbox", { name: "STAFF_ADMIN" }).uncheck();
  await page.getByRole("button", { name: "Save permissions" }).click();
  await expect(page.getByText("Can't remove STAFF_ADMIN")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "STAFF_ADMIN" })).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  await page.context().clearCookies();
  await signInStaff(page, TEST_PEOPLE.financeFolake);
  await page.goto(`${ADMIN}/staff`);
  await expect(page.getByRole("heading", { name: "You don't have access to this" })).toBeVisible();
});
