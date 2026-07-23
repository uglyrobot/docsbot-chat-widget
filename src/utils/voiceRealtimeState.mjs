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
