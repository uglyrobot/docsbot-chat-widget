import { defineConfig } from '@playwright/test';

// Use the existing dev server. No production build or live API is needed.
export default defineConfig({
  testDir: './tests/openui',
  timeout: 45_000,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'output/playwright/openui/results.json' }]],
  outputDir: 'output/playwright/openui/test-results',
  use: {
    baseURL: process.env.WIDGET_TEST_URL || 'http://127.0.0.1:3005',
    viewport: { width: 1100, height: 1000 },
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
