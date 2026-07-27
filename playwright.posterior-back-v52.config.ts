import { defineConfig, devices } from "@playwright/test";

/** Posterior Back V5.2 — attaches to PLAYWRIGHT_TEST_BASE_URL (no webServer). */
export default defineConfig({
  testDir: "e2e",
  testMatch: /posterior-back-v52-.*\.spec\.ts/,
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  outputDir: "artifacts/playwright-output-v52",
  timeout: 120_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL ?? "http://localhost:3021",
    trace: "off",
    screenshot: "off",
  },
  webServer: undefined,
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
