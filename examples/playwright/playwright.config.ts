import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const appUrl = process.env.BASE_URL || "http://localhost:5173";
const apiUrl = process.env.API_URL || "http://127.0.0.1:3100";
const isolationMode = process.env.TEST_RUN_ISOLATION || "auto";
const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const startLocalApp = process.env.PLAYWRIGHT_NO_WEBSERVER !== "1";

export default defineConfig({
  testDir: "tests",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: isolationMode === "required" ? (process.env.CI ? 3 : undefined) : 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [
        ["line"],
        ["junit", { outputFile: "test-results/junit.xml" }],
        ["html", { open: "never" }],
      ]
    : [["list"], ["html", { open: "never" }]],
  outputDir: "test-results",
  preserveOutput: "failures-only",
  use: {
    baseURL: appUrl,
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: startLocalApp
    ? {
        command: process.env.CI ? "npm run start" : "npm run dev",
        cwd: repositoryRoot,
        env: {
          ...process.env,
          APP_ORIGIN: appUrl,
          HOST: "127.0.0.1",
          JWT_SECRET:
            process.env.JWT_SECRET ||
            "playwright-local-secret-change-before-sharing-2026",
          PORT: new URL(apiUrl).port || "3100",
          TEST_CONTROL_KEY: process.env.TEST_CONTROL_KEY || "testlab-control",
          TEST_RUN_KEY:
            process.env.TEST_RUN_KEY ||
            process.env.TEST_CONTROL_KEY ||
            "testlab-control",
          TEST_MODE: "true",
          VITE_API_TARGET: apiUrl,
        },
        url: `${appUrl}/api/health`,
        reuseExistingServer: !process.env.CI,
        timeout: process.env.CI ? 300_000 : 120_000,
      }
    : undefined,
});
