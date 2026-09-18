export function sanitizeRestoredConversation(savedConversation, options = {}) {
	if (!savedConversation || typeof savedConversation !== 'object') {
		return savedConversation;
	}

	return Object.fromEntries(
		Object.entries(savedConversation).flatMap(([id, message]) => {
			if (
				!options.allowLeadCollect &&
				message &&
				typeof message === 'object' &&
				message.type === 'lead_collect'
			) {
				return [];
			}

			if (
				message &&
				typeof message === 'object' &&
				message.schedulerEmbedCompleted === true
			) {
				return [
					[
						id,
						{
							...message,
							schedulerEmbed: null
						}
					]
				];
			}

			return [[id, message]];
		})
	);
}

export function shouldShowErrorSupportButton(payload) {
	return Boolean(
		payload?.isLast &&
			payload?.error &&
			!payload?.isRateLimitError &&
			!payload?.suppressSupportButton
	);
}

export function getVisibleMessageKeys(messages) {
	return Object.keys(messages || {});
}

function isUnresolvedAudioPlaceholder(message) {
	return Boolean(
		message &&
			message.variant === 'user' &&
			message.loading &&
			message.audio
	);
}

function interruptedChatHistoryEntries(messages) {
	if (!messages || typeof messages !== 'object') return [];
	const keys = Object.keys(messages);
	let botKey = null;
	for (let i = keys.length - 1; i >= 0; i--) {
		const message = messages[keys[i]];
		if (!message || typeof message !== 'object') continue;
		if (message.variant !== 'chatbot') continue;
		if (!message.loading && !message.streaming) continue;
		botKey = keys[i];
		break;
	}
	if (!botKey) return [];

	const bot = messages[botKey];
	const botText =
		typeof bot.message === 'string' ? bot.message.trim() : '';
	const entries = [];
	const botIndex = keys.indexOf(botKey);
	for (let i = botIndex - 1; i >= 0; i--) {
		const message = messages[keys[i]];
		if (!message || message.variant !== 'user') continue;
		if (isUnresolvedAudioPlaceholder(message)) break;
		const userText =
			typeof message.message === 'string' ? message.message.trim() : '';
		if (userText) {
			entries.push({ role: 'user', message: message.message });
		}
		break;
	}
	if (botText) {
		entries.push({ role: 'assistant', message: bot.message });
	}
	return entries;
}

function historyEntryMatches(left, right) {
	return (
		left &&
		right &&
		left.role === right.role &&
		left.message === right.message
	);
}

/**
 * Non-agent WebSocket requests send `state.chatHistory`. Stopping before the
 * terminal event never received that history, so append the visible
 * interrupted turn before the input is re-enabled.
 */
export function appendInterruptedChatHistory(history, messages) {
	const current = Array.isArray(history) ? history : [];
	const entries = interruptedChatHistoryEntries(messages);
	if (!entries.length) return current;

	const last = current[current.length - 1];
	if (historyEntryMatches(last, entries[0])) {
		const rest = entries.slice(1);
		if (!rest.length) return current;
		if (historyEntryMatches(current[current.length - 1], rest[0])) {
			return current;
		}
		return [...current, ...rest];
	}
	if (historyEntryMatches(last, entries[entries.length - 1])) {
		return current;
	}
	return [...current, ...entries];
}

// Finish interrupted messages without losing text already received.
export function stopResponseMessages(messages) {
	return Object.fromEntries(
		Object.entries(messages || {}).flatMap(([id, message]) => {
			if (!message.loading && !message.streaming) return [[id, message]];
			if (message.variant === 'chatbot' && !message.message) return [];
			if (isUnresolvedAudioPlaceholder(message)) return [];
			return [
				[
					id,
					{
						...message,
						loading: false,
						streaming: false,
						agentActivity: null
					}
				]
			];
		})
	);
}
