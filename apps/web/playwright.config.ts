import { defineConfig } from "@playwright/test";

// E2E_WEB_PORT and E2E_ADMIN_PORT let two test runs share one machine.
const port = Number(process.env.E2E_WEB_PORT ?? 3100);
const origin = `http://localhost:${port}`;
// The staff admin, its own app on its own origin (ADR-017).
const adminPort = Number(process.env.E2E_ADMIN_PORT ?? 3200);
const adminOrigin = `http://localhost:${adminPort}`;
// The web build forwards /api/* to API_URL, which CI and .env set to port 3001.
// E2E_API_PORT runs the tests beside a dev API (build the web with API_URL on that port).
const apiPort = Number(process.env.E2E_API_PORT ?? 3001);
// Cloud sandboxes ship Chromium at a fixed path; CI installs Playwright's own.
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // Sign-in tests share seeded people; one worker keeps their sessions independent.
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  // Local runs talk to a hosted database; CI uses a local one.
  expect: { timeout: 15_000, toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled", caret: "hide" } },
  // Screenshots are made and compared on Linux only (CI, or the Playwright image through PW_SERVER);
  // Mac font rendering differs, so local runs skip them. To refresh baselines from a Mac:
  //   docker run --rm -d -p 3333:3333 --name pw mcr.microsoft.com/playwright:v1.64.1-noble \
  //     npx -y playwright@1.64.1 run-server --port 3333 --host 0.0.0.0
  //   PW_SERVER=ws://localhost:3333/ pnpm --filter @holypearls/web exec playwright test --update-snapshots
  // (Keep the image version equal to @playwright/test.)
  ignoreSnapshots: !process.env.CI && !process.env.PW_SERVER,
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{arg}-{projectName}{ext}",
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: origin,
    launchOptions: { executablePath },
    connectOptions: process.env.PW_SERVER ? { wsEndpoint: process.env.PW_SERVER, exposeNetwork: "<loopback>" } : undefined,
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
        ADMIN_ORIGIN: adminOrigin,
        AUTH_RATE_LIMIT: "off",
        HP_DEMO_SLICE: "on",
        EMAIL_FILE_DIR: "../../.outbox/e2e-emails",
      },
    },
    {
      command: `next start --port ${port}`,
      port,
      reuseExistingServer: !process.env.CI,
      env: { ...(process.env as Record<string, string>), API_URL: `http://localhost:${apiPort}`, HP_DESIGN_SYSTEM_DEMO: "on", HP_DEMO_SLICE: "on" },
    },
    {
      command: `next start ../admin --port ${adminPort}`,
      port: adminPort,
      reuseExistingServer: !process.env.CI,
      env: { ...(process.env as Record<string, string>), API_URL: `http://localhost:${apiPort}`, SITE_URL: origin },
    },
  ],
});
