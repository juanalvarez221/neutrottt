import { defineConfig } from "@playwright/test";

/** Artifact-only config for Posterior Back V5.0 (no webServer). */
export default defineConfig({
  testDir: "e2e",
  testMatch: "**/posterior-back-v50.spec.ts",
  fullyParallel: false,
  workers: 1,
  reporter: [["line"]],
  use: {
    trace: "off",
  },
});
