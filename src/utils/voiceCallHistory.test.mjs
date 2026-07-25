import assert from 'node:assert/strict';
import test from 'node:test';
import {
	buildVoiceCallHistoryItems,
	flushPendingVoiceActions,
	interleaveVoiceLiveItems,
	queuePendingVoiceAction
} from './voiceCallHistory.mjs';

test('buildVoiceCallHistoryItems maps prior chat into appendable voice entries', () => {
	const items = buildVoiceCallHistoryItems({
		greet: {
			id: 'greet',
			variant: 'chatbot',
			message: 'Welcome'
		},
		user1: {
			id: 'user1',
			variant: 'user',
			message: 'What is DocsBot?'
		},
		bot1: {
			id: 'bot1',
			variant: 'chatbot',
			message: 'DocsBot answers from your docs.'
		},
		loading: {
			id: 'loading',
			variant: 'chatbot',
			message: '',
			loading: true
		},
		lead: {
			id: 'lead',
			variant: 'chatbot',
			type: 'lead_collect',
			message: 'Please share your email'
		},
		button: {
			id: 'button',
			variant: 'chatbot',
			type: 'custom_button',
			message: 'Open settings',
			customButton: {
				url: 'https://example.com',
				buttonText: 'Open'
			}
		}
	});

	assert.deepEqual(
		items.map((item) =>
			item.kind === 'transcript'
				? { kind: item.kind, id: item.id, role: item.role, text: item.text }
				: { kind: item.kind, id: item.id, type: item.message.type }
		),
		[
			{ kind: 'transcript', id: 'greet', role: 'agent', text: 'Welcome' },
			{
				kind: 'transcript',
				id: 'user1',
				role: 'caller',
				text: 'What is DocsBot?'
			},
			{
				kind: 'transcript',
				id: 'bot1',
				role: 'agent',
				text: 'DocsBot answers from your docs.'
			},
			{ kind: 'action', id: 'button', type: 'custom_button' }
		]
	);
});

test('buildVoiceCallHistoryItems tolerates empty or invalid message maps', () => {
	assert.deepEqual(buildVoiceCallHistoryItems(null), []);
	assert.deepEqual(buildVoiceCallHistoryItems([]), []);
	assert.deepEqual(buildVoiceCallHistoryItems(undefined), []);
});

test('buildVoiceCallHistoryItems omits greeting-only chats so the model can greet', () => {
	assert.deepEqual(
		buildVoiceCallHistoryItems({
			greet: {
				id: 'greet',
				variant: 'chatbot',
				message: 'What can I help you with?'
			}
		}),
		[]
	);
	assert.deepEqual(
		buildVoiceCallHistoryItems({
			greet: {
				id: 'greet',
				variant: 'chatbot',
				message: 'What can I help you with?'
			},
			loading: {
				id: 'loading',
				variant: 'chatbot',
				message: '',
				loading: true
			}
		}),
		[]
	);
});

test('interleaveVoiceLiveItems keeps tool cards anchored before later transcripts', () => {
	const transcripts = [
		{ itemId: 'caller-1', role: 'caller', text: 'Book a demo' },
		{ itemId: 'agent-1', role: 'agent', text: 'Opening the calendar.' },
		{ itemId: 'caller-2', role: 'caller', text: 'Tuesday works.' },
		{ itemId: 'agent-2', role: 'agent', text: 'Sounds good.' }
	];
	const actions = [
		{
			id: 'voice-action-booking',
			afterItemId: 'agent-1',
			message: { id: 'voice-action-booking', type: 'calendly' }
		}
	];

	assert.deepEqual(
		interleaveVoiceLiveItems(transcripts, actions).map((item) =>
			item.kind === 'transcript'
				? { kind: item.kind, id: item.id }
				: { kind: item.kind, id: item.id }
		),
		[
			{ kind: 'transcript', id: 'caller-1' },
			{ kind: 'transcript', id: 'agent-1' },
			{ kind: 'action', id: 'voice-action-booking' },
			{ kind: 'transcript', id: 'caller-2' },
			{ kind: 'transcript', id: 'agent-2' }
		]
	);
});

test('interleaveVoiceLiveItems places unanchored actions before live transcripts', () => {
	const items = interleaveVoiceLiveItems(
		[{ itemId: 'caller-1', role: 'caller', text: 'Hi' }],
		[
			{
				id: 'voice-action-early',
				afterItemId: null,
				message: { id: 'voice-action-early', type: 'custom_button' }
			}
		]
	);
	assert.deepEqual(
		items.map((item) => ({ kind: item.kind, id: item.id })),
		[
			{ kind: 'action', id: 'voice-action-early' },
			{ kind: 'transcript', id: 'caller-1' }
		]
	);
});

test('queue and flush pending voice actions after the post-tool agent turn', () => {
	const pending = queuePendingVoiceAction([], {
		id: 'voice-action-support',
		type: 'support_escalation'
	});
	assert.equal(pending.length, 1);

	const deduped = queuePendingVoiceAction(pending, {
		id: 'voice-action-support',
		type: 'support_escalation',
		responses: { yes: 'Yes' }
	});
	assert.equal(deduped.length, 1);
	assert.equal(deduped[0].responses.yes, 'Yes');

	const { actions, pending: emptied } = flushPendingVoiceActions(
		[],
		deduped,
		'agent-after-tool'
	);
	assert.deepEqual(emptied, []);
	assert.deepEqual(
		actions.map((entry) => ({
			id: entry.id,
			afterItemId: entry.afterItemId
		})),
		[{ id: 'voice-action-support', afterItemId: 'agent-after-tool' }]
	);

	const interleaved = interleaveVoiceLiveItems(
		[
			{ itemId: 'agent-prompt', role: 'agent', text: 'Want support?' },
			{
				itemId: 'agent-after-tool',
				role: 'agent',
				text: 'I can connect you.'
			}
		],
		actions
	);
	assert.deepEqual(
		interleaved.map((item) => ({ kind: item.kind, id: item.id })),
		[
			{ kind: 'transcript', id: 'agent-prompt' },
			{ kind: 'transcript', id: 'agent-after-tool' },
			{ kind: 'action', id: 'voice-action-support' }
		]
	);
});
