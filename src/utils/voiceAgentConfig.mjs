/**
 * Voice calls are a paid, server-configured capability by default.
 * Legacy `useAudioUpload` must not enable Realtime.
 *
 * Expected public widget API / embed option field: `useVoiceAgent: true`.
 * When `options.useVoiceAgent` is explicitly set, it overrides the bot config.
 */
export function isVoiceAgentCallEnabled(widgetApiConfig) {
	return widgetApiConfig?.useVoiceAgent === true;
}

export function resolveEffectiveVoiceAgentCallEnabled(
	apiEnabled,
	embedOption
) {
	if (embedOption !== undefined) {
		return embedOption === true;
	}

	return apiEnabled === true;
}
