/**
 * Pending flag so DocsBotAI.startVoiceCall() can open the floating widget
 * and still start voice after Chatbot mounts (open completes before React commit).
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
