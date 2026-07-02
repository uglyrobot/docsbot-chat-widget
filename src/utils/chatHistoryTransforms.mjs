const HISTORY_TEXT_KEYS = ["content", "message", "answer", "question"];

export async function mapChatHistoryStrings(history, mapString) {
	if (!Array.isArray(history) || typeof mapString !== "function") {
		return history;
	}

	return Promise.all(
		history.map((entry) => mapChatHistoryEntryStrings(entry, mapString))
	);
}

export function mapChatHistoryStringsSync(history, mapString) {
	if (!Array.isArray(history) || typeof mapString !== "function") {
		return history;
	}

	return history.map((entry) =>
		mapChatHistoryEntryStringsSync(entry, mapString)
	);
}

async function mapChatHistoryEntryStrings(entry, mapString) {
	if (typeof entry === "string") {
		return mapString(entry);
	}
	if (Array.isArray(entry)) {
		return Promise.all(
			entry.map((item) => mapChatHistoryEntryStrings(item, mapString))
		);
	}
	if (!entry || typeof entry !== "object") {
		return entry;
	}

	const nextEntry = { ...entry };
	for (const key of HISTORY_TEXT_KEYS) {
		if (typeof nextEntry[key] === "string") {
			nextEntry[key] = await mapString(nextEntry[key]);
		}
	}
	return nextEntry;
}

function mapChatHistoryEntryStringsSync(entry, mapString) {
	if (typeof entry === "string") {
		return mapString(entry);
	}
	if (Array.isArray(entry)) {
		return entry.map((item) =>
			mapChatHistoryEntryStringsSync(item, mapString)
		);
	}
	if (!entry || typeof entry !== "object") {
		return entry;
	}

	const nextEntry = { ...entry };
	for (const key of HISTORY_TEXT_KEYS) {
		if (typeof nextEntry[key] === "string") {
			nextEntry[key] = mapString(nextEntry[key]);
		}
	}
	return nextEntry;
}
