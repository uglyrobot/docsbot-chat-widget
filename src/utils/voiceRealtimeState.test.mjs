import assert from 'node:assert/strict';
import test from 'node:test';
import {
	VOICE_CALL_STATUS,
	createVoiceRealtimeState,
	finalVoiceTranscriptFromEvent,
	orderedVoiceTranscripts,
	reduceVoiceRealtimeEvent,
	voiceClientActionFromEvent,
	voiceToolNameFromEvent
} from './voiceRealtimeState.mjs';

test('Realtime events map to every visible voice-call state', () => {
	let state = createVoiceRealtimeState();
	assert.equal(state.status, VOICE_CALL_STATUS.CONNECTING);
	state = reduceVoiceRealtimeEvent(state, {
		type: 'input_audio_buffer.speech_started'
	});
	assert.equal(state.status, VOICE_CALL_STATUS.USER_SPEAKING);
	state = reduceVoiceRealtimeEvent(state, {
		type: 'input_audio_buffer.speech_stopped'
	});
	assert.equal(state.status, VOICE_CALL_STATUS.THINKING);
	state = reduceVoiceRealtimeEvent(state, {
		type: 'response.output_item.added',
		item: {
			id: 'tool-1',
			type: 'function_call',
			name: 'search_documentation'
		}
	});
	assert.equal(state.status, VOICE_CALL_STATUS.USING_TOOL);
	state = reduceVoiceRealtimeEvent(state, {
		type: 'response.output_audio_transcript.delta',
		item_id: 'agent-1',
		delta: 'Hello'
	});
	assert.equal(state.status, VOICE_CALL_STATUS.AGENT_SPEAKING);
	state = reduceVoiceRealtimeEvent(state, { type: 'response.done' });
	assert.equal(state.status, VOICE_CALL_STATUS.LISTENING);
	state = reduceVoiceRealtimeEvent(state, { type: 'error' });
	assert.equal(state.status, VOICE_CALL_STATUS.ERROR);
});

test('asynchronous caller and agent transcripts reconcile by item_id', () => {
	let state = createVoiceRealtimeState();
	state = reduceVoiceRealtimeEvent(state, {
		type: 'input_audio_buffer.speech_started',
		item_id: 'caller-1'
	});
	state = reduceVoiceRealtimeEvent(state, {
		type: 'response.output_item.added',
		item: { id: 'agent-1', type: 'message', role: 'assistant' }
	});
	state = reduceVoiceRealtimeEvent(state, {
		type: 'response.output_audio_transcript.delta',
		item_id: 'agent-1',
		delta: 'The '
	});
	state = reduceVoiceRealtimeEvent(state, {
		type: 'conversation.item.input_audio_transcription.completed',
		item_id: 'caller-1',
		transcript: 'What is the return policy?'
	});
	state = reduceVoiceRealtimeEvent(state, {
		type: 'response.output_audio_transcript.delta',
		item_id: 'agent-1',
		delta: 'answer'
	});
	state = reduceVoiceRealtimeEvent(state, {
		type: 'response.output_audio_transcript.done',
		item_id: 'agent-1',
		transcript: 'The answer is here.'
	});

	assert.deepEqual(orderedVoiceTranscripts(state), [
		{
			itemId: 'caller-1',
			role: 'caller',
			text: 'What is the return policy?',
			isFinal: true
		},
		{
			itemId: 'agent-1',
			role: 'agent',
			text: 'The answer is here.',
			isFinal: true
		}
	]);
	assert.deepEqual(
		finalVoiceTranscriptFromEvent({
			type: 'conversation.item.input_audio_transcription.completed',
			item_id: 'caller-1',
			transcript: '  Final caller text  '
		}),
		{ itemId: 'caller-1', role: 'caller', text: 'Final caller text' }
	);
});

test('tool state accepts only a safe name and never retains internals', () => {
	const event = {
		type: 'response.output_item.added',
		item: {
			id: 'tool-1',
			type: 'function_call',
			name: 'search_documentation',
			arguments: '{"credential":"do-not-show"}',
			output: 'private retrieval context'
		}
	};
	const state = reduceVoiceRealtimeEvent(createVoiceRealtimeState(), event);
	assert.equal(voiceToolNameFromEvent(event), 'search_documentation');
	assert.equal(state.activeToolName, 'search_documentation');
	assert.doesNotMatch(JSON.stringify(state), /credential|retrieval context/);
	assert.equal(
		voiceToolNameFromEvent({
			...event,
			item: { ...event.item, name: 'unsafe function name!' }
		}),
		''
	);
});

test('voiceClientActionFromEvent whitelists booking, custom_button, support, and stripe handoffs', () => {
	assert.deepEqual(
		voiceClientActionFromEvent({
			type: 'conversation.item.created',
			item: {
				id: 'item-booking',
				call_id: 'call-booking',
				type: 'function_call_output',
				output: JSON.stringify({
					status: 'ok',
					result: 'secret retrieval',
					client_action: {
						type: 'calendly',
						message: 'Book a demo when you are ready.',
						eventPath: 'docsbot/demo',
						hideEventDetails: true,
						voice_message: "I've opened the booking calendar."
					}
				})
			}
		}),
		{
			kind: 'booking',
			callId: 'call-booking',
			type: 'calendly',
			message: 'Book a demo when you are ready.',
			eventPath: 'docsbot/demo',
			hideEventDetails: true,
			hideCookieBanner: false,
			hideEventDetail: false
		}
	);

	assert.deepEqual(
		voiceClientActionFromEvent({
			type: 'conversation.item.done',
			item: {
				id: 'item-button',
				call_id: 'call-button',
				type: 'function_call_output',
				output: JSON.stringify({
					status: 'ok',
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
		}),
		{
			kind: 'custom_button',
			callId: 'call-button',
			type: 'custom_button',
			message: 'Open your account settings.',
			url: 'https://example.com/account',
			functionKey: 'account',
			buttonText: 'Open account'
		}
	);

	assert.deepEqual(
		voiceClientActionFromEvent({
			type: 'conversation.item.created',
			item: {
				call_id: 'call-support',
				type: 'function_call_output',
				output: JSON.stringify({
					client_action: {
						type: 'support_escalation',
						message: 'Would you like support?',
						responses: { yes: 'Yes, please', no: 'No, thanks' },
						voice_message: 'Would you like support?'
					}
				})
			}
		}),
		{
			kind: 'support_escalation',
			callId: 'call-support',
			type: 'support_escalation',
			message: 'Would you like support?',
			responses: { yes: 'Yes, please', no: 'No, thanks' }
		}
	);

	assert.deepEqual(
		voiceClientActionFromEvent({
			type: 'conversation.item.created',
			item: {
				call_id: 'call-stripe',
				type: 'function_call_output',
				output: JSON.stringify({
					status: 'ok',
					result: { secret: 'must-not-leak' },
					client_action: {
						type: 'stripe_billing',
						voice_message: 'Here are your recent invoices.',
						stripeBilling: [
							{
								type: 'invoices',
								items: [
									{
										id: 'in_123',
										invoiceNumber: 'INV-1',
										status: 'paid',
										amountPaid: '10.00',
										currency: 'usd',
										createdAt: '2026-01-01T00:00:00.000Z'
									}
								]
							}
						]
					}
				})
			}
		}),
		{
			kind: 'stripe_billing',
			callId: 'call-stripe',
			type: 'stripe_billing',
			message: 'Here are your recent invoices.',
			stripeBilling: [
				{
					type: 'invoices',
					items: [
						{
							id: 'in_123',
							invoiceNumber: 'INV-1',
							status: 'paid',
							amountPaid: '10.00',
							currency: 'usd',
							createdAt: '2026-01-01T00:00:00.000Z'
						}
					]
				}
			]
		}
	);
});

test('voiceClientActionFromEvent ignores unknown or unsafe handoffs', () => {
	assert.equal(
		voiceClientActionFromEvent({
			type: 'conversation.item.created',
			item: {
				call_id: 'call-unknown',
				type: 'function_call_output',
				output: JSON.stringify({
					client_action: {
						type: 'mystery_widget',
						payload: { secret: 'nope' }
					}
				})
			}
		}),
		null
	);
	assert.equal(
		voiceClientActionFromEvent({
			type: 'conversation.item.created',
			item: {
				call_id: 'call-incomplete',
				type: 'function_call_output',
				output: JSON.stringify({
					client_action: {
						type: 'calendly',
						message: 'Missing path'
					}
				})
			}
		}),
		null
	);
	assert.equal(
		voiceClientActionFromEvent({
			type: 'response.output_item.done',
			item: {
				call_id: 'call-wrong-event',
				type: 'function_call_output',
				output: JSON.stringify({
					client_action: {
						type: 'custom_button',
						buttonText: 'Go',
						url: 'https://example.com'
					}
				})
			}
		}),
		null
	);
	assert.equal(
		voiceClientActionFromEvent({
			type: 'conversation.item.created',
			item: {
				call_id: 'call-empty-stripe',
				type: 'function_call_output',
				output: JSON.stringify({
					client_action: {
						type: 'stripe_billing',
						stripeBilling: [{ type: 'invoices', items: [] }]
					}
				})
			}
		}),
		null
	);

	const secretEvent = {
		type: 'conversation.item.created',
		item: {
			call_id: 'call-docs',
			type: 'function_call_output',
			output: JSON.stringify({
				status: 'ok',
				result: { credential: 'must-not-leak' },
				client_action: {
					type: 'custom_button',
					buttonText: 'Pricing',
					url: 'https://example.com/pricing',
					functionKey: 'pricing',
					message: 'See pricing.'
				}
			})
		}
	};
	const action = voiceClientActionFromEvent(secretEvent);
	assert.equal(action?.buttonText, 'Pricing');
	assert.doesNotMatch(JSON.stringify(action), /must-not-leak|credential/);
});
