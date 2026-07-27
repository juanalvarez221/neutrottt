import { defineConfig, devices } from "@playwright/test";

/** Neck V6.1 — attaches to PLAYWRIGHT_TEST_BASE_URL (no webServer). */
export default defineConfig({
  testDir: "e2e",
  testMatch: /neck-v61-.*\.spec\.ts/,
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  outputDir: "artifacts/playwright-output-neck-v61",
  use: {
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL ?? "http://127.0.0.1:3022",
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
