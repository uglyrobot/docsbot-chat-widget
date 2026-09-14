const INTERACTIVE_VOICE_HISTORY_TYPES = new Set([
	'custom_button',
	'stripe_billing',
	'support_escalation',
	// Sources-only handoff; may have empty message text (spoken in transcript).
	'lookup_answer'
]);

function isAttachableVoiceAction(message) {
	if (!message || typeof message !== 'object') return false;
	if (message.variant === 'user') return false;
	const id = typeof message.id === 'string' ? message.id : '';
	// Live and hangup grouping is by row, not by card type, so a new
	// `voice-action-*` client_action does not need a hangup special case.
	if (id.startsWith('voice-action-')) return true;
	if (INTERACTIVE_VOICE_HISTORY_TYPES.has(message.type)) return true;
	if (message.schedulerEmbed) return true;
	if (message.stripeBilling) return true;
	if (message.customButton) return true;
	return false;
}

/**
 * Where a Realtime transcript item should land in finalized chatHistory.
 * Prefer the first already-finalized item that follows it in transcriptOrder
 * (so a late caller final inserts before an earlier-completed agent turn).
 */
function voiceHistoryInsertIndex(
	itemId,
	transcriptOrder,
	itemIndices,
	historyLength
) {
	if (!Array.isArray(transcriptOrder) || !transcriptOrder.length) {
		return historyLength;
	}
	const orderIndex = transcriptOrder.indexOf(itemId);
	if (orderIndex < 0) {
		return historyLength;
	}

	for (let i = orderIndex + 1; i < transcriptOrder.length; i++) {
		const laterIndex = itemIndices[transcriptOrder[i]];
		if (
			Number.isInteger(laterIndex) &&
			laterIndex >= 0 &&
			laterIndex < historyLength
		) {
			return laterIndex;
		}
	}

	for (let i = orderIndex - 1; i >= 0; i--) {
		const earlierIndex = itemIndices[transcriptOrder[i]];
		if (
			Number.isInteger(earlierIndex) &&
			earlierIndex >= 0 &&
			earlierIndex < historyLength
		) {
			return earlierIndex + 1;
		}
	}

	return historyLength;
}

function shiftVoiceHistoryIndices(itemIndices, insertAt) {
	const next = {};
	for (const [id, index] of Object.entries(itemIndices)) {
		next[id] =
			Number.isInteger(index) && index >= insertAt ? index + 1 : index;
	}
	return next;
}

/**
 * Add a finalized Realtime transcript to the same canonical history used by
 * text-chat callbacks and persistence. Repeated final events for the same
 * Realtime item update the existing turn rather than duplicating it.
 *
 * New turns insert by Realtime `transcriptOrder` when provided, so a late
 * caller transcription does not append after the agent reply it preceded.
 */
export function upsertVoiceTranscriptHistory(
	history,
	itemIndices,
	transcript,
	transcriptOrder
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

	const nextIndex = voiceHistoryInsertIndex(
		itemId,
		transcriptOrder,
		currentIndices,
		currentHistory.length
	);
	const nextHistory = [
		...currentHistory.slice(0, nextIndex),
		entry,
		...currentHistory.slice(nextIndex)
	];
	return {
		history: nextHistory,
		itemIndices: {
			...shiftVoiceHistoryIndices(currentIndices, nextIndex),
			[itemId]: nextIndex
		}
	};
}

/**
 * Insert or update a voice transcript bubble in chat `messages` using the
 * same Realtime item order as live captions / chatHistory.
 */
export function upsertVoiceTranscriptMessageMap(
	messages,
	{ messageId, payload, itemId, transcriptOrder }
) {
	const current =
		messages && typeof messages === 'object' && !Array.isArray(messages)
			? messages
			: {};
	const id = typeof messageId === 'string' ? messageId.trim() : '';
	if (!id || !payload || typeof payload !== 'object') {
		return current;
	}

	if (current[id]) {
		return {
			...current,
			[id]: {
				...current[id],
				...payload
			}
		};
	}

	const order = Array.isArray(transcriptOrder) ? transcriptOrder : [];
	const realtimeId =
		typeof itemId === 'string' && itemId.trim() ? itemId.trim() : '';
	let insertBeforeKey = null;
	if (realtimeId && order.length) {
		const orderIndex = order.indexOf(realtimeId);
		if (orderIndex >= 0) {
			for (let i = orderIndex + 1; i < order.length; i++) {
				const laterKey = `voice-${order[i]}`;
				if (current[laterKey]) {
					insertBeforeKey = laterKey;
					break;
				}
			}
		}
	}

	if (!insertBeforeKey) {
		return {
			...current,
			[id]: payload
		};
	}

	const next = {};
	let inserted = false;
	for (const key of Object.keys(current)) {
		if (key === insertBeforeKey) {
			next[id] = payload;
			inserted = true;
		}
		next[key] = current[key];
	}
	if (!inserted) {
		next[id] = payload;
	}
	return next;
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
		const messageText =
			typeof message.message === 'string' ? message.message.trim() : '';
		// Text chat stores the complete answer and its sources on the same
		// lookup_answer row. Only voice tool attachments are standalone rows.
		if (messageText && message.voiceCall !== true) {
			continue;
		}

		const requireVoiceCall = message.voiceCall === true;
		let targetKey = null;
		for (let j = i + 1; j < keys.length; j++) {
			const candidate = messages[keys[j]];
			if (!candidate || typeof candidate !== 'object') continue;
			if (candidate.variant === 'user') break;
			if (requireVoiceCall && candidate.voiceCall !== true) continue;
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
				if (requireVoiceCall && candidate.voiceCall !== true) continue;
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

function liveTranscriptPayload(entry) {
	return {
		id: `voice-${entry.itemId}`,
		variant: entry.role === 'caller' ? 'user' : 'chatbot',
		message: entry.text,
		realtimeItemId: entry.itemId
	};
}

/**
 * Copy live voice source grouping onto finalized transcripts so hangup
 * chat history matches the in-call transcript instead of dumping leftover
 * lookup sources onto the first agent turn.
 */
export function finalizeVoiceTranscriptsWithSources(transcripts, actionEntries) {
	const list = Array.isArray(transcripts) ? transcripts : [];
	const transcriptOrder = list.map((entry) => entry.itemId).filter(Boolean);
	const liveItems = interleaveVoiceLiveItems(list, actionEntries);
	const groups = composeVoiceConversationGroups(
		liveItems.map((entry) =>
			entry.kind === 'action'
				? { id: entry.id, message: entry.message }
				: {
						id: entry.id,
						message: liveTranscriptPayload(entry.transcript)
					}
		)
	);

	const finalized = [];
	let heldSources = null;
	for (const group of groups) {
		const message = group.message;
		const itemId =
			typeof message?.realtimeItemId === 'string'
				? message.realtimeItemId
				: '';
		const isSpokenTranscript =
			Boolean(itemId) && message.type !== 'lookup_answer';
		const groupSources =
			Array.isArray(message?.sources) && message.sources.length
				? message.sources
				: null;

		if (isSpokenTranscript) {
			const role = message.variant === 'user' ? 'caller' : 'agent';
			const sources =
				role === 'agent' ? groupSources || heldSources : null;
			if (role === 'agent') heldSources = null;
			finalized.push({
				itemId,
				role,
				text: typeof message.message === 'string' ? message.message : '',
				...(sources ? { sources } : {}),
				transcriptOrder
			});
			continue;
		}

		if (message?.type === 'lookup_answer' && groupSources) {
			heldSources = groupSources;
		}
	}

	if (heldSources) {
		for (let i = finalized.length - 1; i >= 0; i -= 1) {
			if (finalized[i].role === 'agent') {
				finalized[i] = { ...finalized[i], sources: heldSources };
				break;
			}
		}
	}

	return finalized;
}

export function queuePendingVoiceLookupSources(pending, entry) {
	const list = Array.isArray(pending) ? pending : [];
	const callId = typeof entry?.callId === 'string' ? entry.callId.trim() : '';
	const sources = Array.isArray(entry?.sources) ? entry.sources : [];
	if (!callId || !sources.length) return list;
	const next = list.filter((item) => item.callId !== callId);
	const afterRole =
		entry.afterRole === 'caller' || entry.afterRole === 'agent'
			? entry.afterRole
			: null;
	const afterItemId =
		typeof entry.afterItemId === 'string' && entry.afterItemId.trim()
			? entry.afterItemId.trim()
			: null;
	next.push({ callId, sources, afterItemId, afterRole });
	return next;
}

function pendingLookupBelongsOnAgent(
	entry,
	{ itemId, itemIndex, transcriptOrder }
) {
	if (entry.afterItemId === itemId) return true;
	if (entry.afterRole === 'agent') return false;
	if (itemIndex < 0) return false;
	const afterIndex = entry.afterItemId
		? transcriptOrder.indexOf(entry.afterItemId)
		: -1;
	if (entry.afterItemId && afterIndex < 0) return false;
	return itemIndex > afterIndex;
}

/**
 * Take only the lookup sources that belong on this agent turn. Hangup
 * replays every transcript in order, so dumping all pending sources onto
 * the first agent bubble would move them off the answer they were shown on.
 */
export function takePendingVoiceLookupSourcesForAgent(
	pending,
	{ itemId, transcriptOrder }
) {
	const list = Array.isArray(pending) ? pending : [];
	const id = typeof itemId === 'string' ? itemId.trim() : '';
	if (!id) return { sources: null, pending: list };
	const order = Array.isArray(transcriptOrder) ? transcriptOrder : [];
	const itemIndex = order.indexOf(id);
	const matched = [];
	const remaining = [];
	for (const entry of list) {
		if (
			pendingLookupBelongsOnAgent(entry, {
				itemId: id,
				itemIndex,
				transcriptOrder: order
			})
		) {
			matched.push(entry);
		} else {
			remaining.push(entry);
		}
	}
	if (!matched.length) return { sources: null, pending: list };
	const sources = [];
	for (const entry of matched) {
		if (Array.isArray(entry.sources)) sources.push(...entry.sources);
	}
	return {
		sources: sources.length ? sources : null,
		pending: remaining
	};
}

function liveItemMessageKey(item) {
	if (!item) return '';
	if (item.kind === 'transcript') {
		return item.id ? `voice-${item.id}` : '';
	}
	return item.id ? String(item.id) : '';
}

/**
 * After hangup, GPT-Live transcripts are inserted into chat history after
 * any cards that were added mid-call. Rebuild the map so escalation,
 * booking, Stripe, and custom-button cards stay on the turn they were
 * shown on in the live transcript instead of sitting under the greeting.
 */
export function orderVoiceHangupMessages(messages, transcripts, actionEntries) {
	const current =
		messages && typeof messages === 'object' && !Array.isArray(messages)
			? { ...messages }
			: {};
	for (const entry of Array.isArray(actionEntries) ? actionEntries : []) {
		if (
			!entry?.id ||
			!entry?.message ||
			typeof entry.message !== 'object'
		) {
			continue;
		}
		if (entry.message.type === 'lookup_answer') continue;
		if (!current[entry.id]) current[entry.id] = entry.message;
	}
	const liveItems = interleaveVoiceLiveItems(transcripts, actionEntries);
	const liveKeys = [];
	const liveKeySet = new Set();
	for (const item of liveItems) {
		const key = liveItemMessageKey(item);
		if (!key || liveKeySet.has(key)) continue;
		liveKeySet.add(key);
		liveKeys.push(key);
	}

	const ordered = {};
	for (const key of Object.keys(current)) {
		if (liveKeySet.has(key)) continue;
		ordered[key] = current[key];
	}
	for (const key of liveKeys) {
		if (current[key]) ordered[key] = current[key];
	}
	for (const key of Object.keys(current)) {
		if (ordered[key]) continue;
		ordered[key] = current[key];
	}

	const currentKeys = Object.keys(current);
	const nextKeys = Object.keys(ordered);
	if (
		currentKeys.length === nextKeys.length &&
		currentKeys.every((key, index) => key === nextKeys[index])
	) {
		return current;
	}
	return ordered;
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
