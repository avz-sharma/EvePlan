import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:4178", headless: true,
    channel: process.env.CI ? undefined : "chrome", trace: "retain-on-failure" },
  webServer: { command: "node scripts/serve-test.mjs", url: "http://127.0.0.1:4178",
    reuseExistingServer: !process.env.CI },
});
