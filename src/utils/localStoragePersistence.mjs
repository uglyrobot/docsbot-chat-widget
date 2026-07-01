const DEFAULT_MAX_STORAGE_VALUE_LENGTH = 1500000;

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

export function safeSetLocalStorageJson(
	key,
	value,
	{
		storage = typeof localStorage !== "undefined" ? localStorage : null,
		trim,
		maxValueLength = DEFAULT_MAX_STORAGE_VALUE_LENGTH,
		storageLabel = "chat history",
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
			onError?.(`DOCSBOT: Failed to serialize ${storageLabel}.`, error);
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
				onError?.(`DOCSBOT: Failed to persist ${storageLabel}.`, error);
				return false;
			}

			if (!warned) {
				onError?.(
					`DOCSBOT: Local ${storageLabel} exceeded browser storage quota; trimming persisted data.`,
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
