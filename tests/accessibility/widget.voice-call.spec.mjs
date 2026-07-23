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
		window.RTCPeerConnection = MockPeerConnection;
		const nativeFetch = window.fetch.bind(window);
		window.fetch = async (input, init) => {
			const url = String(input);
			if (!url.endsWith('/voice/webrtc')) return nativeFetch(input, init);
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

test('server-gated call icon switches to a stateful call view and back', async ({
	page
}) => {
	test.setTimeout(120_000);
	await installVoiceBrowserMocks(page);
	await installWidgetMocks(page, {
		...mockWidgetConfig,
		useVoiceAgent: true,
		useAudioUpload: true,
		color: '#7c3aed'
	});

	await page.goto('/');
	const root = page.locator('#docsbotai-root');
	await root.getByRole('button', { name: 'Help' }).click();
	await expect(
		root.getByRole('button', { name: 'Record voice message' })
	).toHaveCount(0);
	await root.getByRole('button', { name: 'Start voice call' }).click();

	await expect(root.getByText('Listening…', { exact: true })).toBeVisible();
	await expect(root.getByRole('button', { name: 'Mute' })).toBeVisible();
	await expect(root.getByRole('button', { name: 'End call' })).toBeVisible();
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

	await page.evaluate(() => {
		window.__emitDocsBotVoiceEvent({
			type: 'input_audio_buffer.speech_started',
			item_id: 'caller-item'
		});
	});
	await expect(
		root.getByText('You’re speaking…', { exact: true })
	).toBeVisible();

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

	await root.getByRole('button', { name: 'End call' }).click();
	await expect(root.getByText('Call ended', { exact: true })).toBeVisible();
	await root.locator('.docsbot-voice-control.is-secondary').click();
	await expect(
		root.getByText('Welcome to the accessibility demo.')
	).toBeVisible();
	await expect(root.getByText('What is the answer?')).toBeVisible();
	await expect(root.getByText('Here is the answer.')).toBeVisible();
});
