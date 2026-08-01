import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./performance",
  testMatch: "**/browser.perf.spec.ts",
  outputDir: "performance-results/playwright-artifacts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:4273",
    headless: true,
    trace: "retain-on-failure",
    launchOptions: {
      args: ["--enable-precise-memory-info"],
    },
  },
  webServer: {
    command: "npm run build && npm run serve:perf",
    url: "http://127.0.0.1:4273",
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
