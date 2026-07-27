import { defineConfig, devices } from "@playwright/test";

/** One-off config for Full Chest V2.3 browser evidence (reuses :3000). */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  outputDir: "artifacts/playwright-output",
  use: {
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL ?? "http://localhost:3000",
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
