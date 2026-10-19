import { TEST_PEOPLE } from "@holypearls/auth";
import { expect, test, type Page } from "@playwright/test";
import { ADMIN, expectNoAxeViolations, expectNoHorizontalScroll, signInStaff } from "./helpers";

/*
 * T13-01c in a real browser (Pen 119) at 375 and 1440: installation and
 * freight rules in the admin, and an installation priced in the configurator.
 * The area is removed afterwards (a state belongs to one area).
 */

const adminCall = (page: Page, method: string, path: string, body?: unknown) =>
  page.evaluate(
    async ([verb, url, payload]) => (await fetch(`/api${url}`, { method: verb, headers: { "content-type": "application/json" }, body: payload === undefined ? undefined : JSON.stringify(payload) })).json(),
    [method, path, body] as const,
  );

test("installation and freight rules; an installation in an area is priced in the configurator", async ({ page, browser }, info) => {
  test.setTimeout(150_000);
  await signInStaff(page, TEST_PEOPLE.adminAda);
  await page.goto(`${ADMIN}/delivery`);
  await expect(page.getByRole("heading", { name: "Installation and freight rules" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "International freight (OPS-FR-101)" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Site survey for graphics larger than (m²)" })).toBeChecked();
  await expectNoAxeViolations(page);
  await expectNoHorizontalScroll(page);

  // Lagos installs roll-up banners at ₦15,000 a piece.
  const setup = (await adminCall(page, "GET", "/v1/admin/installation")) as { installable: { id: string; name: string }[] };
  const banner = setup.installable.find((product) => product.name === "Roll-Up Banner")!;
  const name = `E2E Lagos ${info.project.name.includes("375") ? "m" : "d"}`;
  const saved = (await adminCall(page, "POST", "/v1/admin/installation/areas", { name, states: ["Lagos"], productIds: [banner.id], pricing: "FIXED", rateMinor: "1500000", travelMinor: null, version: 0 })) as { areas: { id: string; name: string }[] };
  const areaId = saved.areas.find((area) => area.name === name)!.id;
  try {
    await page.reload();
    await expect(page.getByRole("button", { name })).toBeVisible();

    const customer = await browser.newContext({ viewport: page.viewportSize() ?? undefined, baseURL: info.project.use.baseURL });
    const shopper = await customer.newPage();
    await shopper.goto("/products/roll-up-banner");
    const draft = await shopper.evaluate(async () => {
      const post = await fetch("/api/v1/configurations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productSlug: "roll-up-banner", choices: { size: "85-200-cm" }, quantity: 2 }) });
      const created = (await post.json()) as { id: string; version: number };
      await fetch(`/api/v1/configurations/${created.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version: created.version, details: { service: "INSTALLATION", installState: "Lagos", installSite: "Eko Hotel", installDate: "2030-03-15" } }),
      });
      return created.id;
    });
    await shopper.goto(`/products/roll-up-banner?draft=${draft}`);
    await expect(shopper.getByText(`Installation in ${name}: ₦15,000 a piece.`)).toBeVisible();
    await expectNoAxeViolations(shopper);
    await customer.close();
  } finally {
    await adminCall(page, "DELETE", `/v1/admin/installation/areas/${areaId}`);
  }
});
