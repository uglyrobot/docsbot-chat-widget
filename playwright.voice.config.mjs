import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

const localChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export default defineConfig({
  testDir: "./tests/voice",
  timeout: 60_000,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3005",
    ...(existsSync(localChrome) ? { channel: "chrome" } : {}),
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    launchOptions: {
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
      ],
    },
  },
  webServer: {
    command: "npm run serve:voice-test",
    port: 3005,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
