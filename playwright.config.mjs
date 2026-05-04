import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/accessibility",
  timeout: 60_000,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "npm run build && npx serve build -l 4173",
    port: 4173,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
