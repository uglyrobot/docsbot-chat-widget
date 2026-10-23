import { test, expect } from '@playwright/test';
import {
	installWidgetMocks,
	mockWidgetConfig
} from './helpers/widgetMocks.mjs';

function contrastRatio(a, b) {
	const luminance = (color) => {
		const [r, g, b] = color
			.match(/[\d.]+/g)
			.slice(0, 3)
			.map((value) => {
				const channel = Number(value) / 255;
				return channel <= 0.04045
					? channel / 12.92
					: ((channel + 0.055) / 1.055) ** 2.4;
			});
		return 0.2126 * r + 0.7152 * g + 0.0722 * b;
	};
	const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (values[0] + 0.05) / (values[1] + 0.05);
}

for (const embedded of [true, false]) {
	for (const presentation of [
		{ name: 'MaineCard light', theme: 'light', color: '#082e58' },
		{ name: 'MaineCard dark', theme: 'dark', color: '#082e58' },
		{ name: 'white brand', theme: 'light', color: '#ffffff' },
		...(embedded
			? [
					{
						name: 'hidden header',
						theme: 'light',
						color: '#082e58',
						hideHeader: true
					}
				]
			: [])
	]) {
		for (const key of ['Enter', 'Space']) {
			test(`${embedded ? 'embedded' : 'floating'} ${presentation.name} reset supports ${key} and preserves keyboard focus`, async ({
				page
			}) => {
				await installWidgetMocks(page, {
					...mockWidgetConfig,
					...presentation,
					name: 'MaineCard Assistant',
					logo: false,
					headerAlignment: 'left',
					labels: {
						...mockWidgetConfig.labels,
						resetChat: 'Reset conversation'
					}
				});
				await page.route('**/reset-keyboard-harness', (route) =>
					route.fulfill({
						contentType: 'text/html',
						body: `<html><body><button id="before">Before widget</button>${embedded ? '<div id="docsbot-widget-embed" style="height:650px;max-width:600px"></div>' : ''}<script src="/chat.js"></script><script>DocsBotAI.mount({id:'test/reset',options:${JSON.stringify({ isAgent: true, theme: presentation.theme, hideHeader: !!presentation.hideHeader })}})</script></body></html>`
					})
				);
				await page.goto('/reset-keyboard-harness');
				const root = page.locator(
					embedded ? '#docsbot-widget-embed' : '#docsbotai-root'
				);
				if (!embedded) await root.locator('.floating-button').click();
				const input = root.locator('textarea');
				await expect(input).toBeVisible();
				await expect(root.locator('.docsbot-wrapper')).toHaveAttribute(
					'data-docsbot-theme',
					presentation.theme
				);
				if (presentation.hideHeader)
					await expect(
						root.locator('.docsbot-chat-header')
					).toHaveClass(/unbranded/);
				await input.fill('Keyboard reset test');
				await input.press('Enter');
				await expect(
					root.getByRole('link', { name: 'Example source' })
				).toBeVisible();
				const reset = root.getByRole('button', {
					name: 'Reset conversation'
				});
				await expect(reset).toBeVisible();
				// Reach reset through real sequential navigation, without focusing it directly.
				await page.locator('#before').focus();
				for (let i = 0; i < 20; i++) {
					await page.keyboard.press('Tab');
					if (await reset.evaluate((el) => el.matches(':focus')))
						break;
				}
				await expect(reset).toBeFocused();
				await expect(reset).toHaveCSS('outline-style', 'solid');
				await expect(reset).toHaveCSS('outline-width', '2px');
				const focusColors = await reset.evaluate((el) => ({
					outline: getComputedStyle(el).outlineColor,
					background: getComputedStyle(el).backgroundColor
				}));
				expect(
					contrastRatio(focusColors.outline, focusColors.background)
				).toBeGreaterThanOrEqual(3);
				await expect(reset).toHaveCSS(
					'box-shadow',
					`${focusColors.background} 0px 0px 0px 4px`
				);
				await page.screenshot({
					path: test.info().outputPath('reset-focused.png')
				});
				await page.keyboard.press(key);
				await expect(
					root.getByRole('link', { name: 'Example source' })
				).toHaveCount(0);
				await expect(
					root.getByText(mockWidgetConfig.labels.firstMessage, {
						exact: true
					})
				).toBeVisible();
				await expect(input).toBeFocused();
				await input.fill('Next conversation');
				await expect(input).toHaveValue('Next conversation');
				// The public history API must not steal focus from host-page controls.
				await page.locator('#before').focus();
				await page.evaluate(() => DocsBotAI.clearChatHistory());
				await expect(page.locator('#before')).toBeFocused();
			});
		}
	}
}
