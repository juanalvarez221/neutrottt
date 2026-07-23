import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "artifacts/playwright-report" }]],
  outputDir: "artifacts/playwright-output",
  use: {
    baseURL: "http://localhost:3010",
    trace: "off",
    screenshot: "off",
  },
  webServer: {
    command: "npm run dev -- --port 3010",
    url: "http://localhost:3010/lab/body-3d",
    reuseExistingServer: false,
    timeout: 180_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
