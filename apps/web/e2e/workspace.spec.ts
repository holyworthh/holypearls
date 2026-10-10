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

const PNG_1X1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

test("brand assets: an Admin uploads a logo; it waits for HolyPearls' check; staff see it", async ({ page }) => {
  await signIn(page, TEST_PEOPLE.acmeAdmin, "/workspace");
  await page.goto(`${page.url().split("?")[0]}/assets`);
  await expect(page.getByRole("heading", { name: "Brand assets", exact: true })).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  const name = `E2E Logo ${Date.now()}`;
  await page.getByRole("button", { name: "Upload asset" }).click();
  const dialog = page.getByRole("dialog", { name: "Upload a brand asset" });
  await dialog.getByRole("button", { name: "Add asset" }).click();
  await expect(dialog.getByText("Name the asset, for example Primary Logo")).toBeVisible();
  await dialog.getByLabel("Name").fill(name);
  await dialog.locator('input[type="file"]').setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG_1X1 });
  await expect(dialog.getByText("logo.png")).toBeVisible();
  await dialog.getByRole("button", { name: "Add asset" }).click();

  // The file is still being checked (no worker in browser tests), and V1 waits.
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByText("PROCESSING").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Replace version" })).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  // A Viewer sees the library but can't upload.
  await page.context().clearCookies();
  await signIn(page, TEST_PEOPLE.acmeViewer, "/workspace");
  await page.goto(`${page.url().split("?")[0]}/assets`);
  await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload asset" })).toHaveCount(0);

  // Staff find it among files still being checked.
  await signInStaff(page, TEST_PEOPLE.adminAda);
  await page.goto(`${ADMIN}/brand-assets?status=PROCESSING`);
  await page.getByRole("link", { name: `${name} V1` }).click();
  await expect(page.getByRole("heading", { name: `${name} V1` })).toBeVisible();
  await expect(page.getByText("The file is still being checked.")).toBeVisible();
  await expectNoAxeViolations(page);
});

test("templates: the Owner makes a template; HolyPearls approves it; a Lekki manager orders from it; a Viewer only sees it", async ({ page }) => {
  await signIn(page, TEST_PEOPLE.acmeOwner, "/workspace");
  const workspace = page.url().split("?")[0]!.replace(/\/$/, "");
  // A saved business-cards design to start from (the configurator is covered elsewhere).
  const saved = await page.evaluate(async () => {
    const response = await fetch("/api/v1/configurations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productSlug: "business-cards", choices: { paper: "350gsm-matte", sides: "both-sides" } }) });
    return response.status;
  });
  expect(saved).toBe(201);
  await page.goto(`${workspace}/templates`);
  await expect(page.getByRole("heading", { name: "Templates", exact: true })).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  const name = `E2E Cards ${Date.now()}`;
  await page.getByRole("button", { name: "New template" }).click();
  const dialog = page.getByRole("dialog", { name: "New template" });
  await dialog.getByRole("button", { name: "Create draft" }).click();
  await expect(dialog.getByText("Name the template, for example ACME Staff Polo")).toBeVisible();
  await dialog.getByLabel("Template name").fill(name);
  await dialog.getByRole("button", { name: "Create draft" }).click();

  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByText("DRAFT", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Approved brand specification" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "You choose per order" })).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  await page.getByRole("button", { name: "Edit controls" }).click();
  await expect(page.getByRole("dialog", { name: `Edit ${name}` })).toBeVisible();
  await page.getByRole("dialog", { name: `Edit ${name}` }).getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: "Send for HolyPearls' check" }).click();
  await expect(page.getByText("Sent for HolyPearls' check.")).toBeVisible();
  const detail = page.url();

  // Staff check and approve it.
  await signInStaff(page, TEST_PEOPLE.adminAda);
  await page.goto(`${ADMIN}/templates`);
  await page.getByRole("link", { name }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Production approval (OPS-FR-082)" })).toBeVisible();
  await expectNoAxeViolations(page);
  await page.getByRole("button", { name: "Approve template" }).click();
  await expect(page.getByText("Approved. The organization's allowed locations can order from it now.")).toBeVisible();

  // A Lekki manager orders from it (T11-01c, Pen 131): today's price, then checkout placed for Lekki.
  await page.context().clearCookies();
  await signIn(page, TEST_PEOPLE.acmeLekkiManager, "/workspace");
  await page.goto(detail);
  await page.getByRole("link", { name: "Order from template" }).click();
  await expect(page.getByRole("heading", { name: `Order ${name}` })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Set by your company (locked)" })).toBeVisible();
  await page.getByLabel("Quantity").fill("500");
  await expect(page.getByText("PRICE READY")).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);
  await page.getByRole("button", { name: "Go to checkout" }).click();
  await page.waitForURL(/\/checkout\//);
  await expect(page.getByLabel("Who's this order for?").locator("option:checked")).toHaveText(/Lekki/);

  // A Viewer sees the approved template but can't change it.
  await page.context().clearCookies();
  await signIn(page, TEST_PEOPLE.acmeViewer, "/workspace");
  await page.goto(`${page.url().split("?")[0]!.replace(/\/$/, "")}/templates`);
  await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible();
  await expect(page.getByRole("button", { name: "New template" })).toHaveCount(0);
  await page.goto(detail);
  await expect(page.getByText("APPROVED", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit controls" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Order from template" })).toHaveCount(0);
});

test("approvals: the Owner turns on approval; a Lekki manager's template order waits; the Approver approves it", async ({ page }) => {
  // The Owner sets the rule (T11-04, B2B-FR-040).
  await signIn(page, TEST_PEOPLE.acmeOwner, "/workspace");
  const workspace = page.url().split("?")[0]!.replace(/\/$/, "");
  const organizationId = workspace.split("/").pop()!;
  await page.goto(`${workspace}/approval-rule`);
  await expect(page.getByRole("heading", { name: "Approval rule", level: 1 })).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);
  await page.getByText("Approve every request").click();
  await page.getByRole("button", { name: "Save rule" }).click();
  await expect(page.getByText("Saved. New requests follow this rule.")).toBeVisible();

  // An approved template to order from (made and sent here; staff approve below).
  const name = `E2E Approval Cards ${Date.now()}`;
  const templateId = await page.evaluate(
    async ({ organizationId: org, name: templateName }) => {
      const post = (path: string, body: unknown) =>
        fetch(`/api${path}`, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": `web_${crypto.randomUUID().replaceAll("-", "")}` }, body: JSON.stringify(body) }).then((response) => response.json());
      const design = await post("/v1/configurations", { productSlug: "business-cards", choices: { paper: "350gsm-matte", sides: "both-sides" }, quantity: 500 });
      const template = await post(`/v1/organizations/${org}/templates`, { name: templateName, configurationId: design.id, assetVersionIds: [], allLocations: true });
      await post(`/v1/organizations/${org}/templates/${template.id}/submit`, { version: template.version });
      return template.id as string;
    },
    { organizationId, name },
  );
  await signInStaff(page, TEST_PEOPLE.adminAda);
  await page.goto(`${ADMIN}/templates/${templateId}`);
  await page.getByRole("button", { name: "Approve template" }).click();
  await expect(page.getByText("Approved. The organization's allowed locations can order from it now.")).toBeVisible();

  // The Lekki manager orders: it becomes an order request.
  await page.context().clearCookies();
  await signIn(page, TEST_PEOPLE.acmeLekkiManager, "/workspace");
  await page.goto(`${workspace}/templates/${templateId}/order`);
  await page.getByLabel("Quantity").fill("500");
  await expect(page.getByText("Approval needed")).toBeVisible();
  await page.getByRole("button", { name: "Send for approval" }).click();
  await page.waitForURL(/\/approvals\//);
  await expect(page.getByText("AWAITING APPROVAL")).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel request" })).toBeVisible();
  const requestUrl = page.url();

  // The Approver reviews and approves (Pen 72): it goes to HolyPearls for a quote.
  await page.context().clearCookies();
  await signIn(page, TEST_PEOPLE.acmeApprover, "/workspace");
  await page.goto(`${workspace}/approvals`);
  await expect(page.getByRole("heading", { name: "Awaiting your approval" })).toBeVisible();
  await page.goto(requestUrl);
  await expect(page.getByText("AWAITING YOUR APPROVAL")).toBeVisible();
  await expect(page.getByRole("heading", { name: "What's being ordered" })).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);
  await page.getByRole("button", { name: /^Approve/ }).click();
  await expect(page.getByText(/Approved and sent to HolyPearls for a quote \(HP-Q-/)).toBeVisible();
  const quoteReference = (await page.getByText(/HP-Q-\d{4}-\d+/).first().textContent())!.match(/HP-Q-\d{4}-\d+/)![0];

  // T11-04b: HolyPearls quotes ₦200,000 plus VAT, above the approved estimate (Pen 48, 73B).
  await signInStaff(page, TEST_PEOPLE.adminAda);
  const quoteId = await page.evaluate(async (reference) => {
    const headers = { "content-type": "application/json", "idempotency-key": `web_${crypto.randomUUID().replaceAll("-", "")}` };
    const list = await fetch("/api/v1/admin/quotes").then((response) => response.json());
    const id = list.items.find((item: { reference: string }) => item.reference === reference).id as string;
    const quote = await fetch(`/api/v1/admin/quotes/${id}/versions`, { method: "POST", headers }).then((response) => response.json());
    const draft = quote.versions.find((version: { status: string }) => version.status === "DRAFT");
    const candidate = quote.candidates[0];
    const saved = await fetch(`/api/v1/admin/quotes/${id}/versions/${draft.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        version: draft.version,
        currency: "NGN",
        lines: [{ source: candidate.source, sourceKey: candidate.sourceKey, title: candidate.title, summary: candidate.summary, quantity: 1, unitMinor: "20000000" }],
        fees: { designMinor: "0", deliveryMinor: "0", deliveryNote: "", installationMinor: "0", installationNote: "", otherMinor: "0", otherLabel: "" },
        validDays: 14,
        terms: "Terms",
        assumptions: "",
        productionSequence: "",
        schedule: [{ label: "Payment", kind: "PERCENT", value: "10000", trigger: "ON_ACCEPTANCE" }],
      }),
    }).then((response) => response.json());
    await fetch(`/api/v1/admin/quotes/${id}/versions/${draft.id}/send`, { method: "POST", headers: { ...headers, "idempotency-key": `web_${crypto.randomUUID().replaceAll("-", "")}` }, body: JSON.stringify({ version: saved.version }) });
    return id;
  }, quoteReference);

  // The requester sees the block and sends it for re-approval.
  await page.context().clearCookies();
  await signIn(page, TEST_PEOPLE.acmeLekkiManager, "/workspace");
  await page.goto(`/quotes/${quoteId}`);
  await expect(page.getByRole("heading", { name: "New approval needed before you can accept" })).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);
  await page.getByRole("button", { name: "Send for reapproval" }).click();
  await expect(page.getByText(/Sent for re-approval\. Accept unlocks once/)).toBeVisible();

  // The Approver approves the new total.
  await page.context().clearCookies();
  await signIn(page, TEST_PEOPLE.acmeApprover, "/workspace");
  await page.goto(requestUrl);
  await expect(page.getByText("REAPPROVAL REQUIRED")).toBeVisible();
  await expect(page.getByRole("heading", { name: "HolyPearls' quote came back higher" })).toBeVisible();
  await expectNoAxeViolations(page);
  await page.getByRole("button", { name: /^Approve/ }).click();
  await expect(page.getByText("Approved the new total. The quote can be accepted now.")).toBeVisible();

  // Leave the rule as the seed has it.
  await page.context().clearCookies();
  await signIn(page, TEST_PEOPLE.acmeOwner, "/workspace");
  await page.goto(`${workspace}/approval-rule`);
  await page.getByText("No approval", { exact: true }).click();
  await page.getByRole("button", { name: "Save rule" }).click();
  await expect(page.getByText("Saved. New requests follow this rule.")).toBeVisible();
});

test("groups: a Lekki manager starts a collection from a saved polo, opens it, a participant answers by link, then it's paused", async ({ page, browser }) => {
  await signIn(page, TEST_PEOPLE.acmeLekkiManager, "/workspace");
  const design = await page.evaluate(async () => {
    const response = await fetch("/api/v1/configurations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productSlug: "polo-shirt", choices: { colour: "navy", fabric: "pique-cotton" } }) });
    return ((await response.json()) as { id: string }).id;
  });
  // The configurator's "Start a Group Collection" link (T03-05) lands on step 1 with the design chosen.
  await page.goto(`/group-collections/start?configuration=${design}`);
  await expect(page.getByRole("heading", { name: "New group collection", level: 1 })).toBeVisible();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);
  const name = `Lekki staff polos ${Date.now()}`;
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 2 (Pen 132): fields, deadline and modes, then open.
  await expect(page.getByRole("heading", { name: `Set up “${name}”` })).toBeVisible();
  await expect(page.getByText("Participants can't see it yet")).toBeVisible();
  await page.getByLabel("Name personalisation").check();
  await page.locator("#collection-deadline").fill("2030-10-31T18:00");
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);
  await page.getByRole("button", { name: "Open collection" }).click();
  await expect(page.getByText("Open. Share the link with everyone taking part.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Share link" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy link" })).toBeVisible();

  // A participant opens the link on their own phone (T12-01b; Pen 31): no account, one decision per screen, nothing to pay.
  const collectionId = page.url().split("/groups/")[1]!.split("?")[0]!;
  const workspaceId = page.url().split("/workspace/")[1]!.split("/")[0]!;
  const shareUrl = await page.evaluate(async ([org, id]) => ((await fetch(`/api/v1/organizations/${org}/collections/${id}`).then((response) => response.json())) as { shareUrl: string }).shareUrl, [workspaceId, collectionId] as const);
  const phone = await browser.newPage({ viewport: page.viewportSize() ?? undefined, baseURL: new URL(page.url()).origin });
  await phone.goto(`/g#${shareUrl.split("#")[1]}`);
  await expect(phone.getByRole("heading", { name })).toBeVisible();
  await expect(phone.getByText("Only you and your organiser see your answers")).toBeVisible();
  await expectNoAxeViolations(phone);
  await expectNoHorizontalScroll(phone);
  await phone.getByLabel("Your name").fill("Adaeze Eze");
  await phone.getByLabel("Your email").fill(`adaeze.${Date.now()}@example.com`);
  await phone.getByRole("button", { name: "Start" }).click();
  await phone.waitForURL(/\/collections\/submissions\//);
  await expect(phone.getByText("Step 1 of 3")).toBeVisible();
  await phone.getByRole("radio", { name: "M", exact: true }).click();
  await expectNoAxeViolations(phone);
  await phone.getByRole("button", { name: "Continue" }).click();
  await expect(phone.getByText("Step 2 of 3")).toBeVisible();
  await phone.getByLabel(/Name for embroidery/).fill("ADAEZE");
  await phone.getByRole("button", { name: "Continue" }).click();
  await expect(phone.getByRole("heading", { name: "Check and send." })).toBeVisible();
  await expect(phone.getByText("there's nothing to pay")).toBeVisible();
  await phone.getByRole("button", { name: "Send my response" }).click();
  await expect(phone.getByRole("heading", { name: "You're in, Adaeze" })).toBeVisible();
  await expectNoAxeViolations(phone);
  await phone.close();

  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByText("Paused. Participants can't submit until you open it again.")).toBeVisible();

  await page.goto(page.url().replace(/\/groups\/.*$/, "/groups"));
  await expect(page.getByRole("link", { name })).toBeVisible();
});
