import { defineConfig } from '@playwright/test';

// Run against the existing development server; never triggers a production build.
export default defineConfig({
	testDir: './tests/accessibility',
	testMatch: 'widget.runtime-options.spec.mjs',
	timeout: 60000,
	use: { baseURL: process.env.WIDGET_TEST_URL || 'http://127.0.0.1:3005' }
});
