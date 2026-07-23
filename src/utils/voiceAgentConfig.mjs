/**
 * Voice calls are a paid, server-configured capability. Keep this check narrow so
 * legacy `useAudioUpload` and client-side widget overrides cannot enable Realtime.
 *
 * Expected public widget API field: `useVoiceAgent: true`.
 */
export function isVoiceAgentCallEnabled(widgetApiConfig) {
	return widgetApiConfig?.useVoiceAgent === true;
}
