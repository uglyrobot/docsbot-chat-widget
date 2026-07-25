import { VOICE_CALL_STATUS } from '../../utils/voiceRealtimeState.mjs';

const ORB_PRESENTATION = {
	[VOICE_CALL_STATUS.CONNECTING]: { orbState: 'working', speed: 0.68 },
	[VOICE_CALL_STATUS.LISTENING]: { orbState: 'working', speed: 0.72 },
	[VOICE_CALL_STATUS.USER_SPEAKING]: { orbState: 'listening', speed: 1.25 },
	[VOICE_CALL_STATUS.THINKING]: { orbState: 'solving', speed: 0.9 },
	// Default tool wait (skills, stripe, booking, etc.) uses solving.
	[VOICE_CALL_STATUS.USING_TOOL]: { orbState: 'solving', speed: 1.05 },
	[VOICE_CALL_STATUS.AGENT_SPEAKING]: { orbState: 'composing', speed: 1.35 },
	[VOICE_CALL_STATUS.ERROR]: {
		orbState: 'shaping',
		speed: 0.12,
		color: '#dc2626'
	},
	[VOICE_CALL_STATUS.ENDED]: {
		orbState: 'shaping',
		speed: 0.12,
		color: '#64748b'
	}
};

const SEARCH_TOOL_ORB = { orbState: 'searching', speed: 1.05 };

/** Docs / web retrieval tools — use the searching orb; skills use solving. */
export function isVoiceSearchToolName(name) {
	if (typeof name !== 'string' || !name) return false;
	return (
		name === 'search_documentation' ||
		name === 'web_search' ||
		name === 'web_search_call' ||
		name === 'web_search_preview'
	);
}

export function voiceOrbPresentation(status, toolName = '') {
	if (
		status === VOICE_CALL_STATUS.USING_TOOL &&
		isVoiceSearchToolName(toolName)
	) {
		return SEARCH_TOOL_ORB;
	}
	return (
		ORB_PRESENTATION[status] ||
		ORB_PRESENTATION[VOICE_CALL_STATUS.CONNECTING]
	);
}
