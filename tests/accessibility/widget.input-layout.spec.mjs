import { expect, test } from '@playwright/test';
import { installWidgetMocks } from './helpers/widgetMocks.mjs';

const viewports = [
	{ name: 'desktop', width: 1280, height: 800 },
	{ name: 'narrow mobile', width: 320, height: 568 }
];

async function openVoiceDisabledWidget(page) {
	await page.route('http://127.0.0.1:4173/', async (route) => {
		const response = await route.fetch();
		const originalHtml = await response.text();
		const html = originalHtml
			.replace('localDev: true', 'localDev: false')
			.replace('useAudioUpload: true', 'useAudioUpload: false');

		expect(html).not.toBe(originalHtml);
		await route.fulfill({
			response,
			body: html,
			headers: {
				...response.headers(),
				'content-type': 'text/html; charset=utf-8'
			}
		});
	});
	await installWidgetMocks(page);
	await page.goto('/');

	const widget = page.locator('#docsbotai-root');
	await widget.getByRole('button', { name: 'Help' }).click();

	const chatInput = widget.locator('textarea');
	const imageUpload = widget.getByRole('button', { name: 'Upload image' });
	const send = widget.getByRole('button', { name: 'Submit' });
	await expect(imageUpload).toBeVisible();
	await expect(send).toBeVisible();
	await expect(
		widget.getByRole('button', { name: 'Record voice message' })
	).toHaveCount(0);

	return { chatInput, imageUpload, send };
}

async function getControlLayout(imageUpload, send) {
	const imageBox = await imageUpload.boundingBox();
	const sendBox = await send.boundingBox();
	const imageIconBox = await imageUpload.locator('svg').boundingBox();
	const sendIconBox = await send.locator('svg').boundingBox();

	expect(imageBox).not.toBeNull();
	expect(sendBox).not.toBeNull();
	expect(imageIconBox).not.toBeNull();
	expect(sendIconBox).not.toBeNull();

	return { imageBox, sendBox, imageIconBox, sendIconBox };
}

for (const viewport of viewports) {
	test(`voice-disabled upload icon stays visible with compact spacing at ${viewport.name} width`, async ({
		page
	}) => {
		await page.setViewportSize(viewport);
		const { chatInput, imageUpload, send } =
			await openVoiceDisabledWidget(page);

		await expect(send).toBeDisabled();
		const disabledLayout = await getControlLayout(imageUpload, send);
		expect(
			disabledLayout.imageBox.x +
				disabledLayout.imageBox.width -
				disabledLayout.sendBox.x
		).toBeGreaterThan(0);
		expect(
			disabledLayout.imageIconBox.x + disabledLayout.imageIconBox.width
		).toBeLessThan(disabledLayout.sendIconBox.x);
		expect(
			await imageUpload.evaluate(
				(button, point) => {
					const target = button
						.getRootNode()
						.elementFromPoint(point.x, point.y);
					return target === button || button.contains(target);
				},
				{
					x: disabledLayout.sendBox.x + 1,
					y:
						disabledLayout.imageBox.y +
						disabledLayout.imageBox.height / 2
				}
			)
		).toBe(true);

		await chatInput.fill('Hello');

		await expect(send).toBeEnabled();
		const enabledLayout = await getControlLayout(imageUpload, send);
		expect(
			enabledLayout.sendBox.x -
				(enabledLayout.imageBox.x + enabledLayout.imageBox.width)
		).toBeGreaterThanOrEqual(2);
		expect(disabledLayout.imageBox.x).toBeGreaterThan(
			enabledLayout.imageBox.x
		);
	});
}
