import assert from 'node:assert/strict';
import test from 'node:test';
import { buildVoiceCallHistoryItems } from './voiceCallHistory.mjs';

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
