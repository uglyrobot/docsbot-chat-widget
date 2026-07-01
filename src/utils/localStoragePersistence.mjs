const DEFAULT_MAX_STORAGE_VALUE_LENGTH = 1500000;
export const DEFAULT_CHAT_STORAGE_TTL_MS = 12 * 60 * 60 * 1000;

export function isStorageQuotaError(error) {
	return (
		error?.name === "QuotaExceededError" ||
		error?.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
		error?.code === 22 ||
		error?.code === 1014
	);
}

export function trimPersistedChatHistory(history) {
	if (!Array.isArray(history) || history.length <= 1) {
		return null;
	}

	return history.slice(Math.floor(history.length / 2));
}

export function trimPersistedConversationMessages(messages) {
	if (!messages || typeof messages !== "object") {
		return null;
	}

	const entries = Object.entries(messages);
	if (entries.length <= 1) {
		return null;
	}

	const sortedEntries = entries.sort(([, a], [, b]) => {
		return (a?.timestamp || 0) - (b?.timestamp || 0);
	});
	const keepCount = Math.max(1, Math.ceil(sortedEntries.length / 2));
	return Object.fromEntries(sortedEntries.slice(-keepCount));
}

export function cleanupExpiredDocsBotLocalStorage({
	storage = typeof localStorage !== "undefined" ? localStorage : null,
	now = Date.now(),
	maxAgeMs = DEFAULT_CHAT_STORAGE_TTL_MS,
	currentBotId = ""
} = {}) {
	if (!storage || typeof storage.length !== "number") return [];

	const removedKeys = [];
	const keys = getStorageKeys(storage);
	const expiredBotIds = new Set();

	for (const key of keys) {
		const match = key.match(/^DocsBot_(.+)_chatHistory$/);
		if (!match) continue;

		const botId = match[1];
		if (botId === currentBotId) continue;

		const timestamp = getLatestPersistedMessageTimestamp(
			readStorageJson(storage, key)
		);
		if (timestamp > 0 && now - timestamp > maxAgeMs) {
			expiredBotIds.add(botId);
		}
	}

	for (const botId of expiredBotIds) {
		for (const key of keys) {
			if (
				key === `DocsBot_${botId}_chatHistory` ||
				key === `DocsBot_${botId}_localChatHistory` ||
				key === `DocsBot_${botId}_conversationId` ||
				key.startsWith(`DocsBot_${botId}_piiRedactionSession_`)
			) {
				removeLocalStorageItem(storage, key);
				removedKeys.push(key);
			}
		}
	}

	for (const key of keys) {
		if (removedKeys.includes(key)) continue;
		if (!/^DocsBot_.+_piiRedactionSession_/.test(key)) continue;

		const envelope = readStorageJson(storage, key);
		if (
			typeof envelope?.updatedAt === "number" &&
			now - envelope.updatedAt > maxAgeMs
		) {
			removeLocalStorageItem(storage, key);
			removedKeys.push(key);
		}
	}

	return removedKeys;
}

export function getLatestPersistedMessageTimestamp(messages) {
	if (!messages || typeof messages !== "object") {
		return 0;
	}

	const values = Array.isArray(messages)
		? messages
		: Object.values(messages);
	return values.reduce((latest, message) => {
		const timestamp =
			typeof message?.timestamp === "number" ? message.timestamp : 0;
		return timestamp > latest ? timestamp : latest;
	}, 0);
}

export function safeSetLocalStorageJson(
	key,
	value,
	{
		storage = typeof localStorage !== "undefined" ? localStorage : null,
		trim,
		maxValueLength = DEFAULT_MAX_STORAGE_VALUE_LENGTH,
		onError = console.warn
	} = {}
) {
	if (!storage || !key) return false;

	let candidate = value;
	let warned = false;
	for (let attempt = 0; attempt < 12; attempt += 1) {
		let serialized;
		try {
			serialized = JSON.stringify(candidate);
		} catch (error) {
			onError?.("DOCSBOT: Failed to serialize chat history.", error);
			return false;
		}

		if (
			serialized.length > maxValueLength &&
			typeof trim === "function"
		) {
			const nextCandidate = trim(candidate);
			if (!nextCandidate || nextCandidate === candidate) {
				removeLocalStorageItem(storage, key);
				return false;
			}
			candidate = nextCandidate;
			continue;
		}

		try {
			storage.setItem(key, serialized);
			return true;
		} catch (error) {
			if (!isStorageQuotaError(error)) {
				onError?.("DOCSBOT: Failed to persist chat history.", error);
				return false;
			}

			if (!warned) {
				onError?.(
					"DOCSBOT: Local chat history exceeded browser storage quota; trimming persisted history.",
					error
				);
				warned = true;
			}

			if (typeof trim !== "function") {
				removeLocalStorageItem(storage, key);
				return false;
			}

			const nextCandidate = trim(candidate);
			if (!nextCandidate || nextCandidate === candidate) {
				removeLocalStorageItem(storage, key);
				return false;
			}
			candidate = nextCandidate;
		}
	}

	removeLocalStorageItem(storage, key);
	return false;
}

function removeLocalStorageItem(storage, key) {
	try {
		storage.removeItem(key);
	} catch {
		// Nothing else to do if storage is unavailable.
	}
}

function getStorageKeys(storage) {
	const keys = [];
	for (let index = 0; index < storage.length; index += 1) {
		const key = storage.key(index);
		if (typeof key === "string") {
			keys.push(key);
		}
	}
	return keys;
}

function readStorageJson(storage, key) {
	try {
		const raw = storage.getItem(key);
		return raw ? JSON.parse(raw) : null;
	} catch {
		return null;
	}
}
