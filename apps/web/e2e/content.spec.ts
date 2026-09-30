import { TEST_PEOPLE } from "@holypearls/auth";
import { expect, test } from "@playwright/test";
import { expectNoAxeViolations, expectNoHorizontalScroll, signInStaff } from "./helpers";

/*
 * T02-06 browser checks, written before the pages: search (Pen 07–10),
 * projects (12, 12B), our work (54, 55), resources (56–58), About (59),
 * Contact (60), the content editor (106) and SEO foundations.
 */

const isMobile = (page: { viewportSize(): { width: number } | null }) => (page.viewportSize()?.width ?? 0) < 768;

test.describe("search", () => {
  test("results group products, projects and guides, keep the query, and are never indexed", async ({ page }) => {
    const response = await page.goto("/search?q=staff%20shirts");
    expect(response?.headers()["x-robots-tag"]).toContain("noindex");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page.getByRole("main").getByRole("combobox", { name: "Search", exact: true })).toHaveValue("staff shirts");
    await expect(page.getByRole("main").getByRole("heading", { name: "Products", level: 2 })).toBeVisible();
    await expect(page.getByRole("link", { name: /Polo Shirt/ }).first()).toBeVisible();
    const types = page.getByRole("navigation", { name: "Result types" });
    await expect(types.getByRole("link", { name: /^All/ })).toHaveAttribute("aria-current", "page");
    await types.getByRole("link", { name: /^Guides/ }).click();
    await expect(page).toHaveURL(/scope=guides/);
    await expectNoHorizontalScroll(page);
    await expectNoAxeViolations(page);
  });

  test("a misspelt search is corrected, with a way back to what was typed", async ({ page }) => {
    await page.goto("/search?q=staf%20shrits");
    await expect(page.getByText("Showing results for")).toBeVisible();
    await expect(page.getByText("You typed ‘staf shrits’.")).toBeVisible();
    await page.getByRole("link", { name: "Search for that instead" }).click();
    await expect(page).toHaveURL(/exact=1/);
  });

  test("no results keeps the query and offers the closest things and a custom request", async ({ page }) => {
    await page.goto("/search?q=embroidered%20glass%20cup");
    await expect(page.getByRole("heading", { name: /No exact (result|match) for ‘embroidered glass cup’/ })).toBeVisible();
    await expect(page.getByText("We may still be able to make or source this.")).toBeVisible();
    const request = page.getByLabel("Tell us what you need");
    await expect(request).toHaveValue(/embroidered glass cup/);
    // Pen 10 says "Send to our team"; the phone (Pen 08) says "Tell us what you need".
    await page.getByRole("button", { name: /^(Send to our team|Tell us what you need)$/ }).click();
    await expect(page).toHaveURL(/\/contact\?/);
    await expect(page.getByLabel(/What do you need\?/)).toHaveValue(/embroidered glass cup/);
  });

  test("works with JavaScript off", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/search?q=polo");
    await expect(page.getByRole("link", { name: /Polo Shirt/ }).first()).toBeVisible();
    await context.close();
  });
});

test.describe("content pages", () => {
  test("projects directory and a project page", async ({ page }) => {
    await page.goto("/projects");
    await expect(page.getByRole("heading", { level: 1, name: "What are you putting together?" })).toBeVisible();
    await page.getByRole("link", { name: /Event branding/ }).first().click();
    await expect(page).toHaveURL(/\/projects\/event-branding$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("QUOTE REQUIRED")).toBeVisible();
    const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(ld.join(" ")).toContain('"@type":"Service"');
    expect(ld.join(" ")).toContain('"@type":"BreadcrumbList"');
    await expectNoHorizontalScroll(page);
    await expectNoAxeViolations(page);
  });

  test("our work labels demo projects and never claims results", async ({ page }) => {
    await page.goto("/our-work");
    await expect(page.getByRole("heading", { level: 1, name: "Work we've made" })).toBeVisible();
    await expect(page.getByText(/DEMO PROJECT · NOT A CLIENT CLAIM/)).toBeVisible();
    await page.getByRole("link", { name: /Read the project/ }).click();
    await expect(page.getByText("VERIFIED FACTS")).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectNoAxeViolations(page);
  });

  test("resources index and a guide with its table of contents", async ({ page }) => {
    await page.goto("/resources");
    await expect(page.getByRole("heading", { level: 1, name: "Know before you order" })).toBeVisible();
    await page.getByRole("link", { name: "Read the guide" }).click();
    await expect(page).toHaveURL(/\/resources\/embroidery-or-print$/);
    const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(ld.join(" ")).toContain('"@type":"Article"');
    if (isMobile(page)) {
      // The side contents list becomes a jump menu that pushes content down (Pen 58).
      const toggle = page.getByRole("button", { name: /On this page/ });
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await page.getByRole("link", { name: "Side by side" }).click();
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
    } else {
      await expect(page.getByRole("navigation", { name: "On this page" })).toBeVisible();
    }
    await expect(page.getByRole("table", { name: "Side by side: Embroidery" })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectNoAxeViolations(page);
  });

  test("about and contact", async ({ page }) => {
    await page.goto("/about");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("We make branded things for businesses");
    await expectNoAxeViolations(page);

    await page.goto("/contact");
    await expect(page.getByRole("heading", { level: 1, name: "Contact us" })).toBeVisible();
    await page.getByRole("radio", { name: "New order" }).check();
    await page.getByLabel(/Your name/).fill("Test Visitor (TEST DATA)");
    await page.getByLabel(/^Email/).fill("visitor.e2e@holypearls.test");
    await page.getByRole("button", { name: "Send enquiry" }).click();
    await expect(page.getByText(/Tell us what you need/).first()).toBeVisible();
    await page.getByLabel(/What do you need\?/).fill("120 staff polos with our logo, needed by November");
    await page.getByRole("button", { name: "Send enquiry" }).click();
    await expect(page.getByRole("heading", { name: /We got your enquiry/ })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});

test.describe("SEO foundations", () => {
  test("private pages send noindex by default", async ({ request }) => {
    for (const path of ["/search?q=polo", "/sign-in", "/account/security", "/admin/sign-in", "/products/polo-shirt/configure", "/help/0190c5b3-0000-7000-8000-000000000001", "/cart", "/checkout"]) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect({ path, robots: response.headers()["x-robots-tag"] ?? "" }).toEqual({ path, robots: expect.stringContaining("noindex") });
    }
    const home = await request.get("/");
    expect(home.headers()["x-robots-tag"] ?? "").not.toContain("noindex");
  });

  test("robots.txt, the sitemap and the home page's structured data", async ({ page, request }) => {
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toContain("Sitemap:");
    expect(robots).toMatch(/Disallow: \/admin/);
    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).toContain("/resources/embroidery-or-print</loc>");
    expect(sitemap).not.toContain("/search");
    await page.goto("/");
    const ld = (await page.locator('script[type="application/ld+json"]').allTextContents()).join(" ");
    expect(ld).toContain('"@type":"Organization"');
    expect(ld).toContain('"@type":"WebSite"');
  });

  test("a quote-only product has no Offer; a priced one does", async ({ page }) => {
    await page.goto("/products/team-staff-branding");
    expect((await page.locator('script[type="application/ld+json"]').allTextContents()).join(" ")).not.toContain('"@type":"Offer"');
    await page.goto("/products/business-cards");
    expect((await page.locator('script[type="application/ld+json"]').allTextContents()).join(" ")).toContain('"@type":"Offer"');
  });
});

test.describe("content editor", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "The editor is a desktop tool");

  test("staff write a guide, unsafe text is removed, and publishing puts it live", async ({ page }) => {
    await signInStaff(page, TEST_PEOPLE.adminAda);
    await page.goto("/admin/content?type=GUIDE");
    await page.getByRole("button", { name: "New guide" }).click();
    const slug = `e2e-guide-${Date.now()}`;
    await page.getByLabel("Title").fill("E2E guide (TEST DATA)");
    await page.getByLabel("Address").fill(slug);
    await page.getByRole("button", { name: "Create draft" }).click();
    await expect(page).toHaveURL(/\/admin\/content\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { level: 1, name: "E2E guide (TEST DATA)" })).toBeVisible();
    await page.getByLabel("Summary").fill("A short guide written by the end-to-end tests.");
    const editor = page.getByRole("textbox", { name: "Page text" });
    await editor.click();
    await page.keyboard.type("Practical words.");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Draft saved")).toBeVisible();
    await page.getByRole("button", { name: "Publish" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Publish now" }).click();
    await expect(page.getByText("Guide published")).toBeVisible();
    await page.goto(`/resources/${slug}`);
    await expect(page.getByRole("heading", { level: 1, name: "E2E guide (TEST DATA)" })).toBeVisible();
  });
});
