const INTERACTIVE_VOICE_HISTORY_TYPES = new Set([
	'custom_button',
	'stripe_billing',
	'support_escalation',
	// Sources-only handoff; may have empty message text (spoken in transcript).
	'lookup_answer'
]);

function isAttachableVoiceAction(message) {
	if (!message || typeof message !== 'object') return false;
	if (INTERACTIVE_VOICE_HISTORY_TYPES.has(message.type)) return true;
	if (message.schedulerEmbed) return true;
	if (message.stripeBilling) return true;
	if (message.customButton) return true;
	return false;
}

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
	return isAttachableVoiceAction(message);
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

function isSpokenAgentMessage(message) {
	if (!message || typeof message !== 'object') return false;
	if (message.variant === 'user') return false;
	if (message.type === 'lookup_answer') return false;
	const text =
		typeof message.message === 'string' ? message.message.trim() : '';
	return message.variant === 'chatbot' && Boolean(text);
}

/**
 * Fold standalone `lookup_answer` source rows into the agent answer they
 * belong to and drop the sources-only messages.
 *
 * Voice inserts lookup rows when the tool returns (before speech), so prefer
 * the next spoken agent turn; fall back to the prior agent bubble when the
 * list is already interleaved the way the live voice UI renders it.
 *
 * @param {Record<string, object> | object} messages
 * @returns {Record<string, object> | object}
 */
export function mergeVoiceLookupSourcesIntoMessages(messages) {
	if (!messages || typeof messages !== 'object' || Array.isArray(messages)) {
		return messages;
	}

	const keys = Object.keys(messages);
	const drop = new Set();
	const sourcesByTarget = new Map();

	for (let i = 0; i < keys.length; i++) {
		const key = keys[i];
		const message = messages[key];
		if (
			!message ||
			typeof message !== 'object' ||
			message.type !== 'lookup_answer' ||
			!Array.isArray(message.sources) ||
			!message.sources.length
		) {
			continue;
		}

		let targetKey = null;
		for (let j = i + 1; j < keys.length; j++) {
			const candidate = messages[keys[j]];
			if (!candidate || typeof candidate !== 'object') continue;
			if (candidate.variant === 'user') break;
			if (isSpokenAgentMessage(candidate)) {
				targetKey = keys[j];
				break;
			}
		}
		if (!targetKey) {
			for (let j = i - 1; j >= 0; j--) {
				const candidate = messages[keys[j]];
				if (!candidate || typeof candidate !== 'object') continue;
				if (candidate.variant === 'user') break;
				if (isSpokenAgentMessage(candidate)) {
					targetKey = keys[j];
					break;
				}
			}
		}

		if (!targetKey) continue;
		sourcesByTarget.set(targetKey, message.sources);
		drop.add(key);
	}

	if (!drop.size) return messages;

	const next = {};
	for (const key of keys) {
		if (drop.has(key)) continue;
		const message = messages[key];
		next[key] = sourcesByTarget.has(key)
			? { ...message, sources: sourcesByTarget.get(key) }
			: message;
	}
	return next;
}

/**
 * Fold tool UI onto the agent turn it belongs to so the voice transcript
 * list does not insert a separate row (and flex gap) between the spoken
 * reply and its controls/sources.
 *
 * `lookup_answer` sources are merged into the previous agent bubble — the
 * same visual treatment as text chat — instead of a sources-only message.
 *
 * @param {Array<{ id: string, message: object }>} messages
 * @returns {Array<{ id: string, message: object, attachments: object[] }>}
 */
export function composeVoiceConversationGroups(messages) {
	const list = Array.isArray(messages) ? messages : [];
	const groups = [];

	for (const entry of list) {
		if (!entry?.message || typeof entry.message !== 'object') continue;
		const message = entry.message;
		const id = String(entry.id || message.id || '');
		if (!id) continue;

		const last = groups[groups.length - 1];
		const canAttachToAgent =
			Boolean(last) && last.message?.variant !== 'user';

		if (
			canAttachToAgent &&
			message.type === 'lookup_answer' &&
			Array.isArray(message.sources) &&
			message.sources.length
		) {
			// Spoken answer is already on the transcript bubble.
			last.message = {
				...last.message,
				sources: message.sources
			};
			continue;
		}

		if (canAttachToAgent && isAttachableVoiceAction(message)) {
			last.attachments.push(message);
			continue;
		}

		groups.push({ id, message, attachments: [] });
	}

	return groups;
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
