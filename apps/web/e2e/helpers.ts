import AxeBuilder from "@axe-core/playwright";
import { totpCode } from "@holypearls/auth";
import { expect, type Page } from "@playwright/test";

/**
 * Axe checks the settled page: scroll reveals and photo unveils are switched
 * off first, since mid-animation opacity isn't what people end up reading.
 */
export async function expectNoAxeViolations(page: Page) {
  expect(await axeViolations(page)).toEqual([]);
}

/** The same check, returned as text, so a loop over many routes can report every failure at once. */
export async function axeViolations(page: Page): Promise<string[]> {
  await page.evaluate(() => {
    delete document.documentElement.dataset.motion;
    // Reveals already running keep going (their end value is unchanged), so finish them.
    for (const animation of document.getAnimations()) {
      try {
        animation.finish();
      } catch {
        // Infinite animations (spinners) can't finish; they don't hide anything.
      }
    }
    // The workspace's 390 px bottom tabs are sticky: wherever axe scrolls a control to, the bar can cover it,
    // which axe reports as an obscured target although people scroll past it. For the check, the bar sits at
    // the end of the page in its own space; everything else about it is still checked.
    for (const nav of document.querySelectorAll<HTMLElement>('nav[aria-label="Workspace sections"]')) nav.style.position = "static";
    return new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  });
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  await page.evaluate(() => {
    for (const nav of document.querySelectorAll<HTMLElement>('nav[aria-label="Workspace sections"]')) nav.style.removeProperty("position");
  });
  return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

/** Tabs through the page; each stop must change how it (or a near ancestor, its label or the next sibling) looks, and not be entirely covered (2.4.7, 2.4.11). */
export async function focusProblems(page: Page, stops = 60): Promise<string[]> {
  await page.addStyleTag({ content: "*,*::before,*::after{transition:none!important;animation:none!important;scroll-behavior:auto!important}" });
  const problems: string[] = [];
  for (let i = 0; i < stops; i += 1) {
    await page.keyboard.press("Tab");
    const result = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return "end";
      const nodes = [el, el.parentElement, el.parentElement?.parentElement, el.parentElement?.parentElement?.parentElement, el.closest("label"), el.nextElementSibling];
      const snap = () =>
        nodes
          .map((n) => {
            if (!n) return "";
            const s = getComputedStyle(n);
            return [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow, s.backgroundColor, s.borderColor, s.color, s.textDecorationLine, s.fill, s.fillOpacity, s.strokeOpacity].join();
          })
          .join("|");
      const on = snap();
      el.blur();
      const off = snap();
      el.focus();
      const name = `${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40)}"`;
      if (on === off) return `no visible focus: ${name}`;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return null; // a visually hidden input; its label is checked above
      const points = [
        [r.left + r.width / 2, r.top + r.height / 2],
        [r.left + 2, r.top + 2],
        [r.right - 2, r.top + 2],
        [r.left + 2, r.bottom - 2],
        [r.right - 2, r.bottom - 2],
      ];
      const seen = points.some(([x, y]) => {
        const hit = document.elementFromPoint(x!, y!);
        return !!hit && (hit === el || el.contains(hit) || hit.contains(el) || !!hit.closest("label")?.contains(el));
      });
      return seen ? null : `focus hidden: ${name}`;
    });
    if (result === "end") break;
    if (result) problems.push(result);
  }
  return problems;
}

/** Customer sign-in on the site, landing on `next`. */
export async function signInCustomer(page: Page, person: { email: string; password: string }, next: string) {
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await page.locator("#sign-in-email").fill(person.email);
  await page.locator("#sign-in-password").fill(person.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => url.pathname.startsWith(next));
}

export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

/** The staff admin app (ADR-017), started beside the customer site by playwright.config.ts. */
export const ADMIN = `http://localhost:${process.env.E2E_ADMIN_PORT ?? 3200}`;

/** Staff sign-in with the authenticator step. Codes can't be reused, so a rejected code waits for the next one. */
export async function signInStaff(page: Page, person: { email: string; password: string; totpSecret: string }) {
  await page.goto(`${ADMIN}/sign-in`);
  await page.locator("#staff-email").fill(person.email);
  await page.locator("#staff-password").fill(person.password);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Enter your code" })).toBeVisible();
  const code = page.getByLabel("6-digit code");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await code.fill(await totpCode(person.totpSecret));
    await page.getByRole("button", { name: "Verify" }).click();
    // Either the admin home opens (it can take a while against a hosted database) or the code is refused.
    const done = await page
      .waitForURL(`${ADMIN}/`, { timeout: 20_000, waitUntil: "commit" })
      .then(() => true)
      .catch(() => false);
    if (done || !(await code.isVisible())) return;
    await page.waitForTimeout(30_000 - (Date.now() % 30_000) + 500);
  }
  await expect(page).toHaveURL(`${ADMIN}/`);
}
