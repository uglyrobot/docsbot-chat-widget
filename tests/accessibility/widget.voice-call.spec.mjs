import { expect, test } from '@playwright/test';
import {
	installWidgetMocks,
	mockWidgetConfig
} from './helpers/widgetMocks.mjs';

async function installVoiceBrowserMocks(page) {
	await page.addInitScript(() => {
		class MockDataChannel extends EventTarget {
			close() {
				this.dispatchEvent(new Event('close'));
			}
		}

		class MockPeerConnection extends EventTarget {
			constructor() {
				super();
				this.iceGatheringState = 'complete';
				this.connectionState = 'new';
				this.localDescription = null;
				this.senders = [];
			}
			addTrack(track) {
				this.senders.push({ track });
			}
			createDataChannel(label) {
				if (label !== 'oai-events')
					throw new Error('Unexpected data channel');
				const channel = new MockDataChannel();
				window.__docsbotVoiceChannel = channel;
				return channel;
			}
			async createOffer() {
				return { type: 'offer', sdp: 'v=0\r\no=playwright-offer' };
			}
			async setLocalDescription(offer) {
				this.localDescription = offer;
			}
			async setRemoteDescription() {
				this.connectionState = 'connected';
				this.dispatchEvent(new Event('connectionstatechange'));
				window.__docsbotVoiceChannel.dispatchEvent(new Event('open'));
			}
			getSenders() {
				return this.senders;
			}
			getReceivers() {
				return [];
			}
			close() {
				this.connectionState = 'closed';
			}
		}

		const microphoneTrack = {
			enabled: true,
			stop() {}
		};
		Object.defineProperty(navigator, 'mediaDevices', {
			configurable: true,
			value: {
				getUserMedia: async () => {
					return {
						getTracks: () => [microphoneTrack],
						getAudioTracks: () => [microphoneTrack]
					};
				}
			}
		});
		class MockMediaRecorder {
			constructor() {
				this.state = 'inactive';
				this.ondataavailable = null;
				this.onstop = null;
			}
			start() {
				this.state = 'recording';
			}
			stop() {
				this.state = 'inactive';
				this.ondataavailable?.({ data: new Blob(['x'], { type: 'audio/webm' }) });
				this.onstop?.();
			}
			static isTypeSupported() {
				return true;
			}
		}
		window.MediaRecorder = MockMediaRecorder;
		window.RTCPeerConnection = MockPeerConnection;
		const nativeFetch = window.fetch.bind(window);
		window.fetch = async (input, init) => {
			const url = String(input);
			if (!url.endsWith('/voice')) return nativeFetch(input, init);
			window.__docsbotVoiceRequest = {
				url,
				body: init?.body,
				headers: Object.fromEntries(
					new Headers(init?.headers).entries()
				)
			};
			return new Response('v=0\r\no=playwright-answer', {
				status: 200,
				headers: {
					'Content-Type': 'application/sdp',
					'X-DocsBot-Voice-Call-Id': 'call-playwright',
					'X-DocsBot-Conversation-Id': 'conversation-playwright'
				}
			});
		};
		window.__emitDocsBotVoiceEvent = (event) => {
			window.__docsbotVoiceChannel.dispatchEvent(
				new MessageEvent('message', { data: JSON.stringify(event) })
			);
		};
	});
}

test('server-gated composer orb switches to a stateful call view and back', async ({
	page
}) => {
	test.setTimeout(120_000);
	await installVoiceBrowserMocks(page);
	await installWidgetMocks(page, {
		...mockWidgetConfig,
		useVoiceAgent: true,
		useCustomButtons: true,
		useAudioUpload: true,
		color: '#7c3aed'
	});

	await page.goto('/');
	const root = page.locator('#docsbotai-root');
	await root.getByRole('button', { name: 'Help' }).click();
	// Mic stays available when audio upload is enabled; phone icon is gone.
	await expect(
		root.getByRole('button', { name: 'Record voice message' })
	).toBeVisible();
	const voiceOrbStart = root.getByRole('button', { name: 'Start voice call' });
	await expect(voiceOrbStart).toBeVisible();
	await expect(root.getByRole('button', { name: 'Submit' })).toHaveCount(0);

	// Any text swaps the orb for submit (same threshold as the mic control).
	await root.locator('textarea').fill('H');
	await expect(root.getByRole('button', { name: 'Submit' })).toBeVisible();
	await expect(voiceOrbStart).toHaveCount(0);

	await root.locator('textarea').fill('');
	await expect(voiceOrbStart).toBeVisible();
	await voiceOrbStart.click();

	await expect(root.getByRole('button', { name: 'Mute' })).toBeVisible();
	await expect(root.getByRole('button', { name: 'End call' })).toBeVisible();
	await expect(
		root.getByRole('img', { name: 'Listening…' })
	).toBeVisible();
	await expect(root.getByText('Listening…', { exact: true })).toHaveCount(0);
	await expect(root.locator('.docsbot-voice-orb')).toBeVisible();
	await expect(root.locator('.docsbot-voice-call-wave')).toBeVisible();
	const voiceRequest = await page.evaluate(
		() => window.__docsbotVoiceRequest
	);
	expect(voiceRequest.body).toContain('playwright-offer');
	const requestHeaders = voiceRequest.headers;
	expect(requestHeaders['content-type']).toBe('application/sdp');
	expect(requestHeaders.authorization).toMatch(/^Bearer /);
	expect(requestHeaders['x-docsbot-conversation-id']).toBeTruthy();
	const voiceMetadata = JSON.parse(requestHeaders['x-docsbot-metadata']);
	expect(voiceMetadata.referrer).toMatch(/^https?:\/\//);
	expect(voiceMetadata).not.toHaveProperty('metadata');
	expect(voiceMetadata).not.toHaveProperty('priv_stripe_customer_id');

	await page.evaluate(() => {
		window.__emitDocsBotVoiceEvent({
			type: 'input_audio_buffer.speech_started',
			item_id: 'caller-item'
		});
	});
	await expect(
		root.getByText('You’re speaking…', { exact: true })
	).toHaveCount(0);
	await expect(
		root.getByText('Agent is speaking…', { exact: true })
	).toHaveCount(0);
	await expect(
		root.getByRole('img', { name: 'You’re speaking…' })
	).toHaveCount(0);

	await page.evaluate(() => {
		window.__emitDocsBotVoiceEvent({
			type: 'input_audio_buffer.speech_stopped',
			item_id: 'caller-item'
		});
		window.__emitDocsBotVoiceEvent({
			type: 'response.output_item.added',
			item: {
				id: 'tool-item',
				type: 'function_call',
				name: 'search_documentation',
				arguments: '{"credential":"must-not-render"}'
			}
		});
	});
	await expect(root.getByText('Searching documentation…')).toBeVisible();
	await expect(root.getByText('must-not-render')).toHaveCount(0);

	await page.evaluate(() => {
		window.__emitDocsBotVoiceEvent({
			type: 'response.output_item.added',
			item: { id: 'agent-item', type: 'message', role: 'assistant' }
		});
	});
	await page.evaluate(() => {
		window.__emitDocsBotVoiceEvent({
			type: 'response.output_audio_transcript.delta',
			item_id: 'agent-item',
			delta: 'Here is the answer.'
		});
	});
	await expect(root.getByText('Here is the answer.')).toBeVisible();
	await page.evaluate(() => {
		window.__emitDocsBotVoiceEvent({
			type: 'conversation.item.input_audio_transcription.completed',
			item_id: 'caller-item',
			transcript: 'What is the answer?'
		});
	});
	await expect(root.getByText('What is the answer?')).toBeVisible();
	await page.evaluate(() => {
		window.__emitDocsBotVoiceEvent({
			type: 'response.output_audio_transcript.done',
			item_id: 'agent-item',
			transcript: 'Here is the answer.'
		});
	});
	await expect(root.getByText('Here is the answer.')).toBeVisible();

	await page.evaluate(() => {
		window.__emitDocsBotVoiceEvent({
			type: 'conversation.item.created',
			item: {
				id: 'action-item',
				call_id: 'call-custom-button',
				type: 'function_call_output',
				output: JSON.stringify({
					status: 'ok',
					result: { credential: 'must-not-render-action' },
					client_action: {
						type: 'custom_button',
						message: 'Open your account settings.',
						buttonText: 'Open account',
						url: 'https://example.com/account',
						functionKey: 'account',
						voice_message: "I've shown the next step on screen."
					}
				})
			}
		});
	});
	await expect(
		root.getByRole('button', { name: 'Open account' })
	).toBeVisible();
	await expect(root.getByText('Open your account settings.')).toBeVisible();
	await expect(root.getByText('must-not-render-action')).toHaveCount(0);

	await page.evaluate(() => {
		window.__emitDocsBotVoiceEvent({
			type: 'conversation.item.created',
			item: {
				id: 'stripe-item',
				call_id: 'call-stripe',
				type: 'function_call_output',
				output: JSON.stringify({
					status: 'ok',
					result: { credential: 'must-not-render-stripe' },
					client_action: {
						type: 'stripe_billing',
						voice_message: 'Here are your recent invoices.',
						stripeBilling: [
							{
								type: 'invoices',
								items: [
									{
										id: 'in_123',
										invoiceNumber: 'INV-42',
										status: 'paid',
										amountPaid: '12.00',
										currency: 'usd',
										createdAt: '2026-01-01T00:00:00.000Z'
									}
								]
							}
						]
					}
				})
			}
		});
	});
	await expect(
		root.getByText('Here are your recent invoices.')
	).toHaveCount(0);
	await expect(root.getByText(/INV-42/)).toBeVisible();
	await expect(root.getByText('must-not-render-stripe')).toHaveCount(0);

	await root.getByRole('button', { name: 'End call' }).click();
	await expect(root.locator('.docsbot-voice-call-view')).toHaveCount(0);
	await expect(
		root.getByText('Welcome to the accessibility demo.')
	).toBeVisible();
	await expect(root.getByText('What is the answer?')).toBeVisible();
	await expect(root.getByText('Here is the answer.')).toBeVisible();
	await expect(
		root.getByRole('button', { name: 'Open account' })
	).toBeVisible();
	await expect(root.getByText('Open your account settings.')).toBeVisible();
	await expect(
		root.getByText('Here are your recent invoices.')
	).toHaveCount(0);
	await expect(root.getByText(/INV-42/)).toBeVisible();
});

test('voice call resuming an existing chat keeps prior history and appends', async ({
	page
}) => {
	test.setTimeout(120_000);
	await installVoiceBrowserMocks(page);
	await installWidgetMocks(page, {
		...mockWidgetConfig,
		useVoiceAgent: true,
		color: '#7c3aed'
	});

	await page.goto('/');
	const root = page.locator('#docsbotai-root');
	await root.getByRole('button', { name: 'Help' }).click();

	await root.locator('textarea').fill('What can you do?');
	await root.getByRole('button', { name: 'Submit' }).click();
	await expect(
		root.getByText('Here is a mocked answer with a source.')
	).toBeVisible();

	await root.getByRole('button', { name: 'Start voice call' }).click();
	await expect(root.locator('.docsbot-voice-call-view')).toBeVisible();
	await expect(
		root.getByText('Welcome to the accessibility demo.')
	).toBeVisible();
	await expect(root.getByText('What can you do?')).toBeVisible();
	await expect(
		root.getByText('Here is a mocked answer with a source.')
	).toBeVisible();
	await expect(root.locator('.docsbot-voice-transcript.is-history')).toHaveCount(
		3
	);

	const voiceRequest = await page.evaluate(
		() => window.__docsbotVoiceRequest
	);
	expect(voiceRequest.headers['x-docsbot-conversation-id']).toBeTruthy();

	await page.evaluate(() => {
		window.__emitDocsBotVoiceEvent({
			type: 'conversation.item.input_audio_transcription.completed',
			item_id: 'caller-resume',
			transcript: 'Can you summarize that?'
		});
		window.__emitDocsBotVoiceEvent({
			type: 'response.output_audio_transcript.done',
			item_id: 'agent-resume',
			transcript: 'Sure — DocsBot can answer from your docs.'
		});
	});
	await expect(root.getByText('Can you summarize that?')).toBeVisible();
	await expect(
		root.getByText('Sure — DocsBot can answer from your docs.')
	).toBeVisible();
	await expect(
		root.getByText('Here is a mocked answer with a source.')
	).toBeVisible();
});
