import { sanitizeExternalActionUrl } from './externalActionUrl.mjs';

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
		// Realtime fires response.done when the model *requests* a tool, not
		// when execution finishes. Keep call ids here until function_call_output.
		pendingToolCallIds: [],
		// WebRTC audio keeps playing after response.done, so track the real
		// playback window via output_audio_buffer.* instead of transcript end.
		agentAudioPlaying: false,
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

function pendingToolCallIds(state) {
	return Array.isArray(state?.pendingToolCallIds)
		? state.pendingToolCallIds
		: [];
}

function functionCallId(item) {
	if (!item || typeof item !== 'object') return '';
	const callId =
		(typeof item.call_id === 'string' && item.call_id.trim()) ||
		(typeof item.id === 'string' && item.id.trim()) ||
		'';
	return callId.length <= 128 ? callId : '';
}

function withPendingToolCall(state, callId, toolName) {
	const pending = [...pendingToolCallIds(state)];
	if (callId && !pending.includes(callId)) {
		pending.push(callId);
	}
	return {
		...state,
		pendingToolCallIds: pending,
		status: VOICE_CALL_STATUS.USING_TOOL,
		activeToolName: toolName || state.activeToolName || '',
		error: false
	};
}

function withoutPendingToolCall(state, callId) {
	const current = pendingToolCallIds(state);
	let pending = callId
		? current.filter((id) => id !== callId)
		: [];
	// If the output's call_id did not match (id vs call_id drift), still leave
	// tool-wait once we know an output landed.
	if (callId && pending.length === current.length && current.length > 0) {
		pending = [];
	}
	const stillWaiting = pending.length > 0;
	return {
		...state,
		pendingToolCallIds: pending,
		status: stillWaiting
			? VOICE_CALL_STATUS.USING_TOOL
			: VOICE_CALL_STATUS.THINKING,
		activeToolName: stillWaiting ? state.activeToolName || '' : '',
		error: false
	};
}

export function isAwaitingVoiceToolResult(state) {
	return pendingToolCallIds(state).length > 0;
}

/** Status to settle on once the agent stops speaking. */
function idleStatusAfterSpeech(state) {
	return isAwaitingVoiceToolResult(state)
		? VOICE_CALL_STATUS.USING_TOOL
		: VOICE_CALL_STATUS.LISTENING;
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

function sanitizeVoiceToolName(name) {
	const trimmed = typeof name === 'string' ? name.trim() : '';
	if (!trimmed || trimmed.length > 128 || !/^[a-zA-Z0-9_.:-]+$/.test(trimmed)) {
		return '';
	}
	return trimmed;
}

/** Match text-chat `docsbot_tool_call` detail.data parsing. */
function parseVoiceToolCallData(params) {
	if (params == null) return null;
	if (typeof params === 'string') {
		try {
			return JSON.parse(params);
		} catch {
			return params;
		}
	}
	return typeof params === 'object' ? params : null;
}

export function voiceToolNameFromEvent(event) {
	const isToolItem =
		(event?.type === 'response.output_item.added' ||
			event?.type === 'response.output_item.done') &&
		event?.item?.type === 'function_call';
	if (!isToolItem) return '';
	return sanitizeVoiceToolName(event.item.name);
}

/**
 * Public-equivalent of chat-agent SSE `tool_call` for Realtime voice.
 * Returns `{ callId, name, data }` when a tool invocation is ready to expose,
 * or null. Callers should dedupe by `callId`.
 *
 * Prefers complete args: fires on `output_item.done`, on `output_item.added`
 * only when `arguments` is already present, and on `function_call_arguments.done`
 * when a safe tool name is available.
 */
export function voiceToolCallFromEvent(event) {
	if (!event || typeof event.type !== 'string') return null;

	if (
		(event.type === 'response.output_item.added' ||
			event.type === 'response.output_item.done') &&
		event.item?.type === 'function_call'
	) {
		const name = sanitizeVoiceToolName(event.item.name);
		if (!name) return null;
		const argsRaw = event.item.arguments;
		const hasArgs = typeof argsRaw === 'string';
		// Wait for streamed args unless the item already carries them (or is done).
		if (event.type === 'response.output_item.added' && !hasArgs) {
			return null;
		}
		const callId = functionCallId(event.item) || name;
		return {
			callId,
			name,
			data: hasArgs ? parseVoiceToolCallData(argsRaw) : null
		};
	}

	if (event.type === 'response.function_call_arguments.done') {
		const name = sanitizeVoiceToolName(event.name);
		if (!name) return null;
		const callId =
			(typeof event.call_id === 'string' && event.call_id.trim()) ||
			(typeof event.item_id === 'string' && event.item_id.trim()) ||
			name;
		return {
			callId: callId.length <= 128 ? callId : name,
			name,
			data: parseVoiceToolCallData(event.arguments)
		};
	}

	return null;
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
const MAX_LOOKUP_SOURCES = 12;
const MAX_LOOKUP_SOURCE_TITLE = 300;
const MAX_LOOKUP_SOURCE_URL = 2048;
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
	// Voice confirmation is spoken by the model; UI only needs the calendar.
	// Do not require message / voice_message (no longer sent on voice client_action).
	const eventPath = clampClientActionText(
		action.eventPath,
		MAX_CLIENT_ACTION_PATH
	);
	if (!eventPath) return null;
	const message = clampClientActionText(
		action.message || action.voice_message,
		MAX_CLIENT_ACTION_TEXT
	);
	return {
		kind: 'booking',
		callId,
		type: action.type,
		message: message || '',
		eventPath,
		hideEventDetails: Boolean(action.hideEventDetails),
		hideCookieBanner: Boolean(action.hideCookieBanner),
		hideEventDetail: Boolean(action.hideEventDetail)
	};
}

function sanitizeCustomButtonClientAction(action, callId) {
	// Voice confirmation is spoken by the model; UI only needs the CTA.
	// Do not require message / voice_message (no longer sent on voice client_action).
	const buttonText = clampClientActionText(
		action.buttonText,
		MAX_CLIENT_ACTION_BUTTON
	);
	const functionKey = clampClientActionText(
		action.functionKey,
		MAX_CLIENT_ACTION_KEY
	);
	const url = sanitizeExternalActionUrl(
		clampClientActionText(action.url, MAX_CLIENT_ACTION_URL)
	);
	if (!buttonText || (!url && !functionKey)) return null;
	const message = clampClientActionText(
		action.message || action.voice_message,
		MAX_CLIENT_ACTION_TEXT
	);
	return {
		kind: 'custom_button',
		callId,
		type: 'custom_button',
		message: message || '',
		url,
		functionKey,
		buttonText
	};
}

function sanitizeSupportEscalationClientAction(action, callId) {
	// Voice confirmation is spoken by the model; UI only needs Yes/No labels.
	// Do not require message / voice_message (no longer sent on voice client_action).
	const yes = clampClientActionText(
		action.responses?.yes,
		MAX_CLIENT_ACTION_BUTTON
	);
	const no = clampClientActionText(
		action.responses?.no,
		MAX_CLIENT_ACTION_BUTTON
	);
	if (!yes || !no) return null;
	const message = clampClientActionText(
		action.message || action.voice_message,
		MAX_CLIENT_ACTION_TEXT
	);
	return {
		kind: 'support_escalation',
		callId,
		type: 'support_escalation',
		message: message || '',
		responses: { yes, no }
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

function sanitizeLookupSource(source) {
	if (!source || typeof source !== 'object' || Array.isArray(source)) {
		return null;
	}
	const title = clampClientActionText(source.title, MAX_LOOKUP_SOURCE_TITLE);
	const url = clampClientActionText(source.url, MAX_LOOKUP_SOURCE_URL);
	const type = clampClientActionText(source.type, MAX_CLIENT_ACTION_KEY);
	if (!title && !url) return null;
	const sanitized = {};
	if (title) sanitized.title = title;
	if (url) sanitized.url = url;
	if (type) sanitized.type = type;
	if (source.page != null && Number.isFinite(Number(source.page))) {
		sanitized.page = Number(source.page);
	}
	return sanitized;
}

function sanitizeLookupAnswerClientAction(action, callId) {
	if (!Array.isArray(action.sources) || !action.sources.length) {
		return null;
	}
	const sources = [];
	for (const source of action.sources.slice(0, MAX_LOOKUP_SOURCES)) {
		const sanitized = sanitizeLookupSource(source);
		if (sanitized) sources.push(sanitized);
	}
	if (!sources.length) return null;
	const message = clampClientActionText(
		action.message || action.voice_message,
		MAX_CLIENT_ACTION_TEXT
	);
	return {
		kind: 'lookup_answer',
		callId,
		type: 'lookup_answer',
		message,
		sources
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
	if (type === 'lookup_answer') {
		return sanitizeLookupAnswerClientAction(action, callId);
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
					pendingToolCallIds: [],
					activeToolName: '',
					agentAudioPlaying: false,
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
			return {
				...state,
				status: VOICE_CALL_STATUS.THINKING,
				error: false
			};
		case 'response.created':
			// A follow-up response after tools should not flash "Thinking…"
			// while we are still waiting on tool execution.
			if (isAwaitingVoiceToolResult(state)) {
				return {
					...state,
					status: VOICE_CALL_STATUS.USING_TOOL,
					error: false
				};
			}
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
					agentAudioPlaying: true,
					// Long tool waits can include spoken progress updates.
					// Keep pending tools so we return to USING_TOOL afterward.
					...(isAwaitingVoiceToolResult(state)
						? {}
						: {
								pendingToolCallIds: [],
								activeToolName: ''
							}),
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
					agentAudioPlaying: true,
					...(isAwaitingVoiceToolResult(state)
						? {}
						: {
								pendingToolCallIds: [],
								activeToolName: ''
							}),
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
		case 'output_audio_buffer.started':
			return {
				...state,
				status: VOICE_CALL_STATUS.AGENT_SPEAKING,
				agentAudioPlaying: true,
				error: false
			};
		case 'output_audio_buffer.stopped':
		case 'output_audio_buffer.cleared':
			return {
				...state,
				agentAudioPlaying: false,
				status: idleStatusAfterSpeech(state),
				...(isAwaitingVoiceToolResult(state)
					? {}
					: { activeToolName: '' }),
				error: false
			};
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
		case 'conversation.item.created':
		case 'conversation.item.done': {
			const item = event.item;
			if (item?.type === 'function_call_output') {
				return withoutPendingToolCall(state, functionCallId(item));
			}
			return state;
		}
		case 'response.output_item.added':
		case 'response.output_item.done': {
			if (event?.item?.type === 'function_call') {
				return withPendingToolCall(
					state,
					functionCallId(event.item),
					voiceToolNameFromEvent(event)
				);
			}
			if (event?.item?.type !== 'message') return state;
			return upsertTranscript(state, {
				itemId: eventItemId(event),
				role: 'agent',
				text: '',
				append: false,
				isFinal: false
			});
		}
		case 'response.function_call_arguments.delta':
		case 'response.function_call_arguments.done':
			return {
				...state,
				status: VOICE_CALL_STATUS.USING_TOOL,
				error: false
			};
		case 'response.done':
			// Keep USING_TOOL across the server-side tool wait. response.done
			// here only means the model finished *requesting* the tool.
			if (isAwaitingVoiceToolResult(state)) {
				return {
					...state,
					// Spoken progress may still be draining from the buffer.
					status: state.agentAudioPlaying
						? VOICE_CALL_STATUS.AGENT_SPEAKING
						: VOICE_CALL_STATUS.USING_TOOL,
					error: false
				};
			}
			// WebRTC audio often continues after response.done; stay on the
			// speaking orb until output_audio_buffer.stopped.
			if (state.agentAudioPlaying) {
				return {
					...state,
					status: VOICE_CALL_STATUS.AGENT_SPEAKING,
					activeToolName: '',
					error: false
				};
			}
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
				pendingToolCallIds: [],
				activeToolName: '',
				agentAudioPlaying: false,
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

/**
 * Insert a local (non-Realtime) final transcript, e.g. UI decline replies.
 */
export function appendLocalVoiceTranscript(state, { role, text, itemId }) {
	const trimmed = typeof text === 'string' ? text.trim() : '';
	const id =
		typeof itemId === 'string' && itemId.trim()
			? itemId.trim()
			: `local-${role || 'caller'}-${Date.now()}`;
	if (!trimmed || (role !== 'caller' && role !== 'agent')) {
		return { state, itemId: null };
	}
	const next = upsertTranscript(state || createVoiceRealtimeState(), {
		itemId: id,
		role,
		text: trimmed,
		append: false,
		isFinal: true
	});
	return { state: next, itemId: id };
}
