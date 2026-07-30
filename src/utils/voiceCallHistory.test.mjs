import assert from 'node:assert/strict';
import test from 'node:test';
import {
	buildVoiceCallHistoryItems,
	composeVoiceConversationGroups,
	flushPendingVoiceActions,
	interleaveVoiceLiveItems,
	mergeVoiceLookupSourcesIntoMessages,
	queuePendingVoiceAction,
	upsertVoiceTranscriptHistory
} from './voiceCallHistory.mjs';

test('upsertVoiceTranscriptHistory appends canonical callback history in voice order', () => {
	const initial = [
		{ role: 'user', message: 'Prior text question' },
		{ role: 'assistant', message: 'Prior text answer' }
	];
	const caller = upsertVoiceTranscriptHistory(initial, {}, {
		itemId: 'caller-1',
		role: 'caller',
		text: 'Voice question'
	});
	const agent = upsertVoiceTranscriptHistory(
		caller.history,
		caller.itemIndices,
		{
			itemId: 'agent-1',
			role: 'agent',
			text: 'Voice answer'
		}
	);

	assert.deepEqual(agent.history, [
		{ role: 'user', message: 'Prior text question' },
		{ role: 'assistant', message: 'Prior text answer' },
		{ role: 'user', message: 'Voice question' },
		{ role: 'assistant', message: 'Voice answer' }
	]);
	assert.deepEqual(agent.itemIndices, {
		'caller-1': 2,
		'agent-1': 3
	});
	assert.deepEqual(initial, [
		{ role: 'user', message: 'Prior text question' },
		{ role: 'assistant', message: 'Prior text answer' }
	]);
});

test('upsertVoiceTranscriptHistory reconciles repeated final transcript events', () => {
	const first = upsertVoiceTranscriptHistory([], {}, {
		itemId: 'agent-1',
		role: 'agent',
		text: 'Partial final'
	});
	const corrected = upsertVoiceTranscriptHistory(
		first.history,
		first.itemIndices,
		{
			itemId: 'agent-1',
			role: 'agent',
			text: 'Corrected final transcript'
		}
	);

	assert.deepEqual(corrected.history, [
		{ role: 'assistant', message: 'Corrected final transcript' }
	]);
	assert.deepEqual(corrected.itemIndices, { 'agent-1': 0 });
});

test('upsertVoiceTranscriptHistory ignores invalid transcript payloads', () => {
	const history = [{ role: 'user', message: 'Existing' }];
	const indices = { existing: 0 };
	const result = upsertVoiceTranscriptHistory(history, indices, {
		itemId: '',
		role: 'caller',
		text: 'Ignored'
	});

	assert.equal(result.history, history);
	assert.equal(result.itemIndices, indices);
});

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
	assert.equal(items[0].message.message, 'Welcome');
	assert.equal(items[1].message.variant, 'user');
	assert.equal(
		items[2].message.message,
		'DocsBot answers from your docs.'
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

test('buildVoiceCallHistoryItems keeps lookup_answer sources as attachable actions', () => {
	const items = buildVoiceCallHistoryItems({
		user1: {
			id: 'user1',
			variant: 'user',
			message: 'What is pricing?'
		},
		bot1: {
			id: 'bot1',
			variant: 'chatbot',
			message: 'Here is what I found.'
		},
		sources: {
			id: 'sources',
			variant: 'chatbot',
			type: 'lookup_answer',
			message: '',
			sources: [{ title: 'Pricing', url: 'https://example.com/pricing' }]
		}
	});

	assert.deepEqual(
		items.map((item) =>
			item.kind === 'transcript'
				? { kind: item.kind, id: item.id }
				: {
						kind: item.kind,
						id: item.id,
						type: item.message.type,
						sourceCount: item.message.sources.length
					}
		),
		[
			{ kind: 'transcript', id: 'user1' },
			{ kind: 'transcript', id: 'bot1' },
			{
				kind: 'action',
				id: 'sources',
				type: 'lookup_answer',
				sourceCount: 1
			}
		]
	);
});

test('mergeVoiceLookupSourcesIntoMessages attaches lookup rows to the next spoken agent turn', () => {
	const merged = mergeVoiceLookupSourcesIntoMessages({
		user1: {
			id: 'user1',
			variant: 'user',
			message: 'What is pricing?'
		},
		// Tool result is inserted before the spoken answer lands.
		sources: {
			id: 'sources',
			variant: 'chatbot',
			type: 'lookup_answer',
			message: '',
			sources: [{ title: 'Pricing', url: 'https://example.com/pricing' }]
		},
		agent1: {
			id: 'agent1',
			variant: 'chatbot',
			message: 'Pricing starts at $99.',
			voiceCall: true
		}
	});

	assert.deepEqual(Object.keys(merged), ['user1', 'agent1']);
	assert.deepEqual(merged.agent1.sources, [
		{ title: 'Pricing', url: 'https://example.com/pricing' }
	]);
	assert.equal(merged.agent1.message, 'Pricing starts at $99.');
});

test('mergeVoiceLookupSourcesIntoMessages falls back to the prior agent turn', () => {
	const merged = mergeVoiceLookupSourcesIntoMessages({
		agent1: {
			id: 'agent1',
			variant: 'chatbot',
			message: 'Pricing starts at $99.'
		},
		sources: {
			id: 'sources',
			variant: 'chatbot',
			type: 'lookup_answer',
			message: '',
			sources: [{ title: 'Pricing', url: 'https://example.com/pricing' }]
		}
	});

	assert.deepEqual(Object.keys(merged), ['agent1']);
	assert.deepEqual(merged.agent1.sources, [
		{ title: 'Pricing', url: 'https://example.com/pricing' }
	]);
});

test('composeVoiceConversationGroups merges lookup sources into the prior agent turn', () => {
	const groups = composeVoiceConversationGroups([
		{
			id: 'agent-1',
			message: {
				id: 'agent-1',
				variant: 'chatbot',
				message: 'Pricing starts at $99.'
			}
		},
		{
			id: 'voice-action-lookup',
			message: {
				id: 'voice-action-lookup',
				variant: 'chatbot',
				type: 'lookup_answer',
				message: '',
				sources: [{ title: 'Pricing', url: 'https://example.com/pricing' }]
			}
		}
	]);

	assert.equal(groups.length, 1);
	assert.equal(groups[0].id, 'agent-1');
	assert.equal(groups[0].attachments.length, 0);
	assert.deepEqual(groups[0].message.sources, [
		{ title: 'Pricing', url: 'https://example.com/pricing' }
	]);
	assert.equal(groups[0].message.message, 'Pricing starts at $99.');
});

test('composeVoiceConversationGroups keeps escalation controls on the agent turn', () => {
	const groups = composeVoiceConversationGroups([
		{
			id: 'agent-1',
			message: {
				id: 'agent-1',
				variant: 'chatbot',
				message: 'Want me to connect you with support?'
			}
		},
		{
			id: 'voice-action-support',
			message: {
				id: 'voice-action-support',
				variant: 'chatbot',
				type: 'support_escalation',
				message: '',
				responses: { yes: 'Yes', no: 'No' }
			}
		},
		{
			id: 'caller-1',
			message: {
				id: 'caller-1',
				variant: 'user',
				message: 'Yes please'
			}
		}
	]);

	assert.equal(groups.length, 2);
	assert.equal(groups[0].attachments.length, 1);
	assert.equal(groups[0].attachments[0].type, 'support_escalation');
	assert.equal(groups[1].message.variant, 'user');
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
