import { expect, test } from '@playwright/test';
import { installWidgetMocks } from './helpers/widgetMocks.mjs';

for (const embedded of [false, true]) {
	test(`runtime options preserve the ${embedded ? 'embedded' : 'floating'} widget`, async ({
		page
	}) => {
		await installWidgetMocks(page);
		let configFetches = 0;
		page.on('request', (request) => {
			if (request.url().includes('/api/widget/')) configFetches++;
		});
		await page.route('**/runtime-options-harness', (route) =>
			route.fulfill({
				contentType: 'text/html',
				body: `<html><body>${embedded ? '<div id="docsbot-widget-embed" style="height:650px"></div>' : ''}<script src="/chat.js"></script><script>
        window.beforeMount = DocsBotAI.updateOptions({questions: []});
        window.ready = DocsBotAI.mount({id: 'test/runtime', options: {isAgent: true, questions: ['Initial'], suggestedQuestions: 1}});
      </script></body></html>`
			})
		);
		await page.goto('/runtime-options-harness');
		await page.evaluate(() => window.ready);
		expect(await page.evaluate(() => window.beforeMount)).toBe(false);
		const root = page.locator(
			embedded ? '#docsbot-widget-embed' : '#docsbotai-root'
		);
		// Update while the floating panel has never opened, too.
		expect(
			await page.evaluate(() =>
				DocsBotAI.updateOptions({
					questions: ['Pricing', 'Plans'],
					suggestedQuestions: 2,
					labels: { suggestions: 'For this page' }
				})
			)
		).toBe(true);
		if (!embedded) await root.locator('.floating-button').click();
		await expect(
			root.getByRole('button', { name: 'Pricing', exact: true })
		).toBeVisible();
		await expect(
			root.getByText('For this page', { exact: true })
		).toBeVisible();
		const input = root.locator('textarea');
		await input.fill('Unsent draft');
		await page.evaluate(() => {
			window.originalWidgetRoot = DocsBotAI._root;
			DocsBotAI.updateOptions({
				questions: ['New page'],
				theme: 'dark',
				botName: 'Page assistant'
			});
		});
		await expect(
			root.getByRole('button', { name: 'New page', exact: true })
		).toBeVisible();
		await expect(input).toHaveValue('Unsent draft');
		await expect(
			root.locator('.docsbot-wrapper[data-docsbot-theme="dark"]')
		).toBeVisible();
		if (!embedded) {
			await page.evaluate(() =>
				DocsBotAI.updateOptions({
					alignment: 'right',
					horizontalMargin: 0,
					verticalMargin: 0
				})
			);
			await expect(root.locator('.floating-button')).toHaveCSS(
				'right',
				'0px'
			);
			await expect(root.locator('.floating-button')).toHaveCSS(
				'bottom',
				'0px'
			);
			await expect(root.locator('.docsbot-wrapper')).toHaveCSS(
				'right',
				'0px'
			);
			await expect(root.locator('.docsbot-wrapper')).toHaveCSS(
				'bottom',
				'80px'
			);
		}
		let releaseResponse;
		let markRequestStarted;
		const responseGate = new Promise((resolve) => {
			releaseResponse = resolve;
		});
		const requestStarted = new Promise((resolve) => {
			markRequestStarted = resolve;
		});
		await page.route(
			'https://api.docsbot.ai/teams/**/chat-agent',
			async (route) => {
				markRequestStarted();
				await responseGate;
				await route.fallback();
			}
		);
		await input.fill('Hello');
		await input.press('Enter');
		await requestStarted;
		// A route change while an answer is pending must not cancel the request.
		await page.evaluate(() =>
			DocsBotAI.updateOptions({
				questions: ['Pending page'],
				labels: { suggestions: 'Pending suggestions' }
			})
		);
		releaseResponse();
		await expect(
			root.getByText('Here is a mocked answer with a source.', {
				exact: true
			})
		).toBeVisible();
		await input.fill('Next draft');
		const stored = await page.evaluate(() => ({ ...localStorage }));
		await page.evaluate(() => {
			DocsBotAI.updateOptions({
				questions: ['Next page'],
				labels: {
					firstMessage: 'Future greeting',
					inputPlaceholder: 'Ask about this page'
				}
			});
			DocsBotAI.updateOptions({
				labels: { suggestions: 'Next suggestions' },
				color: '#123456'
			});
		});
		await expect(input).toHaveAttribute(
			'placeholder',
			'Ask about this page'
		);
		await expect(input).toHaveValue('Next draft');
		await expect(
			root.getByText('Here is a mocked answer with a source.', {
				exact: true
			})
		).toBeVisible();
		await expect(
			root.getByText('Future greeting', { exact: true })
		).toHaveCount(0);
		await expect(
			root.getByRole('button', { name: 'Next page', exact: true })
		).toHaveCount(0);
		expect(
			await page.evaluate(
				() => DocsBotAI._root === window.originalWidgetRoot
			)
		).toBe(true);
		expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(
			stored
		);
		expect(configFetches).toBe(1);
		await page.evaluate(() => DocsBotAI.clearChatHistory());
		await expect(
			root.getByText('Future greeting', { exact: true })
		).toBeVisible();
		await expect(
			root.getByRole('button', { name: 'Next page', exact: true })
		).toBeVisible();
		// Check synchronous updater cleanup independently of unmount completion.
		await page.evaluate(() => {
			DocsBotAI.unmount();
		});
		expect(
			await page.evaluate(() =>
				DocsBotAI.updateOptions({ questions: [] })
			)
		).toBe(false);
	});
}
