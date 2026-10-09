import { TEST_PEOPLE } from "@holypearls/auth";
import { expect, test, type Page } from "@playwright/test";
import { ADMIN, expectNoAxeViolations, expectNoHorizontalScroll, signInStaff } from "./helpers";

/*
 * T10-01 in a real browser, at 375 and 1440 px: the Team page (Pen 70),
 * Locations (Pen 71), the invitation page, the workspace request and the
 * staff screens. The API tests cover the permission rules, email codes and
 * the accept flow; these check the screens and leave the seed as they found it.
 */

async function signIn(page: Page, person: { email: string; password: string }, next: string) {
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await page.locator("#sign-in-email").fill(person.email);
  await page.locator("#sign-in-password").fill(person.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => url.pathname.startsWith(next));
}

const desktop = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;

async function openTeam(page: Page) {
  await signIn(page, TEST_PEOPLE.acmeOwner, "/workspace");
  await page.goto(page.url().replace(/\/workspace\/([^/?]+).*$/, "/workspace/$1/team"));
  await expect(page.getByRole("heading", { name: /^Team/ })).toBeVisible();
}

test("the Owner sees the team, invites someone and cancels the invitation", async ({ page }) => {
  await openTeam(page);
  await expect(page.getByText("You're the only Owner.")).toBeVisible();
  const list = desktop(page) ? page.getByRole("table", { name: "Members and invitations" }) : page.getByRole("list", { name: "Members and invitations" });
  await expect(list.getByText("Adaeze Eze (TEST DATA)")).toBeVisible();
  await expect(list.getByText("INVITE PENDING").first()).toBeVisible();
  await expect(list.getByText("INVITE EXPIRED").first()).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  await page.getByRole("button", { name: "Invite people" }).click();
  const invite = page.getByRole("dialog", { name: "Invite people" });
  await invite.getByRole("button", { name: "Send invitation" }).click();
  await expect(invite.getByText("Enter an email like name@company.com")).toBeVisible();
  await expect(invite.getByText("Choose at least one location, or All locations")).toBeVisible();
  await expectNoAxeViolations(page);

  const email = `e2e.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@example.com`;
  await invite.getByLabel("Email").fill(email);
  await invite.getByLabel("Role").selectOption("VIEWER");
  await invite.getByLabel("Lekki").check();
  await invite.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText(`Invitation sent to ${email}.`)).toBeVisible();

  // Cancel it again, so the seed stays as it was.
  if (desktop(page)) await page.getByRole("button", { name: `Manage the invitation to ${email}` }).click();
  else await page.getByRole("button", { name: new RegExp(`^${email.replaceAll(".", "\\.")}`) }).click();
  await page.getByRole("dialog", { name: `Invitation to ${email}` }).getByRole("button", { name: "Revoke invitation" }).click();
  await expect(page.getByText(`The invitation to ${email} was cancelled.`)).toBeVisible();
});

test("raising someone's role asks for confirmation first", async ({ page }) => {
  await openTeam(page);
  if (desktop(page)) {
    await page.getByLabel("Role for Sam Etim (TEST DATA)").selectOption("APPROVER");
  } else {
    await page.getByRole("button", { name: /^Sam Etim \(TEST DATA\)/ }).click();
    await page.getByRole("dialog", { name: "Sam Etim (TEST DATA)" }).getByLabel("Role", { exact: true }).selectOption("APPROVER");
    await page.getByRole("button", { name: "Save changes" }).click();
  }
  const confirm = page.getByRole("dialog", { name: "Make Sam Etim (TEST DATA) an Approver?" });
  await expect(confirm.getByText("Approve organization requests")).toBeVisible();
  await expect(confirm.getByText("Giving someone more access needs a code we email you.")).toBeVisible();
  await expectNoAxeViolations(page);
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(confirm).toBeHidden();
});

test("locations: the Owner sees both; a Lekki manager sees only Lekki and no team", async ({ page }) => {
  await openTeam(page);
  await page.getByRole("navigation", { name: "Team & Settings" }).getByRole("link", { name: "Locations" }).click();
  await expect(page.getByRole("heading", { name: "Locations", exact: true })).toBeVisible();
  const locations = page.getByRole("list", { name: "Locations" });
  await expect(locations.getByRole("link", { name: /Lekki/ })).toBeVisible();
  await expect(locations.getByRole("link", { name: /Victoria Island/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add a location" })).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  await page.context().clearCookies();
  await signIn(page, TEST_PEOPLE.acmeLekkiManager, "/workspace");
  await page.goto(`${page.url().split("?")[0]}/locations`);
  await expect(page.getByRole("list", { name: "Locations" }).getByRole("link")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Lekki", level: 2 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add a location" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Team", exact: true })).toHaveCount(0);
  await expectNoAxeViolations(page);

  await page.goto(page.url().replace(/locations$/, "team"));
  await expect(page.getByRole("heading", { name: "Only team managers can see the team" })).toBeVisible();
});

test("an invitation link without its secret explains itself", async ({ page }) => {
  await page.goto("/invitations");
  await expect(page.getByRole("heading", { name: "This invitation link doesn't work" })).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);
});

test("a customer asks for a workspace and staff decline it with a reason", async ({ page }) => {
  await signIn(page, TEST_PEOPLE.customerChidi, "/account/workspace");
  await expect(page.getByRole("heading", { name: "Workspace for your team" })).toBeVisible();
  const send = page.getByRole("button", { name: "Send request" });
  await send.click();
  await expect(page.getByText("Enter your company's name")).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  const company = `E2E Kitchens ${Date.now()} (TEST DATA)`;
  await page.getByLabel("Company name").fill(company);
  await page.getByLabel("Location 1 name").fill("Yaba");
  await page.getByLabel("City").fill("Lagos");
  await page.getByLabel("Roughly how many people?").selectOption("11-50");
  await send.click();
  await expect(page.getByRole("heading", { name: "Your request is with our team" })).toBeVisible();

  await signInStaff(page, TEST_PEOPLE.adminAda);
  await page.goto(`${ADMIN}/organization-requests`);
  await page.getByRole("link", { name: company }).click();
  await expect(page.getByRole("heading", { name: company })).toBeVisible();
  await expectNoAxeViolations(page);
  await page.getByRole("button", { name: "Decline" }).click();
  const dialog = page.getByRole("dialog", { name: `Decline ${company}?` });
  await dialog.getByLabel("Reason (emailed to the customer)").fill("This is an end-to-end test request.");
  await dialog.getByRole("button", { name: "Decline and email" }).click();
  await expect(page.getByText("Declined. The customer has been emailed the reason.")).toBeVisible();

  // Cookies aren't separated by port, so the staff sign-in on localhost replaced Chidi's session.
  await page.context().clearCookies();
  await signIn(page, TEST_PEOPLE.customerChidi, "/account/workspace");
  await expect(page.getByText(`We couldn't set up ${company}`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Send request" })).toBeVisible();
});

test("staff see organizations read only", async ({ page }) => {
  await signInStaff(page, TEST_PEOPLE.adminAda);
  await page.goto(`${ADMIN}/organizations?q=ACME`);
  await page.getByRole("link", { name: "ACME Hospitality Group (TEST DATA)" }).click();
  await expect(page.getByRole("heading", { name: "ACME Hospitality Group (TEST DATA)" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Members/ })).toBeVisible();
  await expect(page.getByRole("main").getByRole("button")).toHaveCount(0);
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);
});

test("the overview: Needs Attention first; a switcher only for people with more than one location", async ({ page }) => {
  await signIn(page, TEST_PEOPLE.acmeOwner, "/workspace");
  await expect(page.getByRole("heading", { name: /^Good (morning|afternoon|evening), Ngozi\.$/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Needs your attention" })).toBeVisible();
  if (desktop(page)) await expect(page.getByLabel("Location")).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  // Orders, Projects and Billing from the navigation.
  const sections = page.getByRole("navigation", { name: "Workspace sections" }).filter({ visible: true });
  await sections.getByRole("link", { name: "Orders" }).click();
  await expect(page.getByRole("heading", { name: "Orders", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Order filters" }).getByRole("link", { name: /^Active/ })).toHaveAttribute("aria-current", "page");
  await expectNoAxeViolations(page);
  await sections.getByRole("link", { name: "Projects" }).click();
  await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();
  await page.goto(page.url().replace(/\/projects.*$/, "/billing"));
  await expect(page.getByRole("heading", { name: "Billing", exact: true })).toBeVisible();
  await expect(page.getByText("Balances due").first()).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  // Search with nothing found says so, in the person's locations.
  await page.goto(page.url().replace(/\/billing.*$/, "/search?q=zzzz-nothing"));
  await expect(page.getByText('No results for “zzzz-nothing” in your locations.')).toBeVisible();
  await expectNoAxeViolations(page);

  // One location: no switcher, and billing is for Owners and Admins.
  await page.context().clearCookies();
  await signIn(page, TEST_PEOPLE.acmeLekkiManager, "/workspace");
  await expect(page.getByRole("heading", { name: "Needs your attention" })).toBeVisible();
  await expect(page.getByLabel("Location")).toHaveCount(0);
  await page.goto(`${page.url().split("?")[0]}/billing`);
  await expect(page.getByRole("heading", { name: "You don't have access to this" })).toBeVisible();
});
