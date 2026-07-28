const INTERACTIVE_VOICE_HISTORY_TYPES = new Set([
	'custom_button',
	'stripe_billing',
	'support_escalation'
]);

/**
 * Add a finalized Realtime transcript to the same canonical history used by
 * text-chat callbacks and persistence. Repeated final events for the same
 * Realtime item update the existing turn rather than duplicating it.
 */
export function upsertVoiceTranscriptHistory(
	history,
	itemIndices,
	transcript
) {
	const currentHistory = Array.isArray(history) ? history : [];
	const currentIndices =
		itemIndices &&
		typeof itemIndices === 'object' &&
		!Array.isArray(itemIndices)
			? itemIndices
			: {};
	const itemId =
		typeof transcript?.itemId === 'string'
			? transcript.itemId.trim()
			: '';
	const text =
		typeof transcript?.text === 'string' ? transcript.text : '';
	const role =
		transcript?.role === 'caller'
			? 'user'
			: transcript?.role === 'agent'
				? 'assistant'
				: null;

	if (!itemId || !text.trim() || !role) {
		return {
			history: currentHistory,
			itemIndices: currentIndices
		};
	}

	const entry = { role, message: text };
	const existingIndex = currentIndices[itemId];
	if (
		Number.isInteger(existingIndex) &&
		existingIndex >= 0 &&
		existingIndex < currentHistory.length
	) {
		const nextHistory = [...currentHistory];
		nextHistory[existingIndex] = entry;
		return {
			history: nextHistory,
			itemIndices: currentIndices
		};
	}

	const nextIndex = currentHistory.length;
	return {
		history: [...currentHistory, entry],
		itemIndices: {
			...currentIndices,
			[itemId]: nextIndex
		}
	};
}

function isInteractiveHistoryMessage(message) {
	if (!message || typeof message !== 'object') return false;
	if (INTERACTIVE_VOICE_HISTORY_TYPES.has(message.type)) return true;
	if (message.schedulerEmbed) return true;
	if (message.stripeBilling) return true;
	if (message.customButton) return true;
	return false;
}

function hasUserEngagement(messages) {
	for (const key of Object.keys(messages)) {
		const message = messages[key];
		if (!message || typeof message !== 'object') continue;
		if (message.loading) continue;
		if (message.variant === 'user') {
			const text =
				typeof message.message === 'string'
					? message.message.trim()
					: '';
			if (text) return true;
		}
		if (isInteractiveHistoryMessage(message)) return true;
	}
	return false;
}

/**
 * Snapshot chat messages into voice-call history items so a resumed
 * conversation stays visible while live transcripts append below.
 *
 * Fresh chats that only have the static widget greeting are omitted so
 * the realtime model greeting can be the first transcript.
 */
export function buildVoiceCallHistoryItems(messages) {
	if (!messages || typeof messages !== 'object' || Array.isArray(messages)) {
		return [];
	}

	// No prior user turns yet — don't seed voice with labels.firstMessage.
	if (!hasUserEngagement(messages)) {
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
			text: message.message,
			message
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

/**
 * Queue a client_action until the next agent transcript (spoken handoff
 * after the tool) so the card is not inserted between prompt and reply.
 */
export function queuePendingVoiceAction(previous, message) {
	if (!message?.id) return Array.isArray(previous) ? previous : [];
	const list = Array.isArray(previous) ? previous : [];
	const existing = list.findIndex((entry) => entry.id === message.id);
	if (existing >= 0) {
		const next = [...list];
		next[existing] = message;
		return next;
	}
	return [...list, message];
}

/**
 * Attach queued client_actions after a transcript item id.
 * Returns `{ actions, pending: [] }` when flushed.
 */
export function flushPendingVoiceActions(actionEntries, pendingMessages, afterItemId) {
	const actions = Array.isArray(actionEntries) ? actionEntries : [];
	const pending = Array.isArray(pendingMessages) ? pendingMessages : [];
	if (!pending.length) {
		return { actions, pending: [] };
	}

	let next = actions;
	for (const message of pending) {
		if (!message?.id) continue;
		const existing = next.find((entry) => entry.id === message.id);
		if (existing) {
			next = next.map((entry) =>
				entry.id === message.id
					? {
							...entry,
							message,
							afterItemId: afterItemId ?? entry.afterItemId ?? null
						}
					: entry
			);
			continue;
		}
		next = [
			...next,
			{
				id: message.id,
				message,
				afterItemId: afterItemId ?? null
			}
		];
	}
	return { actions: next, pending: [] };
}
