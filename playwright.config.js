import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: process.env.TEST_URL || "http://127.0.0.1:3187",
    browserName: "chromium",
    serviceWorkers: "block",
    channel: "chrome",
    headless: true,
    viewport: { width: 390, height: 844 },
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    trace: "retain-on-failure",
  },
  reporter: [["list"]],
  outputDir: "test-results",
});
