import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests/accessibility', testMatch: ['widget.helpdesk.spec.mjs', 'widget.helpdesk-controls.spec.mjs'], timeout: 60000, use: { launchOptions: { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] }, baseURL: process.env.WIDGET_TEST_URL || 'http://127.0.0.1:3005' } });
