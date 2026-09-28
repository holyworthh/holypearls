import { defineConfig } from "@playwright/test";

const port = 3100;
const origin = `http://localhost:${port}`;
// The web build forwards /api/* to API_URL, which CI and .env set to port 3001.
const apiPort = 3001;
// Cloud sandboxes ship Chromium at a fixed path; CI installs Playwright's own.
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // Sign-in tests share seeded people; one worker keeps their sessions independent.
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  // Local runs talk to a hosted database; CI uses a local one.
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: origin,
    launchOptions: { executablePath },
  },
  projects: [
    { name: "mobile-375", use: { viewport: { width: 375, height: 812 }, hasTouch: true } },
    { name: "desktop-1440", use: { viewport: { width: 1440, height: 900 } } },
  ],
  webServer: [
    {
      // The API with the seeded database (DATABASE_URL and BETTER_AUTH_SECRET come from the environment).
      command: "node ../api/dist/main.js",
      url: `http://localhost:${apiPort}/health/ready`,
      reuseExistingServer: false,
      env: {
        ...(process.env as Record<string, string>),
        API_PORT: String(apiPort),
        BETTER_AUTH_URL: origin,
        AUTH_RATE_LIMIT: "off",
        HP_DEMO_SLICE: "on",
        EMAIL_FILE_DIR: "../../.outbox/e2e-emails",
      },
    },
    {
      command: `next start --port ${port}`,
      port,
      reuseExistingServer: !process.env.CI,
      env: { ...(process.env as Record<string, string>), HP_DESIGN_SYSTEM_DEMO: "on", HP_DEMO_SLICE: "on" },
    },
  ],
});
