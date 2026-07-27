import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/upper-arms-v80-browser.spec.ts",
  timeout: 120_000,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3001",
    trace: "off",
    screenshot: "off",
  },
  webServer: {
    command: "npx next dev -p 3001",
    url: "http://127.0.0.1:3001/lab/body-3d",
    reuseExistingServer: true,
    timeout: 180_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  outputDir: "artifacts/playwright-output-upper-arms-v80",
});
