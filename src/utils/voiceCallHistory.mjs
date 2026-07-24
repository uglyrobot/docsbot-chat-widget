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

/**
 * Merge live voice transcripts with tool cards so cards stay anchored to
 * the turn when the tool ran. Later speech must render after the card.
 *
 * Each action entry should include `afterItemId`: the transcript item id
 * that was latest when the client_action arrived (or null if none yet).
 */
export function interleaveVoiceLiveItems(transcripts, actionEntries) {
	const transcriptList = Array.isArray(transcripts) ? transcripts : [];
	const actions = Array.isArray(actionEntries)
		? actionEntries.filter((entry) => entry?.id && entry?.message)
		: [];
	if (!actions.length) {
		return transcriptList.map((entry) => ({
			kind: 'transcript',
			id: entry.itemId,
			transcript: entry
		}));
	}

	const remaining = [...actions];
	const takeAfter = (itemId) => {
		const matched = [];
		for (let index = remaining.length - 1; index >= 0; index -= 1) {
			const anchor = remaining[index].afterItemId ?? null;
			if (anchor === itemId) {
				matched.unshift(remaining.splice(index, 1)[0]);
			}
		}
		return matched.map((entry) => ({
			kind: 'action',
			id: entry.id,
			message: entry.message
		}));
	};

	const items = [...takeAfter(null)];
	for (const entry of transcriptList) {
		items.push({
			kind: 'transcript',
			id: entry.itemId,
			transcript: entry
		});
		items.push(...takeAfter(entry.itemId));
	}

	// Orphaned anchors (rare) still render rather than dropping the card.
	for (const entry of remaining) {
		items.push({
			kind: 'action',
			id: entry.id,
			message: entry.message
		});
	}
	return items;
}
