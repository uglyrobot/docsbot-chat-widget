/**
 * Voice calls are a paid, server-configured capability. Keep this check narrow so
 * legacy `useAudioUpload` and client-side widget overrides cannot enable Realtime
 * in production. Local dev may override via `options.useVoiceAgent` (see
 * resolveEffectiveVoiceAgentCallEnabled).
 *
 * Expected public widget API field: `useVoiceAgent: true`.
 */
export function isVoiceAgentCallEnabled(widgetApiConfig) {
	return widgetApiConfig?.useVoiceAgent === true;
}

export function resolveEffectiveVoiceAgentCallEnabled(
	apiEnabled,
	embedOption,
	{ localDev = false } = {}
) {
	if (localDev && embedOption !== undefined) {
		return embedOption === true;
	}

	return apiEnabled === true;
}
