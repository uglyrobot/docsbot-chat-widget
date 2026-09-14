import assert from 'node:assert/strict';
import test from 'node:test';
import {
	buildVoiceCallHistoryItems,
	composeVoiceConversationGroups,
	finalizeVoiceTranscriptsWithSources,
	flushPendingVoiceActions,
	interleaveVoiceLiveItems,
	mergeVoiceLookupSourcesIntoMessages,
	orderVoiceHangupMessages,
	queuePendingVoiceAction,
	queuePendingVoiceLookupSources,
	takePendingVoiceLookupSourcesForAgent,
	upsertVoiceTranscriptHistory,
	upsertVoiceTranscriptMessageMap
} from './voiceCallHistory.mjs';

test('upsertVoiceTranscriptHistory appends canonical callback history in voice order', () => {
	const initial = [
		{ role: 'user', message: 'Prior text question' },
		{ role: 'assistant', message: 'Prior text answer' }
	];
	const order = ['caller-1', 'agent-1'];
	const caller = upsertVoiceTranscriptHistory(
		initial,
		{},
		{
			itemId: 'caller-1',
			role: 'caller',
			text: 'Voice question'
		},
		order
	);
	const agent = upsertVoiceTranscriptHistory(
		caller.history,
		caller.itemIndices,
		{
			itemId: 'agent-1',
			role: 'agent',
			text: 'Voice answer'
		},
		order
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

test('upsertVoiceTranscriptHistory inserts late caller finals before agent by transcriptOrder', () => {
	const order = ['caller-1', 'agent-1'];
	const agentFirst = upsertVoiceTranscriptHistory(
		[],
		{},
		{
			itemId: 'agent-1',
			role: 'agent',
			text: 'Voice answer'
		},
		order
	);
	const withCaller = upsertVoiceTranscriptHistory(
		agentFirst.history,
		agentFirst.itemIndices,
		{
			itemId: 'caller-1',
			role: 'caller',
			text: 'Voice question'
		},
		order
	);

	assert.deepEqual(withCaller.history, [
		{ role: 'user', message: 'Voice question' },
		{ role: 'assistant', message: 'Voice answer' }
	]);
	assert.deepEqual(withCaller.itemIndices, {
		'caller-1': 0,
		'agent-1': 1
	});
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

test('upsertVoiceTranscriptMessageMap inserts late caller before agent bubble', () => {
	const withAgent = upsertVoiceTranscriptMessageMap(
		{},
		{
			messageId: 'voice-agent-1',
			itemId: 'agent-1',
			transcriptOrder: ['caller-1', 'agent-1'],
			payload: {
				id: 'voice-agent-1',
				variant: 'chatbot',
				message: 'Voice answer',
				realtimeItemId: 'agent-1'
			}
		}
	);
	const withCaller = upsertVoiceTranscriptMessageMap(withAgent, {
		messageId: 'voice-caller-1',
		itemId: 'caller-1',
		transcriptOrder: ['caller-1', 'agent-1'],
		payload: {
			id: 'voice-caller-1',
			variant: 'user',
			message: 'Voice question',
			realtimeItemId: 'caller-1'
		}
	});

	assert.deepEqual(Object.keys(withCaller), [
		'voice-caller-1',
		'voice-agent-1'
	]);
	assert.equal(withCaller['voice-caller-1'].message, 'Voice question');
	assert.equal(withCaller['voice-agent-1'].message, 'Voice answer');
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

test('mergeVoiceLookupSourcesIntoMessages preserves text answers before feedback prompts', () => {
	const messages = {
		user1: {
			id: 'user1',
			variant: 'user',
			message: 'Can DocsBot learn from support tickets?'
		},
		answer1: {
			id: 'answer1',
			variant: 'chatbot',
			type: 'lookup_answer',
			message: 'DocsBot can learn from closed support tickets.',
			sources: [
				{
					title: 'Training from support tickets',
					url: 'https://example.com/support-tickets'
				}
			]
		},
		feedback1: {
			id: 'feedback1',
			variant: 'chatbot',
			type: 'is_resolved_question',
			message: 'Did that answer your question?',
			responses: { yes: 'Yes', no: 'No' }
		}
	};

	const merged = mergeVoiceLookupSourcesIntoMessages(messages);

	assert.equal(merged, messages);
	assert.equal(merged.answer1.message, messages.answer1.message);
	assert.deepEqual(merged.answer1.sources, messages.answer1.sources);
	assert.equal(merged.feedback1.sources, undefined);
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

test('repeated voice actions can anchor after the latest caller turn', () => {
	const transcripts = [
		{ itemId: 'agent-before', role: 'agent', text: 'Would you like help?' },
		{ itemId: 'caller-again', role: 'caller', text: 'Ask me again.' }
	];
	const first = {
		id: 'voice-action-first',
		message: { id: 'voice-action-first', type: 'support_escalation' },
		afterItemId: 'agent-before'
	};
	const { actions } = flushPendingVoiceActions(
		[first],
		[
			{
				id: 'voice-action-second',
				type: 'support_escalation'
			}
		],
		'caller-again'
	);

	assert.deepEqual(
		interleaveVoiceLiveItems(transcripts, actions).map((entry) => entry.id),
		[
			'agent-before',
			'voice-action-first',
			'caller-again',
			'voice-action-second'
		]
	);
});

test('takePendingVoiceLookupSourcesForAgent does not dump sources onto an earlier agent', () => {
	const pending = queuePendingVoiceLookupSources([], {
		callId: 'lookup-1',
		sources: [{ title: 'Pricing', url: 'https://example.com/pricing' }],
		afterItemId: 'caller-1',
		afterRole: 'caller'
	});
	const order = ['agent-greeting', 'caller-1', 'agent-answer'];

	const greeting = takePendingVoiceLookupSourcesForAgent(pending, {
		itemId: 'agent-greeting',
		transcriptOrder: order
	});
	assert.equal(greeting.sources, null);
	assert.equal(greeting.pending.length, 1);

	const answer = takePendingVoiceLookupSourcesForAgent(greeting.pending, {
		itemId: 'agent-answer',
		transcriptOrder: order
	});
	assert.deepEqual(answer.sources, [
		{ title: 'Pricing', url: 'https://example.com/pricing' }
	]);
	assert.deepEqual(answer.pending, []);
});

test('takePendingVoiceLookupSourcesForAgent keeps sources on the anchored agent turn', () => {
	const pending = queuePendingVoiceLookupSources([], {
		callId: 'lookup-1',
		sources: [{ title: 'Pricing', url: 'https://example.com/pricing' }],
		afterItemId: 'agent-answer',
		afterRole: 'agent'
	});
	const order = ['agent-greeting', 'caller-1', 'agent-answer', 'caller-2'];

	const greeting = takePendingVoiceLookupSourcesForAgent(pending, {
		itemId: 'agent-greeting',
		transcriptOrder: order
	});
	assert.equal(greeting.sources, null);

	const answer = takePendingVoiceLookupSourcesForAgent(greeting.pending, {
		itemId: 'agent-answer',
		transcriptOrder: order
	});
	assert.deepEqual(answer.sources, [
		{ title: 'Pricing', url: 'https://example.com/pricing' }
	]);
});

test('finalizeVoiceTranscriptsWithSources keeps lookup sources on the answering turn', () => {
	const finalized = finalizeVoiceTranscriptsWithSources(
		[
			{
				itemId: 'agent-greeting',
				role: 'agent',
				text: 'Hi, how can I help?'
			},
			{
				itemId: 'caller-1',
				role: 'caller',
				text: 'What is pricing?'
			},
			{
				itemId: 'agent-answer',
				role: 'agent',
				text: 'Pricing starts at $99.'
			}
		],
		[
			{
				id: 'voice-action-lookup',
				afterItemId: 'caller-1',
				message: {
					id: 'voice-action-lookup',
					variant: 'chatbot',
					type: 'lookup_answer',
					message: '',
					sources: [
						{ title: 'Pricing', url: 'https://example.com/pricing' }
					]
				}
			}
		]
	);

	assert.equal(finalized[0].sources, undefined);
	assert.equal(finalized[1].sources, undefined);
	assert.deepEqual(finalized[2].sources, [
		{ title: 'Pricing', url: 'https://example.com/pricing' }
	]);
	assert.equal(finalized[2].itemId, 'agent-answer');
});

test('finalizeVoiceTranscriptsWithSources merges lookup sources into the prior agent turn', () => {
	const finalized = finalizeVoiceTranscriptsWithSources(
		[
			{
				itemId: 'agent-greeting',
				role: 'agent',
				text: 'Hi, how can I help?'
			},
			{
				itemId: 'agent-answer',
				role: 'agent',
				text: 'Pricing starts at $99.'
			}
		],
		[
			{
				id: 'voice-action-lookup',
				afterItemId: 'agent-answer',
				message: {
					id: 'voice-action-lookup',
					variant: 'chatbot',
					type: 'lookup_answer',
					message: '',
					sources: [
						{ title: 'Pricing', url: 'https://example.com/pricing' }
					]
				}
			}
		]
	);

	assert.equal(finalized[0].sources, undefined);
	assert.deepEqual(finalized[1].sources, [
		{ title: 'Pricing', url: 'https://example.com/pricing' }
	]);
});

test('mergeVoiceLookupSourcesIntoMessages does not attach voice sources to the widget greeting', () => {
	const merged = mergeVoiceLookupSourcesIntoMessages({
		greeting: {
			id: 'greeting',
			variant: 'chatbot',
			message: 'Welcome to the demo.'
		},
		sources: {
			id: 'sources',
			variant: 'chatbot',
			type: 'lookup_answer',
			voiceCall: true,
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

	assert.equal(merged.greeting.sources, undefined);
	assert.deepEqual(merged.agent1.sources, [
		{ title: 'Pricing', url: 'https://example.com/pricing' }
	]);
});

test('orderVoiceHangupMessages keeps current and future cards on the answering turn', () => {
	const support = {
		id: 'voice-action-support',
		variant: 'chatbot',
		type: 'support_escalation',
		voiceCall: true,
		message: '',
		responses: { yes: 'Yes', no: 'No' }
	};
	const stripe = {
		id: 'voice-action-stripe',
		variant: 'chatbot',
		type: 'stripe_billing',
		voiceCall: true,
		message: '',
		stripeBilling: [{ type: 'invoices', items: [] }]
	};
	const futureCard = {
		id: 'voice-action-future',
		variant: 'chatbot',
		type: 'new_widget_card',
		voiceCall: true,
		message: ''
	};
	const greetingTurn = {
		id: 'voice-agent-greeting',
		variant: 'chatbot',
		message: 'Hi, how can I help?',
		voiceCall: true,
		realtimeItemId: 'agent-greeting'
	};
	const callerTurn = {
		id: 'voice-caller-1',
		variant: 'user',
		message: 'I need help with billing.',
		voiceCall: true,
		realtimeItemId: 'caller-1'
	};
	const answerTurn = {
		id: 'voice-agent-answer',
		variant: 'chatbot',
		message: 'I can connect you and show invoices.',
		voiceCall: true,
		realtimeItemId: 'agent-answer'
	};
	const ordered = orderVoiceHangupMessages(
		{
			greeting: {
				id: 'greeting',
				variant: 'chatbot',
				message: 'Welcome to the demo.'
			},
			[support.id]: support,
			[stripe.id]: stripe,
			[futureCard.id]: futureCard,
			[greetingTurn.id]: greetingTurn,
			[callerTurn.id]: callerTurn,
			[answerTurn.id]: answerTurn
		},
		[
			{
				itemId: 'agent-greeting',
				role: 'agent',
				text: greetingTurn.message
			},
			{
				itemId: 'caller-1',
				role: 'caller',
				text: callerTurn.message
			},
			{
				itemId: 'agent-answer',
				role: 'agent',
				text: answerTurn.message
			}
		],
		[
			{
				id: support.id,
				afterItemId: 'agent-answer',
				message: support
			},
			{
				id: stripe.id,
				afterItemId: 'agent-answer',
				message: stripe
			},
			{
				id: futureCard.id,
				afterItemId: 'agent-answer',
				message: futureCard
			}
		]
	);

	assert.deepEqual(Object.keys(ordered), [
		'greeting',
		'voice-agent-greeting',
		'voice-caller-1',
		'voice-agent-answer',
		'voice-action-support',
		'voice-action-stripe',
		'voice-action-future'
	]);
});

test('composeVoiceConversationGroups attaches a future voice-action card to the prior agent turn', () => {
	const groups = composeVoiceConversationGroups([
		{
			id: 'agent-1',
			message: {
				id: 'agent-1',
				variant: 'chatbot',
				message: 'I can take the next step on screen.'
			}
		},
		{
			id: 'voice-action-future',
			message: {
				id: 'voice-action-future',
				variant: 'chatbot',
				type: 'new_widget_card',
				voiceCall: true,
				message: ''
			}
		}
	]);

	assert.equal(groups.length, 1);
	assert.equal(groups[0].attachments.length, 1);
	assert.equal(groups[0].attachments[0].type, 'new_widget_card');
});

