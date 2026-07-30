/**
 * Pending flag so DocsBotAI.startVoiceCall() can open the floating panel
 * (or target an always-mounted embed Chatbot) and still start voice after
 * Chatbot mounts — open completes before React commit on the floating path.
 */

let pendingStartVoiceCall = false;

export function markPendingStartVoiceCall() {
	pendingStartVoiceCall = true;
}

export function clearPendingStartVoiceCall() {
	pendingStartVoiceCall = false;
}

/** Returns true once if a start was requested and not yet consumed. */
export function takePendingStartVoiceCall() {
	if (!pendingStartVoiceCall) return false;
	pendingStartVoiceCall = false;
	return true;
}

export function hasPendingStartVoiceCall() {
	return pendingStartVoiceCall;
}
