import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4398",
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
  },
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 4398",
    url: "http://127.0.0.1:4398/en/",
    reuseExistingServer: false,
  },
});
