const INTERACTIVE_VOICE_HISTORY_TYPES = new Set([
	'custom_button',
	'stripe_billing',
	'support_escalation'
]);

function isInteractiveHistoryMessage(message) {
	if (!message || typeof message !== 'object') return false;
	if (INTERACTIVE_VOICE_HISTORY_TYPES.has(message.type)) return true;
	if (message.schedulerEmbed) return true;
	if (message.stripeBilling) return true;
	if (message.customButton) return true;
	return false;
}

/**
 * Snapshot chat messages into voice-call history items so a resumed
 * conversation stays visible while live transcripts append below.
 */
export function buildVoiceCallHistoryItems(messages) {
	if (!messages || typeof messages !== 'object' || Array.isArray(messages)) {
		return [];
	}

	const items = [];
	for (const key of Object.keys(messages)) {
		const message = messages[key];
		if (!message || typeof message !== 'object') continue;
		if (message.loading) continue;
		if (message.type === 'lead_collect') continue;

		const id = String(message.id || key);
		if (isInteractiveHistoryMessage(message)) {
			items.push({ kind: 'action', id, message });
			continue;
		}

		const text =
			typeof message.message === 'string' ? message.message.trim() : '';
		if (!text) continue;

		items.push({
			kind: 'transcript',
			id,
			role: message.variant === 'user' ? 'caller' : 'agent',
			text: message.message
		});
	}
	return items;
}
