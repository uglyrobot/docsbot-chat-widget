import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: './tests/accessibility',
	testMatch: 'widget.reset-keyboard.spec.mjs',
	timeout: 30000,
	use: {
		baseURL: process.env.WIDGET_TEST_URL || 'http://127.0.0.1:3005',
		screenshot: 'only-on-failure',
		trace: 'retain-on-failure'
	}
});
