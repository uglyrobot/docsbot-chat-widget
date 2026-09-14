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

// Finish interrupted messages without losing text already received.
export function stopResponseMessages(messages) {
	return Object.fromEntries(
		Object.entries(messages || {}).flatMap(([id, message]) => {
			if (!message.loading && !message.streaming) return [[id, message]];
			if (message.variant === 'chatbot' && !message.message) return [];
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
