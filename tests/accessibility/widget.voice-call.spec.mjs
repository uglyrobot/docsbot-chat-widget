import { expect, test } from '@playwright/test';
import {
	installWidgetMocks,
	mockWidgetConfig
} from './helpers/widgetMocks.mjs';

async function readPersistedCallbackHistory(page) {
	return page.evaluate(() => {
		const key = Object.keys(localStorage).find((entry) =>
			entry.endsWith('_localChatHistory')
		);
		if (!key) return null;
		const value = localStorage.getItem(key);
		return value ? JSON.parse(value) : null;
	});
}

async function installVoiceBrowserMocks(page) {
	await page.addInitScript(() => {
		class MockDataChannel extends EventTarget {
			constructor() {
				super();
				this.readyState = 'connecting';
				this.sent = [];
			}
			send(data) {
				this.sent.push(data);
			}
			close() {
				this.readyState = 'closed';
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
				window.__docsbotVoiceSentEvents = channel.sent;
				return channel;
			}
			async createOffer() {
				return { type: 'offer', sdp: 'v=0\r\no=playwright-offer' };
			}
			async setLocalDescription(offer) {
				this.localDescription = offer;
			}
			async setRemoteDescription() {
				// PC can connect before the data channel; the widget must stay
				// on "connecting" until the channel opens (deferred here so
				// tests can observe that intermediate UI).
				this.connectionState = 'connected';
				this.dispatchEvent(new Event('connectionstatechange'));
				await new Promise((resolve) => {
					setTimeout(() => {
						window.__docsbotVoiceChannel.readyState = 'open';
						window.__docsbotVoiceChannel.dispatchEvent(
							new Event('open')
						);
						resolve();
					}, 80);
				});
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
			if (url.includes('/escalate') && init?.method === 'PUT') {
				window.__docsbotEscalateRequest = { url, method: init.method };
				return new Response(JSON.stringify({ ok: true }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				});
			}
			if (url.includes('/ticket')) {
				return new Response(
					JSON.stringify({
						subject: 'Voice escalation',
						message: 'Caller requested human support.'
					}),
					{
						status: 200,
						headers: { 'Content-Type': 'application/json' }
					}
				);
			}
			if (url.includes('/chat-agent')) {
				let question = '';
				try {
					const body =
						typeof init?.body === 'string'
							? JSON.parse(init.body)
							: init?.body;
					question = body?.question || '';
				} catch {
					// Ignore malformed bodies and return the default SSE.
				}
				const normalized = String(question).trim().toLowerCase();
				const sse = normalized.includes('support')
					? `event: stream
data: I can connect you with support.

event: support_escalation
data: ${JSON.stringify({
	answer: 'I can connect you with support.',
	options: { yes: 'Contact support', no: 'No' },
	history: [
		{ role: 'user', message: question },
		{ role: 'assistant', message: 'I can connect you with support.' }
	],
	id: 'answer-support'
})}

`
					: `event: stream
data: Here is a mocked answer with a source.

event: done
data: ${JSON.stringify({
	answer: 'Here is a mocked answer with a source.',
	sources: [
		{
			title: 'Example source',
			url: 'https://example.com/docs/widget-accessibility',
			type: 'url'
		}
	],
	history: [
		{ role: 'user', message: question },
		{
			role: 'assistant',
			message: 'Here is a mocked answer with a source.'
		}
	],
	id: 'answer-default'
})}

`;
				return new Response(sse, {
					status: 200,
					headers: {
						'Content-Type': 'text/event-stream',
						'cache-control': 'no-cache',
						connection: 'keep-alive'
					}
				});
			}
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
		window.open = () => ({ closed: false, location: { href: '' }, close() {} });
	});
}

async function remountWithVoiceCallbackSpies(page) {
	await page.evaluate(async () => {
		window.DocsBotAI.unmount();
		await new Promise((resolve) => requestAnimationFrame(resolve));
		await window.DocsBotAI.mount({
			id: 'nG4F5A3BFSBzdYc5TZIX/uy8srweloFNgRadNtwvf',
			customButtonCallback(event, key, button, history, metadata) {
				event.preventDefault();
				window.__docsbotVoiceCustomCallback = {
					key,
					button,
					history,
					metadata
				};
			},
			supportCallback(event, history, metadata, ticket) {
				event.preventDefault();
				window.__docsbotVoiceSupportCallback = {
					history,
					metadata,
					ticket
				};
			},
			options: {
				localDev: true,
				isAgent: true,
				useVoiceAgent: true,
				useCustomButtons: true,
				useEscalation: true,
				supportLink: 'https://example.com/support'
			}
		});
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
	await page.evaluate(() => {
		window.__docsbotVoiceEvents = [];
		window.__docsbotToolCalls = [];
		const push = (name) => (event) => {
			window.__docsbotVoiceEvents.push({
				name,
				detail: event.detail ? { ...event.detail } : null
			});
		};
		document.addEventListener(
			'docsbot_voice_call_start',
			push('docsbot_voice_call_start')
		);
		document.addEventListener(
			'docsbot_voice_call_end',
			push('docsbot_voice_call_end')
		);
		document.addEventListener('docsbot_tool_call', (event) => {
			window.__docsbotToolCalls.push(
				event.detail ? { ...event.detail } : null
			);
		});
	});
	await voiceOrbStart.click();

	// Connecting chrome mounts immediately; start event waits for WebRTC.
	await expect(
		root.locator('.docsbot-voice-call-view[data-voice-layout="connecting"]')
	).toBeVisible();

	await expect
		.poll(async () =>
			page.evaluate(() =>
				window.__docsbotVoiceEvents.map((event) => event.name)
			)
		)
		.toEqual(['docsbot_voice_call_start']);
	const startDetail = await page.evaluate(
		() => window.__docsbotVoiceEvents[0]?.detail
	);
	expect(startDetail?.conversationId).toBeTruthy();

	await expect(
		root.locator('.docsbot-voice-call-view[data-voice-layout="connecting"]')
	).toHaveCount(0);
	await expect(
		root.locator('.docsbot-voice-call-view[data-voice-layout="settled"]')
	).toBeVisible();
	await expect(root.getByRole('button', { name: 'Mute' })).toBeVisible();
	await expect(root.getByRole('button', { name: 'End call' })).toBeVisible();
	await expect(root.locator('.docsbot-voice-call-time')).toHaveText('0:00');
	await expect(
		root.getByRole('img', { name: 'Listening…' })
	).toBeVisible();
	await expect(root.getByText('Listening…', { exact: true })).toHaveCount(0);
	await expect(root.locator('.docsbot-voice-orb')).toBeVisible();
	await expect(root.locator('.docsbot-voice-call-wave')).toBeVisible();
	// Fresh calls must not seed the static chat greeting; the model greets.
	await expect(
		root.getByText('Welcome to the accessibility demo.')
	).toHaveCount(0);
	await expect(
		root.locator('.docsbot-voice-conversation-message.is-history')
	).toHaveCount(0);
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
	// Speaking states keep status copy hidden (orb-only; no speaking labels).
	await expect(root.locator('.docsbot-voice-call-status')).toHaveCount(0);
	await expect(root.getByRole('img', { name: 'Listening…' })).toHaveCount(0);

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
	await expect(
		root.getByText('Searching documentation…', { exact: true })
	).toHaveCount(0);
	await expect(root.getByRole('img', { name: 'Working…' })).toBeVisible();
	await expect(root.getByText('must-not-render')).toHaveCount(0);
	await expect
		.poll(async () => page.evaluate(() => window.__docsbotToolCalls))
		.toEqual([
			{
				name: 'search_documentation',
				data: { credential: 'must-not-render' }
			}
		]);

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
						buttonText: 'Open account',
						url: 'https://example.com/account',
						functionKey: 'account'
					}
				})
			}
		});
	});
	// Card waits for the post-tool spoken handoff.
	await expect(
		root.getByRole('button', { name: 'Open account' })
	).toHaveCount(0);
	await page.evaluate(() => {
		window.__emitDocsBotVoiceEvent({
			type: 'response.output_audio_transcript.done',
			item_id: 'agent-handoff',
			transcript: "I've shown the next step on screen."
		});
	});
	await expect(
		root.getByRole('button', { name: 'Open account' })
	).toBeVisible();
	// Confirmation copy is spoken by the model; client_action has no message.
	await expect(root.getByText('must-not-render-action')).toHaveCount(0);

	// Later speech must append below the tool card, not above it.
	await page.evaluate(() => {
		window.__emitDocsBotVoiceEvent({
			type: 'conversation.item.input_audio_transcription.completed',
			item_id: 'caller-after-card',
			transcript: 'Thanks, I opened it.'
		});
		window.__emitDocsBotVoiceEvent({
			type: 'response.output_audio_transcript.done',
			item_id: 'agent-after-card',
			transcript: 'Great — let me know if you need anything else.'
		});
	});
	await expect(root.getByText('Thanks, I opened it.')).toBeVisible();
	await expect(
		root.getByText('Great — let me know if you need anything else.')
	).toBeVisible();
	await expect
		.poll(() => readPersistedCallbackHistory(page))
		.toEqual([
			{ role: 'user', message: 'What is the answer?' },
			{ role: 'assistant', message: 'Here is the answer.' },
			{
				role: 'assistant',
				message: "I've shown the next step on screen."
			},
			{ role: 'user', message: 'Thanks, I opened it.' },
			{
				role: 'assistant',
				message: 'Great — let me know if you need anything else.'
			}
		]);
	const timelineTexts = await root
		.locator('.docsbot-voice-transcripts-inner')
		.evaluate((node) =>
			[
				...node.querySelectorAll(
					'.docsbot-voice-conversation-message'
				)
			]
				.map((element) =>
					element.textContent?.replace(/\s+/g, ' ').trim()
				)
				.filter(Boolean)
		);
	const buttonIndex = timelineTexts.findIndex((text) =>
		text.includes('Open account')
	);
	const handoffIndex = timelineTexts.findIndex((text) =>
		text.includes("I've shown the next step on screen.")
	);
	const laterCallerIndex = timelineTexts.findIndex((text) =>
		text.includes('Thanks, I opened it.')
	);
	const laterAgentIndex = timelineTexts.findIndex((text) =>
		text.includes('Great — let me know if you need anything else.')
	);
	expect(handoffIndex).toBeGreaterThanOrEqual(0);
	// Button attaches under the spoken handoff turn (same group or after).
	expect(buttonIndex).toBeGreaterThanOrEqual(handoffIndex);
	expect(laterCallerIndex).toBeGreaterThan(buttonIndex);
	expect(laterAgentIndex).toBeGreaterThan(laterCallerIndex);

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
	await expect(root.getByText(/INV-42/)).toHaveCount(0);
	await page.evaluate(() => {
		window.__emitDocsBotVoiceEvent({
			type: 'response.output_audio_transcript.done',
			item_id: 'agent-stripe-handoff',
			transcript: 'Here are your recent invoices.'
		});
	});
	await expect(
		root.getByText('Here are your recent invoices.')
	).toBeVisible();
	await expect(root.getByText(/INV-42/)).toBeVisible();
	await expect(root.getByText('must-not-render-stripe')).toHaveCount(0);

	await root.getByRole('button', { name: 'End call' }).click();
	await expect(root.locator('.docsbot-voice-call-view')).toHaveCount(0);
	await expect
		.poll(async () =>
			page.evaluate(() =>
				window.__docsbotVoiceEvents.map((event) => event.name)
			)
		)
		.toEqual(['docsbot_voice_call_start', 'docsbot_voice_call_end']);
	const endDetail = await page.evaluate(
		() => window.__docsbotVoiceEvents[1]?.detail
	);
	expect(endDetail?.conversationId).toBe(startDetail.conversationId);
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
	).toBeVisible();
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
	const sendWithoutWaiting = root.getByRole('button', {
		name: 'Send without waiting'
	});
	if (await sendWithoutWaiting.isVisible().catch(() => false)) {
		await sendWithoutWaiting.click();
	}
	await expect(
		root.getByText('Here is a mocked answer with a source.')
	).toBeVisible({ timeout: 30_000 });

	await root.getByRole('button', { name: 'Start voice call' }).click();
	await expect(root.locator('.docsbot-voice-call-view')).toBeVisible();
	await expect(
		root.getByText('Welcome to the accessibility demo.')
	).toBeVisible();
	await expect(root.getByText('What can you do?')).toBeVisible();
	await expect(
		root.getByText('Here is a mocked answer with a source.')
	).toBeVisible();
	await expect(
		root.locator('.docsbot-voice-conversation-message.is-history')
	).toHaveCount(3);
	await expect(
		root.locator(
			'.docsbot-voice-conversation-message.is-history .docsbot-chat-bot-message'
		)
	).toHaveCount(2);
	await expect(
		root.locator(
			'.docsbot-voice-conversation-message.is-history .docsbot-user-chat-message'
		)
	).toHaveCount(1);
	await expect(root.locator('.docsbot-voice-transcript')).toHaveCount(0);

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

test('voice custom and support callbacks receive complete canonical history', async ({
	page
}) => {
	test.setTimeout(120_000);
	await installVoiceBrowserMocks(page);
	await installWidgetMocks(page, {
		...mockWidgetConfig,
		useVoiceAgent: true,
		useCustomButtons: true,
		useEscalation: true,
		color: '#7c3aed'
	});

	await page.goto('/');
	await remountWithVoiceCallbackSpies(page);
	const root = page.locator('#docsbotai-root');
	await root.getByRole('button', { name: 'Help' }).click();
	await root.getByRole('button', { name: 'Start voice call' }).click();
	await expect(root.locator('.docsbot-voice-call-view')).toBeVisible();

	await page.evaluate(() => {
		window.__emitDocsBotVoiceEvent({
			type: 'conversation.item.input_audio_transcription.completed',
			item_id: 'callback-caller',
			transcript: 'Show my account options.'
		});
		window.__emitDocsBotVoiceEvent({
			type: 'response.output_audio_transcript.done',
			item_id: 'callback-agent',
			transcript: 'I found your account options.'
		});
		window.__emitDocsBotVoiceEvent({
			type: 'conversation.item.created',
			item: {
				id: 'callback-action-item',
				call_id: 'callback-action',
				type: 'function_call_output',
				output: JSON.stringify({
					client_action: {
						type: 'custom_button',
						buttonText: 'Open account',
						functionKey: 'account_settings'
					}
				})
			}
		});
		window.__emitDocsBotVoiceEvent({
			type: 'response.output_audio_transcript.done',
			item_id: 'callback-agent-handoff',
			transcript: 'Use the account button on screen.'
		});
	});

	const customActionButton = root.getByRole('button', {
		name: 'Open account'
	});
	await expect(customActionButton).toBeVisible();
	// Voice custom_button is button-only; no client_action confirmation bubble.
	await expect(root.getByText('Open account settings.')).toHaveCount(0);
	const customActionRow = root.locator('.docsbot-custom-button-cta-row').filter({
		has: customActionButton
	});
	await expect(customActionRow).toBeVisible();

	await customActionButton.click();
	await expect
		.poll(() =>
			page.evaluate(() => window.__docsbotVoiceCustomCallback || null)
		)
		.toMatchObject({
			key: 'account_settings',
			history: [
				{ role: 'user', message: 'Show my account options.' },
				{
					role: 'assistant',
					message: 'I found your account options.'
				},
				{
					role: 'assistant',
					message: 'Use the account button on screen.'
				}
			]
		});

	await page.evaluate(() => {
		window.__emitDocsBotVoiceEvent({
			type: 'conversation.item.created',
			item: {
				id: 'callback-support-item',
				call_id: 'callback-support',
				type: 'function_call_output',
				output: JSON.stringify({
					client_action: {
						type: 'support_escalation',
						responses: { yes: 'Yes, please', no: 'No, thanks' }
					}
				})
			}
		});
		window.__emitDocsBotVoiceEvent({
			type: 'response.output_audio_transcript.done',
			item_id: 'callback-support-handoff',
			transcript: 'I can connect you with a person now.'
		});
	});

	await root.getByRole('button', { name: 'Yes, please' }).click();
	await expect
		.poll(() =>
			page.evaluate(() => window.__docsbotVoiceSupportCallback || null)
		)
		.toMatchObject({
			history: [
				{ role: 'user', message: 'Show my account options.' },
				{
					role: 'assistant',
					message: 'I found your account options.'
				},
				{
					role: 'assistant',
					message: 'Use the account button on screen.'
				},
				{
					role: 'assistant',
					message: 'I can connect you with a person now.'
				}
			],
			ticket: {
				subject: 'Voice escalation',
				message: 'Caller requested human support.'
			}
		});
});

test('voice support escalation: No stays on call; Yes ends call', async ({
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
	await root.getByRole('button', { name: 'Start voice call' }).click();
	await expect(root.locator('.docsbot-voice-call-view')).toBeVisible();

	await page.evaluate(() => {
		window.__emitDocsBotVoiceEvent({
			type: 'response.output_audio_transcript.done',
			item_id: 'agent-escalation-ask',
			transcript: 'Would you like me to connect you with support?'
		});
		window.__emitDocsBotVoiceEvent({
			type: 'conversation.item.created',
			item: {
				id: 'escalation-item',
				call_id: 'call-support',
				type: 'function_call_output',
				output: JSON.stringify({
					status: 'ok',
					client_action: {
						type: 'support_escalation',
						responses: { yes: 'Yes, please', no: 'No, thanks' }
					}
				})
			}
		});
	});

	await expect(
		root.getByText('Would you like me to connect you with support?')
	).toBeVisible();
	// Buttons wait for the post-tool spoken reply.
	await expect(
		root.getByRole('button', { name: 'Yes, please' })
	).toHaveCount(0);

	await page.evaluate(() => {
		window.__emitDocsBotVoiceEvent({
			type: 'response.output_audio_transcript.done',
			item_id: 'agent-escalation-reply',
			transcript: 'I can connect you with a human if you want.'
		});
	});

	const yesButton = root.getByRole('button', { name: 'Yes, please' });
	const noButton = root.getByRole('button', { name: 'No, thanks' });
	await expect(yesButton).toBeVisible();
	await expect(noButton).toBeVisible();

	await noButton.click();
	await expect(root.locator('.docsbot-voice-call-view')).toBeVisible();
	await expect(yesButton).toHaveCount(0);
	await expect(noButton).toHaveCount(0);
	await expect(root.getByText('No, thanks')).toBeVisible();

	const sentEvents = await page.evaluate(() =>
		(window.__docsbotVoiceSentEvents || []).map((raw) => JSON.parse(raw))
	);
	expect(sentEvents).toEqual([
		{ type: 'response.cancel' },
		{
			type: 'conversation.item.create',
			item: {
				type: 'message',
				role: 'user',
				content: [{ type: 'input_text', text: 'No, thanks' }]
			}
		},
		{ type: 'response.create' }
	]);

	// Re-show escalation for the Yes path.
	await page.evaluate(() => {
		window.__docsbotVoiceSentEvents.length = 0;
		window.__emitDocsBotVoiceEvent({
			type: 'conversation.item.created',
			item: {
				id: 'escalation-item-2',
				call_id: 'call-support-yes',
				type: 'function_call_output',
				output: JSON.stringify({
					status: 'ok',
					client_action: {
						type: 'support_escalation',
						responses: { yes: 'Yes, please', no: 'No, thanks' }
					}
				})
			}
		});
		window.__emitDocsBotVoiceEvent({
			type: 'response.output_audio_transcript.done',
			item_id: 'agent-escalation-yes-reply',
			transcript: 'Shall I connect you now?'
		});
	});
	await expect(
		root.getByRole('button', { name: 'Yes, please' })
	).toBeVisible();
	await expect
		.poll(() => readPersistedCallbackHistory(page))
		.toEqual([
			{
				role: 'assistant',
				message: 'Would you like me to connect you with support?'
			},
			{
				role: 'assistant',
				message: 'I can connect you with a human if you want.'
			},
			{ role: 'user', message: 'No, thanks' },
			{ role: 'assistant', message: 'Shall I connect you now?' }
		]);
	await root.getByRole('button', { name: 'Yes, please' }).click();
	await expect(root.locator('.docsbot-voice-call-view')).toHaveCount(0);
	const escalateRequest = await page.evaluate(
		() => window.__docsbotEscalateRequest
	);
	expect(escalateRequest?.method).toBe('PUT');
	expect(escalateRequest?.url).toContain('/escalate');
});

test('DocsBotAI.startVoiceCall opens the widget into live voice mode', async ({
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
	await expect(root.getByRole('button', { name: 'Help' })).toBeVisible();

	const started = await page.evaluate(() => DocsBotAI.startVoiceCall());
	expect(started).toBe(true);

	await expect(root.getByRole('button', { name: 'Mute' })).toBeVisible();
	await expect(root.getByRole('button', { name: 'End call' })).toBeVisible();
	await expect(root.locator('.docsbot-voice-orb')).toBeVisible();
	const voiceRequest = await page.evaluate(
		() => window.__docsbotVoiceRequest
	);
	expect(voiceRequest?.body).toContain('playwright-offer');
});

test('DocsBotAI.startVoiceCall works in #docsbot-widget-embed', async ({
	page
}) => {
	test.setTimeout(120_000);
	await installVoiceBrowserMocks(page);
	await installWidgetMocks(page, {
		...mockWidgetConfig,
		useVoiceAgent: true,
		color: '#7c3aed'
	});

	await page.goto('/?embedded=1');
	const root = page.locator('#docsbot-widget-embed');
	await expect(root.locator('textarea')).toBeVisible();

	const started = await page.evaluate(() => DocsBotAI.startVoiceCall());
	expect(started).toBe(true);

	await expect(root.getByRole('button', { name: 'Mute' })).toBeVisible();
	await expect(root.getByRole('button', { name: 'End call' })).toBeVisible();
	await expect(root.locator('.docsbot-voice-orb')).toBeVisible();
	const voiceRequest = await page.evaluate(
		() => window.__docsbotVoiceRequest
	);
	expect(voiceRequest?.body).toContain('playwright-offer');
});
