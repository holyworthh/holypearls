import { defineConfig } from "@playwright/test";

const port = 3100;
// Cloud sandboxes ship Chromium at a fixed path; CI installs Playwright's own.
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    launchOptions: { executablePath },
  },
  projects: [
    { name: "mobile-375", use: { viewport: { width: 375, height: 812 }, hasTouch: true } },
    { name: "desktop-1440", use: { viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: `next start --port ${port}`,
    port,
    reuseExistingServer: !process.env.CI,
    env: { HP_DESIGN_SYSTEM_DEMO: "on" },
  },
});
