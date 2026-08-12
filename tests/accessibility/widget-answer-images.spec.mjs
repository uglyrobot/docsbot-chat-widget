import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { installWidgetMocks } from './helpers/widgetMocks.mjs';

async function openImageAnswer(page, question = 'Show me an image') {
	await installWidgetMocks(page);
	await page.goto('/?visual=1');

	const widget = page.locator('#docsbotai-root');
	await widget.getByRole('button', { name: 'Help' }).click();

	const chatInput = widget.locator('textarea');
	await expect(chatInput).toBeVisible();
	await chatInput.fill(question);
	await chatInput.press('Enter');

	const answerImage = widget.getByRole('button', {
		name: 'DocsBot answer image'
	});
	if (!question.includes('linked')) {
		await expect(answerImage).toBeVisible();
		await expect(
			widget.locator(
				"[data-streamdown='image-wrapper'] button[title='Download image']"
			)
		).toBeVisible();
	}

	return { widget, answerImage };
}

test('opens and closes an assistant answer image without losing conversation context', async ({
	page
}) => {
	const { widget, answerImage } = await openImageAnswer(page);
	const conversationText =
		'The conversation stays here after you close the enlarged view.';

	await answerImage.click();

	const lightbox = widget.getByRole('dialog');
	await expect(lightbox).toBeVisible();
	await expect(
		lightbox.getByRole('img', { name: 'DocsBot answer image' })
	).toBeVisible();
	await expect(widget.getByText(conversationText)).toBeVisible();
	const axeResults = await new AxeBuilder({ page })
		.include('#docsbotai-root')
		.analyze();
	expect(
		axeResults.violations.filter(
			(violation) => violation.impact === 'critical'
		)
	).toEqual([]);
	const closeButton = lightbox.locator('.docsbot-image-lightbox-close');
	await expect(closeButton).toBeFocused();
	await page.keyboard.press('Tab');
	await expect(closeButton).toBeFocused();
	await page.keyboard.press('Shift+Tab');
	await expect(closeButton).toBeFocused();

	await closeButton.click();

	await expect(lightbox).toBeHidden();
	await expect(widget.getByText(conversationText)).toBeVisible();
	await expect(answerImage).toBeFocused();
});

test('closes an assistant answer image with Escape and keeps the same answer mounted', async ({
	page
}) => {
	const { widget, answerImage } = await openImageAnswer(page);

	await answerImage.click();
	const lightbox = widget.getByRole('dialog');
	await expect(lightbox).toBeVisible();

	await page.keyboard.press('Escape');

	await expect(lightbox).toBeHidden();
	await expect(answerImage).toBeVisible();
	await expect(answerImage).toBeFocused();
});

test('keeps linked assistant answer images as native links', async ({ page }) => {
	const { widget } = await openImageAnswer(page, 'Show me a linked image');
	const targetUrl = 'http://127.0.0.1:4173/linked-image-target';
	const linkedImage = widget.locator(
		"[data-streamdown='link'] img[data-streamdown='image']"
	);

	await expect(linkedImage).toBeVisible();
	await expect(linkedImage).not.toHaveAttribute('role', 'button');
	await expect(linkedImage).not.toHaveAttribute('tabindex', '0');
	await expect(widget.getByRole('dialog')).toHaveCount(0);

	const popupPromise = page.waitForEvent('popup');
	await linkedImage.click();
	const popup = await popupPromise;
	await expect(popup).toHaveURL(targetUrl);
	await expect(widget.getByRole('dialog')).toHaveCount(0);
	await popup.close();
});
