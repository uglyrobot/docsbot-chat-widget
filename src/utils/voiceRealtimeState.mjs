export const VOICE_CALL_STATUS = Object.freeze({
	CONNECTING: 'connecting',
	LISTENING: 'listening',
	USER_SPEAKING: 'user_speaking',
	THINKING: 'thinking',
	USING_TOOL: 'using_tool',
	AGENT_SPEAKING: 'agent_speaking',
	ERROR: 'error',
	ENDED: 'ended'
});

export function createVoiceRealtimeState() {
	return {
		status: VOICE_CALL_STATUS.CONNECTING,
		transcriptsById: {},
		transcriptOrder: [],
		activeToolName: '',
		error: false
	};
}

function cleanText(value) {
	return typeof value === 'string' ? value : '';
}

function eventItemId(event) {
	const value = event?.item_id || event?.item?.id;
	return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function upsertTranscript(state, { itemId, role, text, append, isFinal }) {
	if (!itemId || !role) return state;
	const existing = state.transcriptsById[itemId];
	const previousText = existing?.text || '';
	const nextText = append ? `${previousText}${text}` : text || previousText;
	const transcriptOrder = existing
		? state.transcriptOrder
		: [...state.transcriptOrder, itemId];

	return {
		...state,
		transcriptOrder,
		transcriptsById: {
			...state.transcriptsById,
			[itemId]: {
				itemId,
				role,
				text: nextText,
				isFinal: Boolean(isFinal || existing?.isFinal)
			}
		}
	};
}

export function voiceToolNameFromEvent(event) {
	const isToolItem =
		(event?.type === 'response.output_item.added' ||
			event?.type === 'response.output_item.done') &&
		event?.item?.type === 'function_call';
	if (!isToolItem) return '';
	const name =
		typeof event.item.name === 'string' ? event.item.name.trim() : '';
	if (!name || name.length > 128 || !/^[a-zA-Z0-9_.:-]+$/.test(name)) {
		return '';
	}
	return name;
}

export function finalVoiceTranscriptFromEvent(event) {
	const itemId = eventItemId(event);
	if (!itemId) return null;

	if (event?.type === 'response.output_audio_transcript.done') {
		const text = cleanText(event.transcript).trim();
		return text ? { itemId, role: 'agent', text } : null;
	}

	if (
		event?.type === 'conversation.item.input_audio_transcription.completed'
	) {
		const text = cleanText(event.transcript).trim();
		return text ? { itemId, role: 'caller', text } : null;
	}

	return null;
}

const BOOKING_CLIENT_ACTION_TYPES = new Set([
	'calendly',
	'calcom',
	'tidycal'
]);
const MAX_CLIENT_ACTION_TEXT = 4000;
const MAX_CLIENT_ACTION_PATH = 512;
const MAX_CLIENT_ACTION_URL = 2048;
const MAX_CLIENT_ACTION_KEY = 128;
const MAX_CLIENT_ACTION_BUTTON = 200;
const MAX_STRIPE_BILLING_GROUPS = 8;
const MAX_STRIPE_BILLING_ITEMS = 20;
const MAX_STRIPE_BILLING_DEPTH = 4;
const MAX_STRIPE_BILLING_KEYS = 40;
const STRIPE_BILLING_GROUP_TYPES = new Set(['invoices', 'subscriptions']);

function clampClientActionText(value, maxLength) {
	const text = cleanText(value).trim();
	if (!text) return '';
	return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function parseFunctionCallOutputPayload(rawOutput) {
	if (typeof rawOutput !== 'string' || !rawOutput.trim()) return null;
	try {
		const parsed = JSON.parse(rawOutput);
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
			? parsed
			: null;
	} catch {
		return null;
	}
}

function sanitizeJsonValue(value, depth = 0) {
	if (depth > MAX_STRIPE_BILLING_DEPTH) return undefined;
	if (
		value == null ||
		typeof value === 'boolean' ||
		typeof value === 'number'
	) {
		return value;
	}
	if (typeof value === 'string') {
		return clampClientActionText(value, MAX_CLIENT_ACTION_TEXT);
	}
	if (Array.isArray(value)) {
		const next = [];
		for (const entry of value.slice(0, MAX_STRIPE_BILLING_ITEMS)) {
			const sanitized = sanitizeJsonValue(entry, depth + 1);
			if (sanitized !== undefined) next.push(sanitized);
		}
		return next;
	}
	if (typeof value === 'object') {
		const next = {};
		let count = 0;
		for (const [key, entry] of Object.entries(value)) {
			if (count >= MAX_STRIPE_BILLING_KEYS) break;
			if (typeof key !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(key)) {
				continue;
			}
			const sanitized = sanitizeJsonValue(entry, depth + 1);
			if (sanitized === undefined) continue;
			next[key] = sanitized;
			count += 1;
		}
		return next;
	}
	return undefined;
}

function sanitizeBookingClientAction(action, callId) {
	const eventPath = clampClientActionText(
		action.eventPath,
		MAX_CLIENT_ACTION_PATH
	);
	if (!eventPath) return null;
	const message = clampClientActionText(
		action.message || action.voice_message,
		MAX_CLIENT_ACTION_TEXT
	);
	if (!message) return null;
	return {
		kind: 'booking',
		callId,
		type: action.type,
		message,
		eventPath,
		hideEventDetails: Boolean(action.hideEventDetails),
		hideCookieBanner: Boolean(action.hideCookieBanner),
		hideEventDetail: Boolean(action.hideEventDetail)
	};
}

function sanitizeCustomButtonClientAction(action, callId) {
	const buttonText = clampClientActionText(
		action.buttonText,
		MAX_CLIENT_ACTION_BUTTON
	);
	const functionKey = clampClientActionText(
		action.functionKey,
		MAX_CLIENT_ACTION_KEY
	);
	const url = clampClientActionText(action.url, MAX_CLIENT_ACTION_URL);
	if (!buttonText || (!url && !functionKey)) return null;
	const message = clampClientActionText(
		action.message || action.voice_message || buttonText,
		MAX_CLIENT_ACTION_TEXT
	);
	return {
		kind: 'custom_button',
		callId,
		type: 'custom_button',
		message,
		url,
		functionKey,
		buttonText
	};
}

function sanitizeSupportEscalationClientAction(action, callId) {
	const message = clampClientActionText(
		action.message || action.voice_message,
		MAX_CLIENT_ACTION_TEXT
	);
	if (!message) return null;
	const responses =
		action.responses &&
		typeof action.responses === 'object' &&
		!Array.isArray(action.responses)
			? {
					yes: clampClientActionText(
						action.responses.yes,
						MAX_CLIENT_ACTION_BUTTON
					),
					no: clampClientActionText(
						action.responses.no,
						MAX_CLIENT_ACTION_BUTTON
					)
				}
			: {};
	return {
		kind: 'support_escalation',
		callId,
		type: 'support_escalation',
		message,
		responses
	};
}

function sanitizeStripeBillingClientAction(action, callId) {
	if (!Array.isArray(action.stripeBilling) || !action.stripeBilling.length) {
		return null;
	}
	const stripeBilling = [];
	for (const group of action.stripeBilling.slice(0, MAX_STRIPE_BILLING_GROUPS)) {
		if (!group || typeof group !== 'object' || Array.isArray(group)) continue;
		const type =
			typeof group.type === 'string' ? group.type.trim() : '';
		if (!STRIPE_BILLING_GROUP_TYPES.has(type)) continue;
		if (!Array.isArray(group.items) || !group.items.length) continue;
		const items = sanitizeJsonValue(group.items);
		if (!Array.isArray(items) || !items.length) continue;
		stripeBilling.push({ type, items });
	}
	if (!stripeBilling.length) return null;
	const message = clampClientActionText(
		action.message || action.voice_message,
		MAX_CLIENT_ACTION_TEXT
	);
	return {
		kind: 'stripe_billing',
		callId,
		type: 'stripe_billing',
		message,
		stripeBilling
	};
}

/**
 * Whitelist-parse DocsBot widget visual handoffs from Realtime
 * `function_call_output` items. Raw tool output is never retained.
 */
export function voiceClientActionFromEvent(event) {
	if (
		event?.type !== 'conversation.item.created' &&
		event?.type !== 'conversation.item.done'
	) {
		return null;
	}
	const item = event.item;
	if (!item || item.type !== 'function_call_output') return null;

	const callId =
		(typeof item.call_id === 'string' && item.call_id.trim()) ||
		(typeof item.id === 'string' && item.id.trim()) ||
		'';
	if (!callId || callId.length > 128) return null;

	const payload = parseFunctionCallOutputPayload(item.output);
	const action = payload?.client_action;
	if (!action || typeof action !== 'object' || Array.isArray(action)) {
		return null;
	}

	const type = typeof action.type === 'string' ? action.type.trim() : '';
	if (BOOKING_CLIENT_ACTION_TYPES.has(type)) {
		return sanitizeBookingClientAction({ ...action, type }, callId);
	}
	if (type === 'custom_button') {
		return sanitizeCustomButtonClientAction(action, callId);
	}
	if (type === 'support_escalation') {
		return sanitizeSupportEscalationClientAction(action, callId);
	}
	if (type === 'stripe_billing') {
		return sanitizeStripeBillingClientAction(action, callId);
	}
	return null;
}

export function reduceVoiceRealtimeEvent(state, event) {
	if (!state || !event || typeof event.type !== 'string') return state;

	switch (event.type) {
		case 'input_audio_buffer.speech_started':
			return upsertTranscript(
				{
					...state,
					status: VOICE_CALL_STATUS.USER_SPEAKING,
					error: false
				},
				{
					itemId: eventItemId(event),
					role: 'caller',
					text: '',
					append: false,
					isFinal: false
				}
			);
		case 'input_audio_buffer.speech_stopped':
		case 'response.created':
			return {
				...state,
				status: VOICE_CALL_STATUS.THINKING,
				error: false
			};
		case 'response.output_audio_transcript.delta':
			return upsertTranscript(
				{
					...state,
					status: VOICE_CALL_STATUS.AGENT_SPEAKING,
					error: false
				},
				{
					itemId: eventItemId(event),
					role: 'agent',
					text: cleanText(event.delta),
					append: true,
					isFinal: false
				}
			);
		case 'response.output_audio_transcript.done':
			return upsertTranscript(
				{
					...state,
					status: VOICE_CALL_STATUS.AGENT_SPEAKING,
					error: false
				},
				{
					itemId: eventItemId(event),
					role: 'agent',
					text: cleanText(event.transcript),
					append: false,
					isFinal: true
				}
			);
		case 'conversation.item.input_audio_transcription.delta':
			return upsertTranscript(state, {
				itemId: eventItemId(event),
				role: 'caller',
				text: cleanText(event.delta),
				append: true,
				isFinal: false
			});
		case 'conversation.item.input_audio_transcription.completed':
			return upsertTranscript(state, {
				itemId: eventItemId(event),
				role: 'caller',
				text: cleanText(event.transcript),
				append: false,
				isFinal: true
			});
		case 'response.output_item.added':
		case 'response.output_item.done': {
			if (event?.item?.type !== 'function_call') {
				if (event?.item?.type !== 'message') return state;
				return upsertTranscript(state, {
					itemId: eventItemId(event),
					role: 'agent',
					text: '',
					append: false,
					isFinal: false
				});
			}
			return {
				...state,
				status: VOICE_CALL_STATUS.USING_TOOL,
				activeToolName: voiceToolNameFromEvent(event),
				error: false
			};
		}
		case 'response.function_call_arguments.delta':
		case 'response.function_call_arguments.done':
			return {
				...state,
				status: VOICE_CALL_STATUS.USING_TOOL,
				error: false
			};
		case 'response.done':
			return {
				...state,
				status: VOICE_CALL_STATUS.LISTENING,
				activeToolName: '',
				error: false
			};
		case 'error':
			return {
				...state,
				status: VOICE_CALL_STATUS.ERROR,
				activeToolName: '',
				error: true
			};
		default:
			return state;
	}
}

export function orderedVoiceTranscripts(state) {
	if (!state?.transcriptOrder || !state?.transcriptsById) return [];
	return state.transcriptOrder
		.map((itemId) => state.transcriptsById[itemId])
		.filter((entry) => entry?.text);
}
